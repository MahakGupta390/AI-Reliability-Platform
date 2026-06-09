/**
 * routes/auth.routes.js — Route definitions
 *
 * WHY routes are separate from controllers:
 * Routes define the URL contract: what HTTP method + path maps to what handler.
 * Controllers define what happens when that route is matched.
 * Keeping them separate means you can look at routes to understand the API
 * surface without reading any logic.
 *
 * Routes also let you compose middleware chains declaratively:
 * router.get('/profile', protect, getProfile)
 * reads: "GET /profile → run protect middleware → then getProfile controller"
 *
 * ENDPOINTS:
 * POST /auth/register   — Create account
 * POST /auth/login      — Authenticate and get JWT
 * GET  /auth/profile    — Get own profile (requires auth)
 * POST /auth/verify     — Internal: validate a token (used by other services)
 */

const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  verifyToken,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// Public routes — no authentication required
router.post('/register', register);
router.post('/login', login);

// Protected route — JWT required
// The protect middleware runs first, verifies token, attaches req.user
// Then getProfile runs and uses req.user.id
router.get('/profile', protect, getProfile);

// Internal service-to-service endpoint
// Used by order-service to validate tokens (Phase 2)
// In production, this would be behind an internal network, not public
router.post('/verify', verifyToken);

module.exports = router;