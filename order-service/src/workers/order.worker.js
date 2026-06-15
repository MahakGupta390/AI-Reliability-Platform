/**
 * workers/order.worker.js — BullMQ Worker (consumer side)
 *
 * THE WORKER PROCESSES JOBS FROM THE QUEUE.
 *
 * LIFECYCLE OF A JOB:
 * 1. Controller adds job to queue → job enters "waiting" state in Redis
 * 2. Worker picks up job → job enters "active" state in Redis
 * 3. Worker calls auth-service, payment-service, saves order
 * 4a. Success → job enters "completed" state, result stored in Redis
 * 4b. Failure → job enters "failed" state if all retries exhausted
 *             → job re-queued with backoff if retries remain
 *
 * CONCURRENCY:
 * concurrency: 5 means the worker processes up to 5 jobs simultaneously.
 * Each job runs in its own async context — they don't block each other.
 * Node.js handles this naturally since all I/O (Axios, MongoDB) is async.
 *
 * PAYMENT RETRY SAFETY:
 * Payment failures (402 Payment Required) must NOT be retried.
 * If we retried a payment failure, we risk charging the customer twice
 * if the first attempt actually succeeded but the response was lost.
 * We throw a non-retryable error for payment failures to stop BullMQ
 * from automatically retrying.
 *
 * JOB DATA SHAPE:
 * {
 *   token: "eyJhbG...",        JWT from original request
 *   items: [...],              Order items array
 *   shippingAddress: {...},    Delivery address
 *   currency: "USD",           Currency code
 *   requestId: "abc-123"       Original request ID for tracing
 * }
 */

const { Worker } = require('bullmq');
const { bullMQConnection, QUEUE_NAME: ORDER_QUEUE_NAME } = require('../config/queue');
const orderService = require('../services/order.service');
const logger = require('../config/logger');
const {
  ordersTotal,
  downstreamCallsTotal,
} = require('../config/prometheusMetrics');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);




/**
 * processOrderJob
 * The main job processor function.
 * BullMQ calls this with each job it picks up from the queue.
 *
 * job.data   = the data we put in when enqueuing
 * job.id     = unique BullMQ job ID (UUID)
 * job.attemptsMade = how many times this job has been attempted
 *
 * job.updateProgress(n) = updates job progress 0-100
 * Clients polling status can see progress in real time.
 */
const processOrderJob = async (job) => {
  const { token, items, shippingAddress, currency, requestId } = job.data;

  logger.info('Worker: processing order job', {
    service: SERVICE_NAME,
    jobId: job.id,
    requestId,
    attemptsMade: job.attemptsMade,
    itemCount: items?.length,
  });

  // Update progress so status endpoint shows meaningful state
  await job.updateProgress(10);

  try {
    // Step 1: Verify user (10% → 30%)
    // orderService.createOrder handles all the distributed calls
    // We track progress at key milestones
    await job.updateProgress(20);

    const order = await orderService.createOrder(
      { token, items, shippingAddress, currency },
      requestId
    );

    await job.updateProgress(100);

    logger.info('Worker: order job completed', {
      service: SERVICE_NAME,
      jobId: job.id,
      requestId,
      orderId: order._id,
      status: order.status,
    });

    // Return value is stored in Redis as job result
    // Status endpoint reads this to return orderId to client
    return {
      orderId: order._id.toString(),
      status: order.status,
      totalAmount: order.totalAmount,
      paymentId: order.paymentId,
    };

  } catch (err) {
    logger.error('Worker: order job failed', {
      service: SERVICE_NAME,
      jobId: job.id,
      requestId,
      error: err.message,
      statusCode: err.statusCode,
      attemptsMade: job.attemptsMade,
    });

    // CRITICAL: Payment failures must NOT be retried
    // 402 = payment declined by gateway
    // 409 = duplicate payment (already processed)
    // These are definitive failures — retrying would risk double-charging
    if (err.statusCode === 402 || err.statusCode === 409) {
      // UnrecoverableError tells BullMQ to move job to failed immediately
      // without using any remaining retry attempts
      const { UnrecoverableError } = require('bullmq');
      throw new UnrecoverableError(`Payment error (non-retryable): ${err.message}`);
    }

    // Auth failures (401) are also non-retryable — token won't become valid
    if (err.statusCode === 401 || err.statusCode === 403) {
      const { UnrecoverableError } = require('bullmq');
      throw new UnrecoverableError(`Auth error (non-retryable): ${err.message}`);
    }

    // All other errors (503 service unavailable, 500 server error,
    // network timeouts) ARE retryable — service may recover
    // BullMQ will retry according to the queue's backoff configuration
    throw err;
  }
};

/**
 * createOrderWorker
 * Creates and starts the BullMQ Worker.
 * Called from server.js after Express and MongoDB are ready.
 */
const createOrderWorker = () => {
  const worker = new Worker(ORDER_QUEUE_NAME, processOrderJob, {
    connection: bullMQConnection,
    concurrency: WORKER_CONCURRENCY,

    // How often worker checks for new jobs when idle (milliseconds)
    // Lower = more responsive but slightly more Redis polling
    // 1000ms is a good balance
    pollInterval: 1000,
  });

  // ── Worker Event Listeners ─────────────────────────────────────────────────

  worker.on('completed', (job, result) => {
    logger.info('Worker: job completed', {
      service: SERVICE_NAME,
      jobId: job.id,
      requestId: job.data.requestId,
      orderId: result?.orderId,
      status: result?.status,
    });
  });

  worker.on('failed', (job, err) => {
    const isExhausted = job.attemptsMade >= (job.opts.attempts || 3);
    logger.error('Worker: job failed', {
      service: SERVICE_NAME,
      jobId: job?.id,
      requestId: job?.data?.requestId,
      error: err.message,
      attemptsMade: job?.attemptsMade,
      attemptsTotal: job?.opts?.attempts,
      exhausted: isExhausted,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker: worker error', {
      service: SERVICE_NAME,
      error: err.message,
    });
  });

  worker.on('active', (job) => {
    logger.info('Worker: job started', {
      service: SERVICE_NAME,
      jobId: job.id,
      requestId: job.data.requestId,
      attemptsMade: job.attemptsMade,
    });
  });

  worker.on('stalled', (jobId) => {
    // A job is "stalled" when the worker process crashed mid-job.
    // BullMQ automatically re-queues stalled jobs for another worker to pick up.
    logger.warn('Worker: job stalled — will be re-queued', {
      service: SERVICE_NAME,
      jobId,
    });
  });

  logger.info('BullMQ order worker started', {
    service: SERVICE_NAME,
    queue: ORDER_QUEUE_NAME,
    concurrency: WORKER_CONCURRENCY,
  });

  return worker;
};

module.exports = { createOrderWorker };
