/**
 * routes/payment.routes.js
 *
 * POST /payment        — Process a new payment
 * GET  /payment/:id    — Retrieve a payment record
 */

const express = require('express');
const router = express.Router();
const { processPayment, getPayment } = require('../controllers/payment.controller');

router.post('/', processPayment);
router.get('/:id', getPayment);

module.exports = router;
