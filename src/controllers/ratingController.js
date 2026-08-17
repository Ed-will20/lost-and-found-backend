const pool = require('../config/database');

// Submit (or update) a rating + optional testimonial for a resolved claim.
// Either party in the claim (finder or claimer) can rate the other, once
// the item has been marked as returned.
exports.submitRating = async (req, res) => {
  try {
    const { claim_id } = req.params;
    const { score, testimonial, testimonial_public } = req.body;

    const parsedScore = parseInt(score, 10);
    if (isNaN(parsedScore) || parsedScore < 1 || parsedScore > 5) {
      return res.status(400).json({ error: 'Score must be between 1 and 5' });
    }

    const claimCheck = await pool.query(
      `SELECT c.*, i.user_id as item_owner_id, i.status as item_status
       FROM claims c
       JOIN items i ON c.item_id = i.id
       WHERE c.id = $1`,
      [claim_id]
    );

    if (claimCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimCheck.rows[0];

    if (claim.status !== 'approved') {
      return res.status(400).json({ error: 'This claim was never approved' });
    }

    if (claim.item_status !== 'resolved') {
      return res.status(400).json({ error: 'The item must be marked as returned before rating' });
    }

    const isFinder = claim.item_owner_id === req.userId;
    const isClaimer = claim.claimer_id === req.userId;

    if (!isFinder && !isClaimer) {
      return res.status(403).json({ error: 'Not authorized to rate this exchange' });
    }

    const rateeId = isFinder ? claim.claimer_id : claim.item_owner_id;
    const trimmedTestimonial = (testimonial || '').trim() || null;
    const isPublic = testimonial_public === true || testimonial_public === 'true';

    const result = await pool.query(
      `INSERT INTO ratings (claim_id, rater_id, ratee_id, score, testimonial, testimonial_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (claim_id, rater_id)
       DO UPDATE SET score = EXCLUDED.score,
                     testimonial = EXCLUDED.testimonial,
                     testimonial_public = EXCLUDED.testimonial_public,
                     updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [claim_id, req.userId, rateeId, parsedScore, trimmedTestimonial, isPublic]
    );

    // Recompute the ratee's average rating across all ratings received
    await pool.query(
      `UPDATE users SET rating = (
         SELECT ROUND(AVG(score)::numeric, 2) FROM ratings WHERE ratee_id = $1
       ), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [rateeId]
    );

    res.status(201).json({
      message: 'Rating submitted successfully',
      rating: result.rows[0]
    });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: 'Server error while submitting rating' });
  }
};

// Check whether the current user has already rated a given claim
// (used by the frontend to decide whether to show the rating prompt)
exports.getMyRatingForClaim = async (req, res) => {
  try {
    const { claim_id } = req.params;

    const result = await pool.query(
      'SELECT * FROM ratings WHERE claim_id = $1 AND rater_id = $2',
      [claim_id, req.userId]
    );

    res.json({ rating: result.rows[0] || null });
  } catch (error) {
    console.error('Get rating error:', error);
    res.status(500).json({ error: 'Server error while fetching rating' });
  }
};

// Converts a full name into a public-safe display name: first name +
// last initial (e.g. "Jordan Martinez" -> "Jordan M."). Falls back
// gracefully for single-word names or missing names.
function toPublicDisplayName(fullName) {
  if (!fullName || !fullName.trim()) return 'A student';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

// Public testimonials -- for outreach/LinkedIn material and (optionally)
// a homepage showcase. Only returns testimonials explicitly marked public.
// Disclosure level: first name + last initial only (never full name),
// per product decision.
exports.getPublicTestimonials = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await pool.query(
      `SELECT r.testimonial, r.score, r.created_at,
              u_ratee.full_name as ratee_full_name,
              i.title as item_title, i.category
       FROM ratings r
       JOIN claims c ON r.claim_id = c.id
       JOIN items i ON c.item_id = i.id
       JOIN users u_ratee ON r.ratee_id = u_ratee.id
       WHERE r.testimonial_public = TRUE AND r.testimonial IS NOT NULL
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const testimonials = result.rows.map((row) => ({
      testimonial: row.testimonial,
      score: row.score,
      created_at: row.created_at,
      item_title: row.item_title,
      category: row.category,
      ratee_display_name: toPublicDisplayName(row.ratee_full_name)
      // Note: ratee_full_name is intentionally NOT included in the response.
    }));

    res.json({ testimonials });
  } catch (error) {
    console.error('Get public testimonials error:', error);
    res.status(500).json({ error: 'Server error while fetching testimonials' });
  }
};
