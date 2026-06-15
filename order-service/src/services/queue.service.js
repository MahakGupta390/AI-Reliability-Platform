/**
 * services/queue.service.js — Queue operations wrapper
 *
 * WHY THIS SERVICE EXISTS:
 * Controllers should not import BullMQ directly.
 * This service abstracts queue operations so controllers
 * just call enqueueOrder() and getJobStatus() without knowing
 * anything about BullMQ internals.
 *
 * If you switch from BullMQ to a different queue system later,
 * only this file changes — controllers stay the same.
 */

const { orderQueue } = require('../config/queue');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

/**
 * enqueueOrder
 * Adds a new order job to the BullMQ queue.
 * Returns the job ID immediately — no waiting for processing.
 *
 * @param {Object} orderData - { token, items, shippingAddress, currency }
 * @param {string} requestId - Original request ID for distributed tracing
 * @returns {Object} { jobId, status: 'queued' }
 */
const enqueueOrder = async (orderData, requestId) => {
  const job = await orderQueue.add(
    'process-order',          // Job name (for filtering/monitoring)
    {
      ...orderData,
      requestId,              // Carry requestId through for log tracing
      enqueuedAt: new Date().toISOString(),
    },
    {
      // jobId is auto-generated UUID by BullMQ if not specified
      // We could set a custom ID here for idempotency:
      // jobId: `order-${requestId}`
      // But we let BullMQ generate it to avoid collision issues
    }
  );

  logger.info('Order job enqueued', {
    service: SERVICE_NAME,
    jobId: job.id,
    requestId,
    itemCount: orderData.items?.length,
  });

  return {
    jobId: job.id,
    status: 'queued',
    message: 'Order queued for processing',
  };
};

/**
 * getJobStatus
 * Retrieves the current status of a queued order job.
 * Used by GET /orders/status/:jobId endpoint.
 *
 * JOB STATES:
 * waiting    → in queue, not yet picked up by worker
 * active     → currently being processed by worker
 * completed  → successfully processed, result available
 * failed     → all retry attempts exhausted, order failed
 * delayed    → scheduled for future execution (not used here)
 * unknown    → job not found (expired or never existed)
 *
 * @param {string} jobId - BullMQ job ID returned from enqueueOrder
 * @returns {Object} status object
 */
const getJobStatus = async (jobId) => {
    console.log("getJobStatus called with:", jobId);
  const job = await orderQueue.getJob(jobId);
  console.log("job found:", !!job);

  if (!job) {
    return {
      jobId,
      status: 'unknown',
      message: 'Job not found — may have expired or never existed',
    };
  }

  const state = await job.getState();
  const progress = job.progress;
  const attemptsMade = job.attemptsMade;

  // Base response
  const response = {
    jobId,
    status: state,
    progress: typeof progress === 'number' ? progress : 0,
    attemptsMade,
    enqueuedAt: job.data.enqueuedAt,
    requestId: job.data.requestId,
  };

  // Completed: attach the order result
  if (state === 'completed' && job.returnvalue) {
    response.result = job.returnvalue;
    response.orderId = job.returnvalue.orderId;
    response.orderStatus = job.returnvalue.status;
    response.totalAmount = job.returnvalue.totalAmount;
    response.paymentId = job.returnvalue.paymentId;
    response.completedAt = new Date(job.finishedOn).toISOString();
  }

  // Failed: attach the error reason
  if (state === 'failed') {
    response.error = job.failedReason;
    response.failedAt = job.finishedOn
      ? new Date(job.finishedOn).toISOString()
      : null;
  }

  // Active: attach progress
  if (state === 'active') {
    response.startedAt = job.processedOn
      ? new Date(job.processedOn).toISOString()
      : null;
  }

  return response;
};

/**
 * getQueueMetrics
 * Returns current queue depth stats.
 * Used by GET /metrics endpoint and health checks.
 */
const getQueueMetrics = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    orderQueue.getWaitingCount(),
    orderQueue.getActiveCount(),
    orderQueue.getCompletedCount(),
    orderQueue.getFailedCount(),
    orderQueue.getDelayedCount(),
  ]);

  return {
    queue: 'orders',
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
};

module.exports = { enqueueOrder, getJobStatus, getQueueMetrics };
