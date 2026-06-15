/**
 * config/queue.js — BullMQ Queue definition (producer side)
 *
 * THE QUEUE IS THE PRODUCER.
 * Controllers add jobs to this queue.
 * The Worker (workers/order.worker.js) picks them up and processes them.
 *
 * QUEUE NAME: 'orders'
 * This string is how BullMQ identifies the queue in Redis.
 * All jobs added here land in Redis under the key: bull:orders:*
 * The Worker must use the SAME queue name to consume jobs.
 *
 * DEFAULT JOB OPTIONS EXPLAINED:
 *
 * attempts: 3
 *   If a job fails (throws an error), BullMQ retries it up to 3 times total.
 *   1 initial attempt + 2 retries = 3 total.
 *   After 3 failures, the job moves to the "failed" list in Redis.
 *   The failed list is permanent — useful for debugging failed orders.
 *
 * backoff: exponential with 1000ms delay
 *   After first failure: wait 1 second before retry
 *   After second failure: wait 2 seconds before retry
 *   After third failure: wait 4 seconds (but we don't retry a 4th time)
 *   Why exponential? If payment gateway is temporarily overloaded,
 *   waiting longer between retries gives it time to recover.
 *
 * removeOnComplete: { count: 100 }
 *   Keep last 100 completed jobs in Redis for debugging/status checks.
 *   Without this, completed jobs accumulate forever and Redis fills up.
 *   100 is enough to debug recent orders without wasting memory.
 *
 * removeOnFail: { count: 500 }
 *   Keep last 500 failed jobs. Keep more failures than successes
 *   because failed jobs are what you investigate during incidents.
 *
 * PAYMENT RETRY SAFETY:
 * We do NOT retry payment-specific failures blindly.
 * The order.worker.js checks if the failure was a payment error
 * and does NOT re-attempt payment to avoid double-charging.
 * Only infrastructure errors (timeout, Redis unavailable) are retried.
 */

const { Queue } = require('bullmq');
const { bullMQConnection } = require('./redis');
const logger = require('./logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

const QUEUE_NAME = 'orders';

const orderQueue = new Queue(QUEUE_NAME, {
  connection: bullMQConnection,

  defaultJobOptions: {
    // Total attempts including first try
    attempts: 3,

    // Exponential backoff between retries
    backoff: {
      type: 'exponential',
      delay: 1000, // start: 1s, then 2s, then 4s
    },

    // Keep last 100 completed jobs for status endpoint
    removeOnComplete: {
      count: 100,
    },

    // Keep last 500 failed jobs for incident investigation
    removeOnFail: {
      count: 500,
    },
  },
});

// Log queue events for observability
orderQueue.on('error', (err) => {
  logger.error('BullMQ Queue error', {
    service: SERVICE_NAME,
    queue: QUEUE_NAME,
    error: err.message,
  });
});

logger.info('BullMQ order queue initialized', {
  service: SERVICE_NAME,
  queue: QUEUE_NAME,
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
});

module.exports = { orderQueue, QUEUE_NAME,bullMQConnection };
