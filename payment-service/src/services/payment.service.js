/**
 * services/payment.service.js — Payment business logic
 *
 * Simulates a real payment gateway interaction.
 * In production, this would call Stripe/Razorpay/etc.
 * Here we simulate processing time and occasional failures
 * so our AI reliability platform has real data to analyze.
 */

const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/payment.model');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';

/**
 * Simulate payment gateway latency.
 * Real payment gateways take 200ms–3000ms.
 * This simulates that range — and can be made worse via env vars in Phase 7.
 */
const simulateGatewayDelay = () => {
  const base = parseInt(process.env.LATENCY_MS || '0', 10);
  const natural = Math.floor(Math.random() * 300) + 100; // 100–400ms natural delay
  return new Promise((resolve) => setTimeout(resolve, base + natural));
};

/**
 * processPayment
 * Creates and processes a payment record.
 */
const processPayment = async ({ orderId, userId, amount, currency, method }, requestId) => {
  logger.info('Processing payment', {
    service: SERVICE_NAME,
    requestId,
    orderId,
    userId,
    amount,
    currency,
  });

  // Check for duplicate payment for the same order
  const existing = await Payment.findOne({ orderId, status: 'success' });
  if (existing) {
    const err = new Error('Payment already processed for this order');
    err.statusCode = 409;
    throw err;
  }

  // Create payment record in pending state
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

  // Simulate gateway call
  await simulateGatewayDelay();

  const processingTime = Date.now() - gatewayStart;

  // Simulate random payment failure (controlled by FAILURE_RATE env var)
  const failureRate = parseFloat(process.env.FAILURE_RATE || '0');
  const shouldFail = Math.random() * 100 < failureRate;

  if (shouldFail) {
    payment.status = 'failed';
    payment.failureReason = 'Simulated gateway rejection';
    payment.processingTime = processingTime;
    await payment.save();

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

  // Success
  payment.status = 'success';
  payment.processingTime = processingTime;
  await payment.save();

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

/**
 * getPaymentById
 */
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
