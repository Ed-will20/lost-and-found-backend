const express = require('express');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// Get all chats for logged-in user
router.get('/', chatController.getMyChats);

// Get single chat + messages
router.get('/:chat_id', chatController.getChatMessages);

// Send a message
router.post('/:chat_id/messages', chatController.sendMessage);

module.exports = router;
