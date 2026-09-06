const express = require('express');
const { body } = require('express-validator');
const feedbackController = require('../controllers/feedbackController');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const validate = require('../middleware/validation');
const router = express.Router();

// Fully public -- no auth. Anyone can submit or view the approved board.
router.post(
  '/',
  [
    body('message').trim().notEmpty().withMessage('Feedback message is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
    validate
  ],
  feedbackController.submitFeedback
);
router.get('/public', feedbackController.getPublicFeedback);

// Admin-only from here down.
router.get('/admin', authMiddleware, adminOnly, feedbackController.getAllFeedback);
router.patch('/admin/:id/toggle-public', authMiddleware, adminOnly, feedbackController.togglePublic);

module.exports = router;
