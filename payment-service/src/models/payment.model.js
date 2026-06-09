/**
 * models/payment.model.js — Payment schema
 *
 * Represents a payment transaction.
 * In production this would integrate with Stripe/Razorpay/etc.
 * Here we simulate the payment flow to generate realistic logs + metrics.
 *
 * Key fields:
 * - orderId: links payment back to the order (cross-service reference)
 * - userId: who is being charged
 * - amount/currency: what they're paying
 * - status: pending → success/failed (state machine)
 * - processingTime: how long the payment took — useful for latency analysis
 *
 * WHY we track processingTime:
 * Payment latency is a KPI. If avg payment time spikes from 200ms → 3000ms,
 * that's an incident. Our AI reliability platform will detect this (Phase 6+).
 */

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: [true, 'Order ID is required'],
      index: true, // We query by orderId frequently
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be positive'],
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      maxlength: 3,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'refunded'],
      default: 'pending',
    },
    method: {
      type: String,
      enum: ['card', 'upi', 'netbanking', 'wallet'],
      default: 'card',
    },
    // Simulated card details (last 4 digits only — never store full card)
    cardLast4: {
      type: String,
      maxlength: 4,
    },
    // How long the payment gateway took to respond (in ms)
    // Crucial for latency tracking and future AI analysis
    processingTime: {
      type: Number,
      default: 0,
    },
    failureReason: {
      type: String,
      default: null,
    },
    // Metadata for debugging and audit trails
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

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;