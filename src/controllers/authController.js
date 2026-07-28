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

// Known .edu domains mapped to a clean, human-readable school name.
// Add more entries here any time you outreach to a new campus.
const SCHOOL_NAME_MAP = {
  'sfsu.edu': 'San Francisco State University',
  'mail.sfsu.edu': 'San Francisco State University',
  'berkeley.edu': 'UC Berkeley',
  'stanford.edu': 'Stanford University',
  'sjsu.edu': 'San Jose State University',
  'ucla.edu': 'UCLA',
  'usc.edu': 'USC',
  'ucdavis.edu': 'UC Davis',
  'csulb.edu': 'Cal State Long Beach',
  'calpoly.edu': 'Cal Poly',
};

// Build a readable fallback name from an unmapped .edu domain,
// e.g. "some-college.edu" -> "Some College"
const fallbackSchoolName = (domain) => {
  const base = domain.replace(/\.edu$/i, '');
  return base
    .split(/[.\-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

// Determine .edu verification status + school name from an email address
const EDU_DOMAIN_REGEX = /\.edu$/i;
const getSchoolInfo = (email) => {
  const domain = (email || '').split('@')[1]?.toLowerCase() || '';
  const verified = EDU_DOMAIN_REGEX.test(domain);
  if (!verified) {
    return { school_verified: false, school_domain: null, school_name: null };
  }
  return {
    school_verified: true,
    school_domain: domain,
    school_name: SCHOOL_NAME_MAP[domain] || fallbackSchoolName(domain),
  };
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
    const { school_verified, school_domain, school_name } = getSchoolInfo(email);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone_number, city, state, zip_code, referral_source, school_verified, school_domain, school_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, email, full_name, city, state, zip_code, referral_source, school_verified, school_domain, school_name, created_at`,
      [email, password_hash, full_name, phone_number, city, state, zip_code, referral_source || null, school_verified, school_domain, school_name]
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
        zip_code: user.zip_code,
        school_verified: user.school_verified,
        school_domain: user.school_domain,
        school_name: user.school_name
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
        profile_picture_url: user.profile_picture_url,
        school_verified: user.school_verified,
        school_domain: user.school_domain,
        school_name: user.school_name
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

      const needsPictureBackfill = !user.profile_picture_url && picture;
      const needsSchoolBackfill = !user.school_verified;
      const schoolInfo = needsSchoolBackfill ? getSchoolInfo(email) : null;

      if (needsPictureBackfill || (schoolInfo && schoolInfo.school_verified)) {
        const updateRes = await pool.query(
          `UPDATE users
           SET profile_picture_url = COALESCE($1, profile_picture_url),
               school_verified = COALESCE(NULLIF($2, FALSE), school_verified, FALSE),
               school_domain = COALESCE($3, school_domain),
               school_name = COALESCE($4, school_name),
               updated_at = NOW()
           WHERE id = $5
           RETURNING id, email, full_name, city, state, zip_code, profile_picture_url, phone_number, rating, referral_source, school_verified, school_domain, school_name, created_at`,
          [
            needsPictureBackfill ? picture : null,
            schoolInfo ? schoolInfo.school_verified : false,
            schoolInfo ? schoolInfo.school_domain : null,
            schoolInfo ? schoolInfo.school_name : null,
            user.id
          ]
        );
        user = updateRes.rows[0];
      }
    } else {
      // New user — create account with no usable password (random hash, never used)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(randomPassword, salt);
      const { school_verified, school_domain, school_name } = getSchoolInfo(email);

      const insertRes = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, profile_picture_url, referral_source, school_verified, school_domain, school_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, full_name, city, state, zip_code, profile_picture_url, phone_number, rating, referral_source, school_verified, school_domain, school_name, created_at`,
        [email, password_hash, name || email.split('@')[0], picture || null, referral_source || null, school_verified, school_domain, school_name]
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
        school_verified: user.school_verified,
        school_domain: user.school_domain,
        school_name: user.school_name,
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
              profile_picture_url, verification_status, rating, school_verified, school_domain, school_name, created_at
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
                 profile_picture_url, verification_status, rating, school_verified, school_domain, school_name, created_at`,
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
