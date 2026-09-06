const pool = require('../config/database');

// Must run AFTER authMiddleware (needs req.userId already set). Looks up
// the requesting user's actual email from the DB rather than trusting
// anything in the JWT payload, since the token only carries userId.
const adminOnly = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
    const email = result.rows[0]?.email;

    if (!email || email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error during authorization check' });
  }
};

module.exports = adminOnly;
