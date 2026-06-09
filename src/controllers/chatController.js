const pool = require('../config/database');

// Get all chats for the logged-in user
exports.getMyChats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ch.*,
              i.title as item_title,
              i.images as item_images,
              u_finder.full_name as finder_name,
              u_claimer.full_name as claimer_name,
              m.message_text as last_message,
              m.created_at as last_message_at
       FROM chats ch
       JOIN items i ON ch.item_id = i.id
       JOIN users u_finder ON ch.finder_id = u_finder.id
       JOIN users u_claimer ON ch.claimer_id = u_claimer.id
       LEFT JOIN messages m ON m.id = (
         SELECT id FROM messages
         WHERE chat_id = ch.id
         ORDER BY created_at DESC
         LIMIT 1
       )
       WHERE ch.finder_id = $1 OR ch.claimer_id = $1
       ORDER BY COALESCE(m.created_at, ch.created_at) DESC`,
      [req.userId]
    );

    res.json({ chats: result.rows });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Server error while fetching chats' });
  }
};

// Get a single chat + its messages
exports.getChatMessages = async (req, res) => {
  try {
    const { chat_id } = req.params;

    // Verify user is part of this chat
    const chatCheck = await pool.query(
      `SELECT ch.*, i.title as item_title, i.images as item_images,
              u_finder.full_name as finder_name,
              u_claimer.full_name as claimer_name
       FROM chats ch
       JOIN items i ON ch.item_id = i.id
       JOIN users u_finder ON ch.finder_id = u_finder.id
       JOIN users u_claimer ON ch.claimer_id = u_claimer.id
       WHERE ch.id = $1`,
      [chat_id]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatCheck.rows[0];

    if (chat.finder_id !== req.userId && chat.claimer_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to view this chat' });
    }

    // Get messages with sender name
    const messages = await pool.query(
      `SELECT m.*, u.full_name as sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1
       ORDER BY m.created_at ASC`,
      [chat_id]
    );

    // Mark messages as read
    await pool.query(
      `UPDATE messages SET read_status = true
       WHERE chat_id = $1 AND sender_id != $2 AND read_status = false`,
      [chat_id, req.userId]
    );

    res.json({
      chat,
      messages: messages.rows
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error while fetching messages' });
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const { chat_id } = req.params;
    const { message_text } = req.body;

    if (!message_text || !message_text.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Verify user is part of this chat
    const chatCheck = await pool.query(
      'SELECT * FROM chats WHERE id = $1',
      [chat_id]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatCheck.rows[0];

    if (chat.finder_id !== req.userId && chat.claimer_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to send messages in this chat' });
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, message_text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [chat_id, req.userId, message_text.trim()]
    );

    // Update last_message_at on chat
    await pool.query(
      'UPDATE chats SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [chat_id]
    );

    // Get sender name for response
    const sender = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [req.userId]
    );

    res.status(201).json({
      message: {
        ...result.rows[0],
        sender_name: sender.rows[0].full_name
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error while sending message' });
  }
};

// Get count of unread messages for the logged-in user
exports.getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM messages m
       JOIN chats ch ON m.chat_id = ch.id
       WHERE (ch.finder_id = $1 OR ch.claimer_id = $1)
         AND m.sender_id != $1
         AND m.read_status = false`,
      [req.userId]
    );
    res.json({ unread: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
