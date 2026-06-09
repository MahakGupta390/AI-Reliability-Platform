const paymentService = require('../services/payment.service');

const processPayment = async (req, res, next) => {
  try {
    const { orderId, userId, amount, currency, method } = req.body;

    if (!orderId || !userId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'orderId, userId, and amount are required',
        requestId: req.requestId,
      });
    }

    const payment = await paymentService.processPayment(
      { orderId, userId, amount, currency, method },
      req.requestId
    );

    res.status(201).json({
      success: true,
      message: 'Payment processed successfully',
      requestId: req.requestId,
      data: { payment },
    });
  } catch (err) {
    next(err);
  }
};

const getPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(
      req.params.id,
      req.requestId
    );

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      data: { payment },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { processPayment, getPayment };
