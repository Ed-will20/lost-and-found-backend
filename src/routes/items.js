const express = require('express');
const { body } = require('express-validator');
const itemController = require('../controllers/itemController');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validation');

const router = express.Router();

// Get all items (public, with filters)
router.get('/', itemController.getItems);

// Search nearby items
router.get('/nearby', itemController.searchNearby);

// Get user's own items (protected)
router.get('/my-items', authMiddleware, itemController.getMyItems);

// Get single item by ID (public)
router.get('/:id', itemController.getItemById);

// Create new item (protected, with image upload)
router.post(
  '/',
  authMiddleware,
  upload.array('images', 5), // Max 5 images
  [
    body('title').trim().notEmpty(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('found_city').optional().trim(),
    body('found_state').optional().trim(),
    body('found_zip').optional().trim(),
    validate
  ],
  itemController.createItem
);

// Update item (protected)
router.put(
  '/:id',
  authMiddleware,
  [
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('status').optional().isIn(['found', 'claimed', 'resolved']),
    validate
  ],
  itemController.updateItem
);

// Delete item (protected)
router.delete('/:id', authMiddleware, itemController.deleteItem);

module.exports = router;
