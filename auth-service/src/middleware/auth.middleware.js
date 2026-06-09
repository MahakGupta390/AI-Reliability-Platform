/**
 * middleware/auth.middleware.js — JWT authentication guard
 *
 * WHY middleware for auth:
 * Instead of copy-pasting JWT verification logic into every protected
 * controller, we write it once as middleware. Any route that needs auth
 * just adds `protect` to its middleware chain.
 *
 * Pattern: Bearer token in Authorization header
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 * WHY we attach the user to req:
 * Downstream middleware and controllers can access req.user without
 * re-querying the database. The middleware is the single place that
 * validates and hydrates the user context for the entire request lifecycle.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../config/logger');

const protect = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authorization header required.',
        requestId: req.requestId,
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check user still exists in DB
    // (handles case where user was deleted after token was issued)
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Token invalid: user no longer exists',
        requestId: req.requestId,
      });
    }

    // 4. Attach user to request — available to all downstream handlers
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        requestId: req.requestId,
      });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        requestId: req.requestId,
      });
    }
    next(err);
  }
};

module.exports = { protect };