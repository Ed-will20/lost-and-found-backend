const express = require('express');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', chatController.getMyChats);
router.get('/unread-count', chatController.getUnreadCount);
router.get('/:chat_id/messages', chatController.getChatMessages);
router.post('/:chat_id/messages', chatController.sendMessage);

module.exports = router;
