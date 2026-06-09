/**
 * services/order.service.js — Order orchestration logic
 *
 * This is the most important service in the system because it demonstrates
 * the full distributed request lifecycle:
 *
 * POST /orders flow:
 * 1. Validate user token → auth-service
 * 2. Calculate order total
 * 3. Process payment → payment-service
 * 4. Save confirmed order → MongoDB
 * 5. Return complete order with payment reference
 *
 * WHY we time each external call (serviceLatencies):
 * When the order endpoint is slow, we need to know WHERE the slowness is.
 * Was auth-service slow? Was payment-service slow? Or is our DB slow?
 * These per-hop timings are stored on the order document and will be the
 * primary data source for the AI reliability analysis in Phase 9.
 *
 * WHY we handle each service failure differently:
 * - Auth failure: 401 — don't create order, user is not verified
 * - Payment failure: 402 — create order in 'failed' state (for audit trail)
 * - Auth unreachable: 503 — cascade failure, surface clearly
 */

const Order = require('../models/order.model');
const { authClient, paymentClient } = require('../config/httpClient');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

/**
 * Calculate total from items array
 */
const calculateTotal = (items) => {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
};

/**
 * createOrder
 * Full orchestration: auth → payment → save order
 */
const createOrder = async ({ token, items, shippingAddress, currency }, requestId) => {
  const orderStart = Date.now();
  const serviceLatencies = { authService: 0, paymentService: 0, totalMs: 0 };

  // ── STEP 1: Verify user with auth-service ───────────────────────────────────
  logger.info('Step 1: Verifying user with auth-service', {
    service: SERVICE_NAME,
    requestId,
  });

  let userId;
  const authStart = Date.now();
  try {
    const authResponse = await authClient.post(
      '/auth/verify',
      { token },
      { headers: { 'x-request-id': requestId } }
    );
    serviceLatencies.authService = Date.now() - authStart;
    userId = authResponse.data.data.userId;

    logger.info('User verified successfully', {
      service: SERVICE_NAME,
      requestId,
      userId,
      authLatency: serviceLatencies.authService,
    });
  } catch (err) {
    serviceLatencies.authService = Date.now() - authStart;

    // Auth service is down (network error)
    if (!err.response) {
      const serviceErr = new Error('Authentication service is unavailable');
      serviceErr.statusCode = 503;
      serviceErr.upstreamService = 'auth-service';
      throw serviceErr;
    }

    // Auth service returned 401/403
    const authErr = new Error(
      err.response?.data?.message || 'Token verification failed'
    );
    authErr.statusCode = err.response?.status || 401;
    throw authErr;
  }

  // ── STEP 2: Calculate order total ───────────────────────────────────────────
  const totalAmount = calculateTotal(items);

  logger.info('Order total calculated', {
    service: SERVICE_NAME,
    requestId,
    userId,
    itemCount: items.length,
    totalAmount,
    currency,
  });

  // ── STEP 3: Process payment via payment-service ─────────────────────────────
  logger.info('Step 3: Processing payment with payment-service', {
    service: SERVICE_NAME,
    requestId,
    userId,
    totalAmount,
  });

  // Create order in pending state BEFORE calling payment
  // This gives us an audit record even if payment fails
  const order = await Order.create({
    userId: userId.toString(),
    items,
    totalAmount,
    currency: currency || 'USD',
    shippingAddress,
    status: 'payment_processing',
    serviceLatencies,
  });

  const paymentStart = Date.now();
  try {
    const paymentResponse = await paymentClient.post(
      '/payment',
      {
        orderId: order._id.toString(),
        userId: userId.toString(),
        amount: totalAmount,
        currency: currency || 'USD',
      },
      { headers: { 'x-request-id': requestId } }
    );

    serviceLatencies.paymentService = Date.now() - paymentStart;
    serviceLatencies.totalMs = Date.now() - orderStart;

    const paymentId = paymentResponse.data.data.payment._id;

    // ── STEP 4: Confirm order ─────────────────────────────────────────────────
    order.status = 'confirmed';
    order.paymentId = paymentId;
    order.serviceLatencies = serviceLatencies;
    await order.save();

    logger.info('Order created and confirmed', {
      service: SERVICE_NAME,
      requestId,
      orderId: order._id,
      userId,
      paymentId,
      totalAmount,
      serviceLatencies,
    });

    return order;
  } catch (err) {
    serviceLatencies.paymentService = Date.now() - paymentStart;
    serviceLatencies.totalMs = Date.now() - orderStart;

    // Save order in failed state for audit trail
    order.status = 'failed';
    order.failureReason = err.response?.data?.message || err.message;
    order.serviceLatencies = serviceLatencies;
    await order.save();

    logger.error('Payment failed — order marked as failed', {
      service: SERVICE_NAME,
      requestId,
      orderId: order._id,
      error: order.failureReason,
      serviceLatencies,
    });

    if (!err.response) {
      const serviceErr = new Error('Payment service is unavailable');
      serviceErr.statusCode = 503;
      serviceErr.upstreamService = 'payment-service';
      throw serviceErr;
    }

    const payErr = new Error(err.response?.data?.message || 'Payment processing failed');
    payErr.statusCode = err.response?.status || 402;
    throw payErr;
  }
};

/**
 * getOrderById
 */
const getOrderById = async (orderId, requestId) => {
  const order = await Order.findById(orderId);

  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  return order;
};

/**
 * getOrdersByUser
 */
const getOrdersByUser = async (userId, requestId) => {
  const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(50);
  return orders;
};

module.exports = { createOrder, getOrderById, getOrdersByUser };
