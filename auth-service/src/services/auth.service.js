/**
 * services/auth.service.js — Business logic layer
 *
 * WHY this layer exists:
 * Controllers handle HTTP (parsing req.body, sending res.json).
 * Services handle BUSINESS LOGIC (what the app actually does).
 *
 * If tomorrow you need to expose this same logic via a CLI tool, a queue
 * worker, or a gRPC endpoint, you call the same service functions without
 * touching any HTTP code.
 *
 * Services should:
 * ✓ Talk to the database (via models)
 * ✓ Implement business rules
 * ✓ Throw descriptive errors
 *
 * Services should NOT:
 * ✗ Import express, req, or res
 * ✗ Call res.json() or res.status()
 * ✗ Know about HTTP status codes (that's the controller's job)
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';

/**
 * Generate JWT token for a user
 * Extracted as a helper because both register and login need it.
 */
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * registerUser
 * Creates a new user account.
 * Throws an error if email already exists (caught by controller).
 */
const registerUser = async ({ name, email, password }, requestId) => {
  logger.info('Attempting user registration', {
    service: SERVICE_NAME,
    requestId,
    email,
  });

  // Check for duplicate — Mongoose unique constraint also catches this,
  // but we check first to provide a cleaner error message
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const err = new Error('Email already registered');
    err.statusCode = 409; // Conflict
    throw err;
  }

  const user = await User.create({ name, email, password });
  const token = generateToken(user._id);

  logger.info('User registered successfully', {
    service: SERVICE_NAME,
    requestId,
    userId: user._id,
  });

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  };
};

/**
 * loginUser
 * Authenticates a user and returns a JWT.
 * Note: we use the SAME error message for wrong email OR wrong password.
 * This is intentional security — don't leak whether the email exists.
 */
const loginUser = async ({ email, password }, requestId) => {
  logger.info('Login attempt', {
    service: SERVICE_NAME,
    requestId,
    email,
  });

  // Must explicitly select password (excluded by default in schema)
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    logger.warn('Failed login attempt', {
      service: SERVICE_NAME,
      requestId,
      email,
    });
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated');
    err.statusCode = 403;
    throw err;
  }

  const token = generateToken(user._id);

  logger.info('User logged in successfully', {
    service: SERVICE_NAME,
    requestId,
    userId: user._id,
  });

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};

/**
 * getUserProfile
 * Fetches user by ID from a decoded JWT.
 * Used by other services to validate tokens (Phase 2).
 */
const getUserProfile = async (userId, requestId) => {
  const user = await User.findById(userId);

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  return user;
};

/**
 * verifyToken
 * Validates a JWT and returns the decoded payload.
 * This is called by order-service in Phase 2 to verify user identity.
 */
const verifyToken = async (token, requestId) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      const err = new Error('Token is invalid or user no longer exists');
      err.statusCode = 401;
      throw err;
    }

    return { valid: true, userId: user._id, user };
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      const authErr = new Error('Invalid or expired token');
      authErr.statusCode = 401;
      throw authErr;
    }
    throw err;
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  verifyToken,
};