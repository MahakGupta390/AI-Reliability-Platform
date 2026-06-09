/**
 * config/db.js — MongoDB connection
 *
 * WHY a dedicated config file:
 * DB connection logic should not live in server.js or app.js.
 * It has its own concerns: retry logic, connection events, URI validation.
 * Keeping it separate makes it mockable in tests and easy to swap
 * (e.g., switch to a test DB in CI).
 *
 * WHY we export a function (not a connection object):
 * The caller (server.js) controls WHEN the connection happens.
 * This is the "lazy initialization" pattern — we don't connect at
 * module load time, we connect when explicitly told to.
 */

const mongoose = require('mongoose');
const logger = require('./logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI environment variable is not set');
  }

  try {
    const conn = await mongoose.connect(uri, {
      // These options prevent deprecation warnings and set sensible defaults:
      serverSelectionTimeoutMS: 30000,  // Fail fast if Mongo is unreachable
      socketTimeoutMS: 45000,          // Close idle sockets after 45s
    });

    logger.info('MongoDB connected', {
      service: SERVICE_NAME,
      host: conn.connection.host,
      dbName: conn.connection.name,
    });

    // Connection event listeners for observability.
    // In production, these feed into alerting systems.
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected', { service: SERVICE_NAME });
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected', { service: SERVICE_NAME });
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', {
        service: SERVICE_NAME,
        error: err.message,
      });
    });

    return conn;
  } catch (err) {
    logger.error('MongoDB initial connection failed', {
      service: SERVICE_NAME,
      error: err.message,
      uri: uri.replace(/\/\/.*@/, '//***:***@'), // Mask credentials in logs
    });
    throw err; // Re-throw so server.js can handle shutdown
  }
};

module.exports = connectDB;
