/**
 * services/payment.service.js — Payment business logic
 *
 * CHANGES FROM PHASE 1:
 * Added Prometheus metric recording for payment-specific events:
 * - paymentsTotal: tracks success/failure by payment method
 * - paymentProcessingDuration: tracks gateway simulation time
 * - paymentAmountHistogram: tracks transaction size distribution
 *
 * These are recorded here (not in middleware) because:
 * - middleware only knows HTTP-level data (method, status, latency)
 * - payment outcomes (method=card, status=success) are business logic
 * - gateway processing time is distinct from total HTTP time
 */

const Payment = require('../models/payment.model');
const logger = require('../config/logger');
const {
  paymentsTotal,
  paymentProcessingDuration,
  paymentAmountHistogram,
} = require('../config/prometheusMetrics');

const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';

const simulateGatewayDelay = () => {
  const base = parseInt(process.env.LATENCY_MS || '0', 10);
  const natural = Math.floor(Math.random() * 300) + 100;
  return new Promise((resolve) => setTimeout(resolve, base + natural));
};

const processPayment = async ({ orderId, userId, amount, currency, method }, requestId) => {
  logger.info('Processing payment', {
    service: SERVICE_NAME,
    requestId,
    orderId,
    userId,
    amount,
    currency,
  });

  const existing = await Payment.findOne({ orderId, status: 'success' });
  if (existing) {
    const err = new Error('Payment already processed for this order');
    err.statusCode = 409;
    throw err;
  }

  const payment = await Payment.create({
    orderId,
    userId,
    amount,
    currency: currency || 'USD',
    method: method || 'card',
    cardLast4: Math.floor(1000 + Math.random() * 9000).toString(),
    status: 'processing',
  });

  const gatewayStart = Date.now();
  await simulateGatewayDelay();
  const processingTime = Date.now() - gatewayStart;

  const failureRate = parseFloat(process.env.FAILURE_RATE || '0');
  const shouldFail = Math.random() * 100 < failureRate;

  if (shouldFail) {
    payment.status = 'failed';
    payment.failureReason = 'Simulated gateway rejection';
    payment.processingTime = processingTime;
    await payment.save();

    // Record failed payment in Prometheus
    paymentsTotal.inc({ status: 'failed', method: payment.method });
    paymentProcessingDuration.observe(
      { method: payment.method, status: 'failed' },
      processingTime / 1000
    );

    logger.warn('Payment failed (simulated)', {
      service: SERVICE_NAME,
      requestId,
      paymentId: payment._id,
      orderId,
      processingTime,
    });

    const err = new Error('Payment declined by gateway');
    err.statusCode = 402;
    throw err;
  }

  payment.status = 'success';
  payment.processingTime = processingTime;
  await payment.save();

  // Record successful payment in Prometheus
  paymentsTotal.inc({ status: 'success', method: payment.method });

  // Record gateway processing time
  paymentProcessingDuration.observe(
    { method: payment.method, status: 'success' },
    processingTime / 1000
  );

  // Record transaction amount distribution
  paymentAmountHistogram.observe({ method: payment.method }, amount);

  logger.info('Payment successful', {
    service: SERVICE_NAME,
    requestId,
    paymentId: payment._id,
    orderId,
    amount,
    processingTime,
  });

  return payment;
};

const getPaymentById = async (paymentId, requestId) => {
  const payment = await Payment.findById(paymentId);

  if (!payment) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }

  return payment;
};

module.exports = { processPayment, getPaymentById };
