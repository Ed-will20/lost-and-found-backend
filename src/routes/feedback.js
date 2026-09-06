const express = require('express');
const { body } = require('express-validator');
const feedbackController = require('../controllers/feedbackController');
const validate = require('../middleware/validation');
const router = express.Router();

// Fully public -- no authMiddleware, unlike ratings.js which locks
// everything but /public behind auth. This route is anonymous by design.
router.post(
  '/',
  [
    body('message').trim().notEmpty().withMessage('Feedback message is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
    validate
  ],
  feedbackController.submitFeedback
);

module.exports = router;
