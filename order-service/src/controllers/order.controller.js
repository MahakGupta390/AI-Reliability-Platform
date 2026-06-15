/**
 * controllers/order.controller.js
 *
 * WHAT CHANGED FROM PHASE 2:
 * createOrder no longer calls orderService.createOrder() directly.
 * Instead it calls queueService.enqueueOrder() and immediately
 * returns 202 Accepted with a jobId.
 *
 * The actual order processing (auth call, payment call, DB write)
 * happens asynchronously in order.worker.js.
 *
 * HTTP STATUS CODE CHANGE:
 * Before: 201 Created (order was created synchronously)
 * After:  202 Accepted (order accepted for processing, not yet created)
 * 202 is the correct HTTP status for async processing.
 *
 * NEW ENDPOINT:
 * GET /orders/status/:jobId — polls for async job completion
 */

const orderService = require('../services/order.service');
const queueService = require('../services/queue.service');

/**
 * createOrder
 * Accepts order request, enqueues it, returns immediately with jobId.
 * Client uses jobId to poll GET /orders/status/:jobId for result.
 */
const createOrder = async (req, res, next) => {
  try {
    const { items, shippingAddress, currency } = req.body;

    // Extract JWT from Authorization header
    // Token is passed into the job so worker can verify it
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header with Bearer token required',
        requestId: req.requestId,
      });
    }
    const token = authHeader.split(' ')[1];

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items array is required and must not be empty',
        requestId: req.requestId,
      });
    }

    // Validate item structure
    for (const item of items) {
      if (!item.productId || !item.name || !item.quantity || !item.price) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have productId, name, quantity, and price',
          requestId: req.requestId,
        });
      }
    }

    // Enqueue the order — returns jobId immediately
    const result = await queueService.enqueueOrder(
      { token, items, shippingAddress, currency },
      req.requestId
    );

    // 202 Accepted — not 201 Created — because order is not yet processed
    res.status(202).json({
      success: true,
      message: 'Order accepted for processing',
      requestId: req.requestId,
      data: {
        jobId: result.jobId,
        status: result.status,
        // Tell client where to poll for status
        statusUrl: `/orders/status/${result.jobId}`,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getOrderStatus
 * Polls the BullMQ job status for an async order.
 * Client calls this repeatedly until status is 'completed' or 'failed'.
 *
 * Recommended polling interval: every 1-2 seconds
 * In production: replace polling with WebSocket push or webhook (Phase 9D)
 */
const getOrderStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const statusData = await queueService.getJobStatus(jobId);

    // HTTP status based on job state:
    // 200 for all terminal and in-progress states
    // 404 for unknown jobs
    if (statusData.status === 'unknown') {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
        requestId: req.requestId,
        data: statusData,
      });
    }

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: statusData,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getOrder — unchanged from Phase 2
 * Retrieves a confirmed order from MongoDB by order ID.
 * Used after polling shows status: 'completed' and you have the orderId.
 */
const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.requestId);
    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getUserOrders — unchanged from Phase 2
 */
const getUserOrders = async (req, res, next) => {
  try {
    const orders = await orderService.getOrdersByUser(
      req.params.userId,
      req.requestId
    );
    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: { count: orders.length, orders },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * getQueueMetrics — new endpoint for queue health
 */
const getQueueMetrics = async (req, res, next) => {
  try {
    const metrics = await queueService.getQueueMetrics();
    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: metrics,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  getOrderStatus,
  getOrder,
  getUserOrders,
  getQueueMetrics,
};
