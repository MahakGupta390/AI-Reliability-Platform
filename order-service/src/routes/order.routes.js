/**
 * routes/order.routes.js
 *
 * ROUTE ORDER MATTERS IN EXPRESS.
 * Express matches routes top-to-bottom.
 * /status/:jobId MUST come before /:id
 * or Express will match "status" as an orderId and call getOrder.
 *
 * ENDPOINTS:
 * POST /orders               → enqueue order, return 202 + jobId
 * GET  /orders/status/:jobId → poll async job status
 * GET  /orders/queue/metrics → queue depth and health
 * GET  /orders/user/:userId  → all orders for a user
 * GET  /orders/:id           → single order by MongoDB ID
 */

const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrderStatus,
  getOrder,
  getUserOrders,
  getQueueMetrics,
} = require('../controllers/order.controller');

// Async order submission
router.post('/', createOrder);

// MUST be before /:id — Express reads top to bottom
router.get('/status/:jobId', getOrderStatus);
router.get('/queue/metrics', getQueueMetrics);
router.get('/user/:userId', getUserOrders);

// Generic ID route — must be last among GET routes
router.get('/:id', getOrder);

module.exports = router;
