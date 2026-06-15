/**
 * config/redis.js — Redis connection for BullMQ
 *
 * WHY THIS FILE EXISTS:
 * BullMQ requires an ioredis connection object, not just a URL string.
 * Centralizing it here means Queue, Worker, and any future Redis usage
 * all share the same configuration and error handling.
 *
 * CONNECTION OPTIONS EXPLAINED:
 *
 * maxRetriesPerRequest: null
 *   REQUIRED for BullMQ. Without this, ioredis throws errors when
 *   a command is retried (BullMQ uses blocking commands that retry).
 *   null means retry indefinitely — BullMQ manages its own retry logic.
 *
 * enableReadyCheck: false
 *   Disables the READY check that ioredis does on connection.
 *   Required for BullMQ to work correctly with connection pooling.
 *
 * retryStrategy:
 *   How ioredis reconnects if Redis goes down. Exponential backoff
 *   prevents hammering a recovering Redis instance.
 *   Returns null after 10 attempts to stop retrying (prevents infinite loop).
 *
 * lazyConnect: true
 *   Don't connect immediately when the config is loaded.
 *   Connect only when the first Redis command is issued.
 *   Prevents startup failures if Redis isn't ready yet.
 */

const { Redis } = require('ioredis');
const logger = require('./logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

/**
 * parseRedisUrl
 * Parses REDIS_URL into ioredis connection options.
 * Supports: redis://host:port and redis://:password@host:port
 */
const parseRedisUrl = (url) => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname?.replace('/', '') || '0', 10),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
};

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connectionOptions = parseRedisUrl(redisUrl);

/**
 * createRedisConnection
 * Factory function — creates a new ioredis instance with BullMQ-compatible settings.
 * BullMQ internally calls this to create separate connections for Queue and Worker.
 * We export this function so BullMQ can create its own connections as needed.
 */
const createRedisConnection = () => {
  const redis = new Redis({
    ...connectionOptions,
    // REQUIRED for BullMQ — allows blocking commands to retry
    maxRetriesPerRequest: null,
    // REQUIRED for BullMQ connection pooling
    enableReadyCheck: false,
    // Don't connect until first command
    lazyConnect: true,
    // Reconnect strategy: exponential backoff, max 10 attempts
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis max reconnection attempts reached', {
          service: SERVICE_NAME,
          attempts: times,
        });
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 3000);
      logger.warn('Redis reconnecting', {
        service: SERVICE_NAME,
        attempt: times,
        delayMs: delay,
      });
      return delay;
    },
  });

  redis.on('connect', () => {
    logger.info('Redis connected', {
      service: SERVICE_NAME,
      host: connectionOptions.host,
      port: connectionOptions.port,
    });
  });

  redis.on('error', (err) => {
    logger.error('Redis connection error', {
      service: SERVICE_NAME,
      error: err.message,
    });
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed', { service: SERVICE_NAME });
  });

  return redis;
};

/**
 * BullMQ connection options object.
 * Pass this to Queue and Worker constructors instead of a raw URL.
 * BullMQ uses this to create its own internal ioredis connections.
 */
const bullMQConnection = {
  host: connectionOptions.host,
  port: connectionOptions.port,
  password: connectionOptions.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

module.exports = { createRedisConnection, bullMQConnection };
