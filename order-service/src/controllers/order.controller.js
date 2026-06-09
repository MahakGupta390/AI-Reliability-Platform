/**
 * controllers/order.controller.js
 *
 * POST /orders  — Create an order (triggers auth + payment calls)
 * GET  /orders/:id — Get single order by ID
 * GET  /orders/user/:userId — Get all orders for a user
 */

const orderService = require('../services/order.service');

const createOrder = async (req, res, next) => {
  try {
    const { items, shippingAddress, currency } = req.body;

    // Token comes from the Authorization header — we pass it to auth-service
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header with Bearer token required',
        requestId: req.requestId,
      });
    }
    const token = authHeader.split(' ')[1];

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items array is required and must not be empty',
        requestId: req.requestId,
      });
    }

    const order = await orderService.createOrder(
      { token, items, shippingAddress, currency },
      req.requestId
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      requestId: req.requestId,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.requestId);

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
};

const getUserOrders = async (req, res, next) => {
  try {
    const orders = await orderService.getOrdersByUser(
      req.params.userId,
      req.requestId
    );

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: { count: orders.length, orders },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { createOrder, getOrder, getUserOrders };
