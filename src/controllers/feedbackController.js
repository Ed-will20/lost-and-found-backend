const pool = require('../config/database');

// Public, unauthenticated feedback submission. No registration required --
// name/email are optional, message is the only thing that matters.
exports.submitFeedback = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Feedback message is required' });
    }

    await pool.query(
      `INSERT INTO site_feedback (name, email, message) VALUES ($1, $2, $3)`,
      [(name || '').trim() || null, (email || '').trim() || null, trimmedMessage]
    );

    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Server error while submitting feedback' });
  }
};
