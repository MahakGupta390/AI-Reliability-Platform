const mongoose = require('mongoose');
const logger = require('./logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI environment variable is not set');

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('MongoDB connected', {
      service: SERVICE_NAME,
      host: conn.connection.host,
      dbName: conn.connection.name,
    });

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
    });
    throw err;
  }
};

module.exports = connectDB;
