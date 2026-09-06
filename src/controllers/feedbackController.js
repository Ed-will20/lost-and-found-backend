const pool = require('../config/database');
const { sendFeedbackNotificationEmail } = require('../services/emailService');

// Public, unauthenticated feedback submission. No registration required --
// name/email are optional, message is the only thing that matters.
exports.submitFeedback = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Feedback message is required' });
    }

    const trimmedName = (name || '').trim() || null;
    const trimmedEmail = (email || '').trim() || null;

    await pool.query(
      `INSERT INTO site_feedback (name, email, message) VALUES ($1, $2, $3)`,
      [trimmedName, trimmedEmail, trimmedMessage]
    );

    // Fire-and-forget, same pattern as claim/message notifications --
    // send() already catches its own errors, so this never blocks or
    // fails the actual submission.
    await sendFeedbackNotificationEmail({ name: trimmedName, email: trimmedEmail, message: trimmedMessage });

    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Server error while submitting feedback' });
  }
};

// Public feed -- only entries you've explicitly approved for display.
exports.getPublicFeedback = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, message, created_at FROM site_feedback
       WHERE is_public = TRUE ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ feedback: result.rows });
  } catch (error) {
    console.error('Get public feedback error:', error);
    res.status(500).json({ error: 'Server error while fetching feedback' });
  }
};

// Admin-only: every submission, including email addresses and unapproved ones.
exports.getAllFeedback = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM site_feedback ORDER BY created_at DESC`
    );
    res.json({ feedback: result.rows });
  } catch (error) {
    console.error('Get all feedback error:', error);
    res.status(500).json({ error: 'Server error while fetching feedback' });
  }
};

// Admin-only: flip is_public on a single entry.
exports.togglePublic = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE site_feedback SET is_public = NOT is_public WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    res.json({ feedback: result.rows[0] });
  } catch (error) {
    console.error('Toggle feedback visibility error:', error);
    res.status(500).json({ error: 'Server error while updating feedback' });
  }
};
