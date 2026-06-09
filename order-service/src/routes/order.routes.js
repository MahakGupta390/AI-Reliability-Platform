/**
 * routes/order.routes.js
 *
 * POST /orders             — Create an order (requires Bearer token)
 * GET  /orders/:id         — Get order by MongoDB ID
 * GET  /orders/user/:userId — Get all orders for a user
 */

const express = require('express');
const router = express.Router();
const { createOrder, getOrder, getUserOrders } = require('../controllers/order.controller');

router.post('/', createOrder);
router.get('/user/:userId', getUserOrders);
router.get('/:id', getOrder);

module.exports = router;
