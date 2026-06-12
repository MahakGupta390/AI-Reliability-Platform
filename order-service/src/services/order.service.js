/**
 * services/order.service.js — Order orchestration
 *
 * CHANGES FROM PHASE 2:
 * Added Prometheus metric recording for:
 * - downstreamCallDuration: latency of auth-service and payment-service calls
 * - downstreamCallsTotal: success/failure counts per downstream service
 * - ordersTotal: final order outcomes (confirmed/failed)
 *
 * These are recorded at the service layer because:
 * - Downstream call durations are not visible to HTTP middleware
 * - Order outcomes are business logic, not HTTP-level data
 */

const Order = require('../models/order.model');
const { authClient, paymentClient, callWithRetry } = require('../config/httpClient');
const logger = require('../config/logger');
const {
  ordersTotal,
  downstreamCallsTotal,
  downstreamCallDuration,
} = require('../config/prometheusMetrics');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

const calculateTotal = (items) => {
  return parseFloat(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)
  );
};

const buildServiceError = (axiosError, fallbackMessage, fallbackStatus) => {
  const err = new Error(
    axiosError.upstreamMessage ||
    axiosError.response?.data?.message ||
    fallbackMessage
  );

  if (axiosError.isTimeout) {
    err.message = `${axiosError.upstreamService} timed out`;
    err.statusCode = 503;
  } else if (axiosError.isUnreachable) {
    err.message = `${axiosError.upstreamService} is unavailable`;
    err.statusCode = 503;
  } else {
    err.statusCode = axiosError.upstreamStatus ||
                     axiosError.response?.status ||
                     fallbackStatus;
  }

  err.upstreamService = axiosError.upstreamService;
  return err;
};

const createOrder = async ({ token, items, shippingAddress, currency }, requestId) => {
  const orderStart = Date.now();
  const serviceLatencies = { authService: 0, paymentService: 0, totalMs: 0 };

  // ── STEP 1: Verify user identity ─────────────────────────────────────────
  logger.info('Step 1/4 — Verifying user identity', {
    service: SERVICE_NAME,
    requestId,
  });

  let userId;
  const authStart = Date.now();

  try {
    const authResponse = await callWithRetry(
      () => authClient.post(
        '/auth/verify',
        { token },
        { headers: { 'x-request-id': requestId } }
      ),
      2,
      200
    );

    serviceLatencies.authService = Date.now() - authStart;
    userId = authResponse.data.data.userId;

    // Record successful auth-service call in Prometheus
    downstreamCallsTotal.inc({ target: 'auth-service', status: 'success' });
    downstreamCallDuration.observe(
      { target: 'auth-service', operation: 'verify-token' },
      serviceLatencies.authService / 1000
    );

    logger.info('Step 1/4 — User verified', {
      service: SERVICE_NAME,
      requestId,
      userId,
      authLatencyMs: serviceLatencies.authService,
    });

  } catch (err) {
    serviceLatencies.authService = Date.now() - authStart;
    if (err.response) {
      console.log("CRITICAL AUTH RESP DATA:", err.response.data);
    } else {
      console.log("CRITICAL AUTH ERR MSG:", err.message);
    }

    // Record failed auth-service call
    const failStatus = err.isTimeout ? 'timeout'
                     : err.isUnreachable ? 'unreachable'
                     : 'error';
    downstreamCallsTotal.inc({ target: 'auth-service', status: failStatus });
    downstreamCallDuration.observe(
      { target: 'auth-service', operation: 'verify-token' },
      serviceLatencies.authService / 1000
    );

    logger.error('Step 1/4 — Auth verification failed', {
      service: SERVICE_NAME,
      requestId,
      authLatencyMs: serviceLatencies.authService,
      error: err.message,
    });

    throw buildServiceError(err, 'User verification failed', 401);
  }

  // ── STEP 2: Calculate total ───────────────────────────────────────────────
  const totalAmount = calculateTotal(items);

  logger.info('Step 2/4 — Order total calculated', {
    service: SERVICE_NAME,
    requestId,
    userId,
    itemCount: items.length,
    totalAmount,
    currency: currency || 'USD',
  });

  // ── STEP 3: Persist order ────────────────────────────────────────────────
  logger.info('Step 3/4 — Creating order record', {
    service: SERVICE_NAME,
    requestId,
    userId,
    totalAmount,
  });

  const order = await Order.create({
    userId: userId.toString(),
    items,
    totalAmount,
    currency: currency || 'USD',
    shippingAddress: shippingAddress || {},
    status: 'payment_processing',
    serviceLatencies,
  });

  logger.info('Step 3/4 — Order record created', {
    service: SERVICE_NAME,
    requestId,
    orderId: order._id,
    status: order.status,
  });

  // ── STEP 4: Process payment ───────────────────────────────────────────────
  logger.info('Step 4/4 — Processing payment', {
    service: SERVICE_NAME,
    requestId,
    orderId: order._id,
    userId,
    totalAmount,
  });

  const paymentStart = Date.now();

  try {
    const paymentResponse = await callWithRetry(
  () =>
    paymentClient.post(
      '/payment',
      {
        orderId: order._id.toString(),
        userId: userId.toString(),
        amount: totalAmount,
        currency: currency || 'USD',
        method: 'card',
      },
      {
        headers: {
          'x-request-id': requestId,
        },
      }
    ),
  2,   // retry 2 times
  200  // wait 200ms between retries
);

    serviceLatencies.paymentService = Date.now() - paymentStart;
    serviceLatencies.totalMs = Date.now() - orderStart;

    // Record successful payment-service call
    downstreamCallsTotal.inc({ target: 'payment-service', status: 'success' });
    downstreamCallDuration.observe(
      { target: 'payment-service', operation: 'process-payment' },
      serviceLatencies.paymentService / 1000
    );

    const payment = paymentResponse.data.data.payment;

    order.status = 'confirmed';
    order.paymentId = payment._id.toString();
    order.serviceLatencies = serviceLatencies;
    await order.save();

    // Record successful order
    ordersTotal.inc({ status: 'confirmed' });

    logger.info('Order confirmed successfully', {
      service: SERVICE_NAME,
      requestId,
      orderId: order._id,
      paymentId: payment._id,
      totalAmount,
      serviceLatencies,
    });

    return order;

  } catch (err) {
    serviceLatencies.paymentService = Date.now() - paymentStart;
    serviceLatencies.totalMs = Date.now() - orderStart;

    // ─── FIX: Intercept Both 409 Conflict & Text Messages ───────
    const upstreamMessage = err.response?.data?.message || err.message || '';
    const isAlreadyProcessed = (err.response && err.response.status === 409) || 
                               upstreamMessage.includes('Payment already processed');

    if (isAlreadyProcessed) {
      logger.info('Payment was already processed downstream. Recovering order to confirmed.', {
        service: SERVICE_NAME,
        requestId,
        orderId: order._id,
        upstreamMessage
      });

      // Safely extract the payment object if returned by your gateway
      const payment = err.response.data?.data?.payment || err.response.data?.payment;

      order.status = 'confirmed';
      order.paymentId = payment?._id?.toString() || payment?.id?.toString() || 'ALREADY_PAID';
      order.serviceLatencies = serviceLatencies;
      await order.save();

      // Record successful order metrics instead of failures
      ordersTotal.inc({ status: 'confirmed' });
      downstreamCallsTotal.inc({ target: 'payment-service', status: 'success' });
      downstreamCallDuration.observe(
        { target: 'payment-service', operation: 'process-payment' },
        serviceLatencies.paymentService / 1000
      );

      return order; // Break out early with the successfully confirmed order!
    }
    // ───────────────────────────────────────────────────────────

    // Record failed payment-service call (Your original fallback logic)
    const failStatus = err.isTimeout ? 'timeout'
                     : err.isUnreachable ? 'unreachable'
                     : 'error';
    downstreamCallsTotal.inc({ target: 'payment-service', status: failStatus });
    downstreamCallDuration.observe(
      { target: 'payment-service', operation: 'process-payment' },
      serviceLatencies.paymentService / 1000
    );

    order.status = 'failed';
    order.failureReason =
      err.upstreamMessage ||
      err.response?.data?.message ||
      err.message;
    order.serviceLatencies = serviceLatencies;
    await order.save();

    // Record failed order
    ordersTotal.inc({ status: 'failed' });

    logger.error('Step 4/4 — Payment failed', {
      service: SERVICE_NAME,
      requestId,
      orderId: order._id,
      failureReason: order.failureReason,
      serviceLatencies,
    });

    throw buildServiceError(err, 'Payment processing failed', 402);
  }
};
const getOrderById = async (orderId, requestId) => {
  const order = await Order.findById(orderId);

  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  return order;
};

const getOrdersByUser = async (userId, requestId) => {
  const orders = await Order.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50);
  return orders;
};

module.exports = { createOrder, getOrderById, getOrdersByUser };
