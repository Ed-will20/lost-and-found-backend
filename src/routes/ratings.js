const express = require('express');
const { body } = require('express-validator');
const ratingController = require('../controllers/ratingController');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validation');
const router = express.Router();

// Public testimonials feed — no auth required
router.get('/public', ratingController.getPublicTestimonials);

// Everything else requires authentication
router.use(authMiddleware);

// Check if the current user has already rated a claim
router.get('/:claim_id', ratingController.getMyRatingForClaim);

// Submit or update a rating for a resolved claim
router.post(
  '/:claim_id',
  [
    body('score').notEmpty(),
    body('testimonial').optional().trim(),
    body('testimonial_public').optional(),
    validate
  ],
  ratingController.submitRating
);

module.exports = router;
