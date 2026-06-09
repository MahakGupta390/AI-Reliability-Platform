/**
 * models/order.model.js — Order schema
 *
 * An Order is the central entity that ties together:
 * - WHO ordered (userId, verified by auth-service)
 * - WHAT was ordered (items array)
 * - HOW they paid (paymentId, from payment-service)
 * - WHAT happened (status, timestamps)
 *
 * WHY we store paymentId (not embed payment details):
 * Cross-service data ownership. Payment-service owns payment data.
 * Order-service only stores a reference. This is the microservices
 * data isolation principle — services don't duplicate each other's data.
 *
 * WHY we track serviceLatencies:
 * This is the Phase 6 gold. When a POST /orders is slow, was it
 * auth-service, payment-service, or our own DB? We log each hop's
 * duration so the AI can do root-cause analysis.
 */

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Order must have at least one item',
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['pending', 'payment_processing', 'confirmed', 'failed', 'cancelled'],
      default: 'pending',
    },
    paymentId: {
      type: String,
      default: null,
    },
    shippingAddress: {
      street: String,
      city: String,
      country: String,
      zip: String,
    },
    failureReason: {
      type: String,
      default: null,
    },
    // Per-phase latency tracking — fed into the metrics/AI layer
    // Gives us a breakdown: how much time each downstream service cost
    serviceLatencies: {
      authService: { type: Number, default: 0 },   // ms to verify user
      paymentService: { type: Number, default: 0 }, // ms to process payment
      totalMs: { type: Number, default: 0 },        // total order creation time
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { transform: (doc, ret) => { delete ret.__v; return ret; } },
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
