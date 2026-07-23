const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/database');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Register new user
exports.register = async (req, res) => {
  try {
    const { email, password, full_name, phone_number, city, state, zip_code, referral_source } = req.body;
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone_number, city, state, zip_code, referral_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, full_name, city, state, zip_code, referral_source, created_at`,
      [email, password_hash, full_name, phone_number, city, state, zip_code, referral_source || null]
    );
    const user = result.rows[0];
    const token = generateToken(user.id);
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        city: user.city,
        state: user.state,
        zip_code: user.zip_code
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google Sign-In. Please continue with Google.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateToken(user.id);
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        city: user.city,
        state: user.state,
        zip_code: user.zip_code,
        profile_picture_url: user.profile_picture_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Google OAuth login/register
exports.googleAuth = async (req, res) => {
  try {
    const { credential, referral_source } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    // Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    // Check if user already exists
    let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (result.rows.length > 0) {
      // Existing user — log them in
      user = result.rows[0];

      // Backfill profile picture if they don't have one yet
      if (!user.profile_picture_url && picture) {
        const updateRes = await pool.query(
          `UPDATE users SET profile_picture_url = $1, updated_at = NOW() WHERE id = $2
           RETURNING id, email, full_name, city, state, zip_code, profile_picture_url, phone_number, rating, referral_source, created_at`,
          [picture, user.id]
        );
        user = updateRes.rows[0];
      }
    } else {
      // New user — create account with no usable password (random hash, never used)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(randomPassword, salt);

      const insertRes = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, profile_picture_url, referral_source)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name, city, state, zip_code, profile_picture_url, phone_number, rating, referral_source, created_at`,
        [email, password_hash, name || email.split('@')[0], picture || null, referral_source || null]
      );
      user = insertRes.rows[0];
    }

    const token = generateToken(user.id);
    res.json({
      message: 'Google login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        city: user.city,
        state: user.state,
        zip_code: user.zip_code,
        profile_picture_url: user.profile_picture_url,
        phone_number: user.phone_number,
        rating: user.rating,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Google authentication failed' });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, phone_number, city, state, zip_code,
              profile_picture_url, verification_status, rating, created_at
       FROM users WHERE id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Upload/replace profile picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const profile_picture_url = req.file.path;

    const result = await pool.query(
      `UPDATE users SET profile_picture_url = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, phone_number, city, state, zip_code,
                 profile_picture_url, verification_status, rating, created_at`,
      [profile_picture_url, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile picture updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: 'Server error while uploading profile picture' });
  }
};
