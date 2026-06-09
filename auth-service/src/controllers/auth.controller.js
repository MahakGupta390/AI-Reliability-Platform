/**
 * controllers/auth.controller.js — HTTP request/response handling
 *
 * WHY controllers are thin:
 * A controller's only job is to:
 * 1. Extract data from the request (body, params, headers)
 * 2. Call the appropriate service function
 * 3. Send the HTTP response
 * 4. Catch errors and pass them to Express's error handler (next(err))
 *
 * NO business logic here. If you find yourself writing an if-statement
 * about business rules in a controller, move it to the service.
 *
 * The try/catch pattern here is important: we call next(err) on failure.
 * This routes the error to our global errorHandler middleware, which
 * ensures consistent error response formatting across all endpoints.
 */

const authService = require('../services/auth.service');
const logger = require('../config/logger');

/**
 * POST /auth/register
 * Creates a new user account.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Basic input validation at the controller level.
    // This is a quick sanity check — not a replacement for schema validation.
    // In a production system, you'd use Joi or Zod here.
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
        requestId: req.requestId,
      });
    }

    const result = await authService.registerUser(
      { name, email, password },
      req.requestId
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      requestId: req.requestId,
      data: result,
    });
  } catch (err) {
    next(err); // Pass to global error handler
  }
};

/**
 * POST /auth/login
 * Authenticates user and returns JWT.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
        requestId: req.requestId,
      });
    }

    const result = await authService.loginUser(
      { email, password },
      req.requestId
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      requestId: req.requestId,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/profile
 * Returns user profile. Requires a valid JWT in Authorization header.
 * The protect middleware (below) runs before this and attaches req.user.
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getUserProfile(
      req.user.id,
      req.requestId
    );

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/verify
 * Internal endpoint: used by other microservices to validate a JWT.
 * This is a service-to-service endpoint — not meant for direct client use.
 * In Phase 2, order-service calls this to validate user tokens.
 */
const verifyToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
        requestId: req.requestId,
      });
    }

    const result = await authService.verifyToken(token, req.requestId);

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getProfile, verifyToken };