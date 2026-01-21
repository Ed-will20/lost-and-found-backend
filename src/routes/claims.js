const express = require('express');
const { body } = require('express-validator');
const claimController = require('../controllers/claimController');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get user's submitted claims
router.get('/my-claims', claimController.getMyClaims);

// Submit a claim for an item
router.post(
  '/items/:item_id/claim',
  upload.array('proof_images', 3), // Max 3 proof images
  [
    body('proof_description').trim().notEmpty(),
    validate
  ],
  claimController.createClaim
);

// Get all claims for an item (finder only)
router.get('/items/:item_id/claims', claimController.getItemClaims);

// Approve a claim
router.put('/claims/:claim_id/approve', claimController.approveClaim);

// Reject a claim
router.put('/claims/:claim_id/reject', claimController.rejectClaim);

module.exports = router;
