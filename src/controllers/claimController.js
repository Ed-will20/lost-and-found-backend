const pool = require('../config/database');
const emailService = require('../services/emailService');

// Submit a claim for an item
exports.createClaim = async (req, res) => {
  try {
    const { item_id } = req.params;
    const { proof_description } = req.body;

    const itemCheck = await pool.query(
      `SELECT i.*, u.email as finder_email, u.full_name as finder_name
       FROM items i
       JOIN users u ON i.user_id = u.id
       WHERE i.id = $1 AND i.status = $2`,
      [item_id, 'found']
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or already claimed' });
    }

    const item = itemCheck.rows[0];

    if (item.user_id === req.userId) {
      return res.status(400).json({ error: 'You cannot claim your own item' });
    }

    const existingClaim = await pool.query(
      'SELECT * FROM claims WHERE item_id = $1 AND claimer_id = $2 AND status = $3',
      [item_id, req.userId, 'pending']
    );

    if (existingClaim.rows.length > 0) {
      return res.status(400).json({ error: 'You already have a pending claim for this item' });
    }

    const proof_images = req.files ? req.files.map(file => file.path) : [];

    // Proof images are required -- they're often what the finder actually
    // decides approval/rejection on, not just the text description.
    if (proof_images.length === 0) {
      return res.status(400).json({ error: 'At least one proof image is required to submit a claim' });
    }

    const result = await pool.query(
      `INSERT INTO claims (item_id, claimer_id, proof_images, proof_description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [item_id, req.userId, proof_images, proof_description]
    );

    // Notify the finder that a claim was submitted. Fire-and-forget --
    // failures are logged inside emailService and never block the response.
    const claimerResult = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.userId]);
    emailService.sendClaimSubmittedEmail({
      finderEmail: item.finder_email,
      finderName: item.finder_name,
      claimerName: claimerResult.rows[0]?.full_name || 'Someone',
      itemTitle: item.title
    });

    res.status(201).json({
      message: 'Claim submitted successfully',
      claim: result.rows[0]
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ error: 'Server error while submitting claim' });
  }
};

// Get all claims for an item (finder only)
exports.getItemClaims = async (req, res) => {
  try {
    const { item_id } = req.params;

    const itemCheck = await pool.query(
      'SELECT user_id FROM items WHERE id = $1',
      [item_id]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (itemCheck.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to view claims for this item' });
    }

    const result = await pool.query(
      `SELECT c.*,
              u.full_name as claimer_name,
              u.email as claimer_email,
              u.phone_number as claimer_phone,
              u.rating as claimer_rating
       FROM claims c
       JOIN users u ON c.claimer_id = u.id
       WHERE c.item_id = $1
       ORDER BY c.created_at DESC`,
      [item_id]
    );

    res.json({
      claims: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ error: 'Server error while fetching claims' });
  }
};

// Get user's submitted claims
exports.getMyClaims = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
              i.title as item_title,
              i.images as item_images,
              i.found_city,
              i.found_state,
              i.status as item_status,
              u.full_name as finder_name
       FROM claims c
       JOIN items i ON c.item_id = i.id
       JOIN users u ON i.user_id = u.id
       WHERE c.claimer_id = $1
       ORDER BY c.created_at DESC`,
      [req.userId]
    );

    res.json({
      claims: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get my claims error:', error);
    res.status(500).json({ error: 'Server error while fetching your claims' });
  }
};

// Approve a claim -- creates a chat between finder and claimer
exports.approveClaim = async (req, res) => {
  try {
    const { claim_id } = req.params;

    const claimCheck = await pool.query(
      `SELECT c.*, i.user_id as item_owner_id, i.id as item_id, i.title as item_title,
              u_claimer.email as claimer_email, u_claimer.full_name as claimer_name
       FROM claims c
       JOIN items i ON c.item_id = i.id
       JOIN users u_claimer ON c.claimer_id = u_claimer.id
       WHERE c.id = $1`,
      [claim_id]
    );

    if (claimCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimCheck.rows[0];

    if (claim.item_owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to approve this claim' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Approve this claim
      await client.query(
        'UPDATE claims SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['approved', claim_id]
      );

      // Reject all other pending claims for this item
      await client.query(
        `UPDATE claims SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
         WHERE item_id = $3 AND id != $4 AND status = $5`,
        ['rejected', 'Another claim was approved for this item.', claim.item_id, claim_id, 'pending']
      );

      // Update item status to claimed
      await client.query(
        'UPDATE items SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['claimed', claim.item_id]
      );

      // Create a chat between finder (item owner) and claimer
      const chatResult = await client.query(
        `INSERT INTO chats (item_id, finder_id, claimer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [claim.item_id, claim.item_owner_id, claim.claimer_id]
      );

      let chatId = chatResult.rows[0]?.id;

      // If chat already existed, fetch it
      if (!chatId) {
        const existingChat = await client.query(
          'SELECT id FROM chats WHERE item_id = $1 AND finder_id = $2 AND claimer_id = $3',
          [claim.item_id, claim.item_owner_id, claim.claimer_id]
        );
        chatId = existingChat.rows[0]?.id;
      }

      // Post an automatic first message in the chat
      if (chatId) {
        await client.query(
          `INSERT INTO messages (chat_id, sender_id, message_text)
           VALUES ($1, $2, $3)`,
          [
            chatId,
            claim.item_owner_id,
            `Hi! I've approved your claim for "${claim.item_title}". Let's coordinate how to return it -- feel free to suggest a public meeting place or a mailing address.`
          ]
        );

        await client.query(
          'UPDATE chats SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
          [chatId]
        );
      }

      await client.query('COMMIT');

      // Notify the claimant that their claim was approved. Fire-and-forget.
      emailService.sendClaimDecisionEmail({
        claimerEmail: claim.claimer_email,
        claimerName: claim.claimer_name,
        itemTitle: claim.item_title,
        approved: true,
        chatId
      });

      res.json({
        message: 'Claim approved successfully',
        chat_id: chatId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Approve claim error:', error);
    res.status(500).json({ error: 'Server error while approving claim' });
  }
};

// Reject a claim -- saves a reason
exports.rejectClaim = async (req, res) => {
  try {
    const { claim_id } = req.params;
    const { rejection_reason } = req.body;

    const claimCheck = await pool.query(
      `SELECT c.*, i.user_id as item_owner_id, i.title as item_title,
              u_claimer.email as claimer_email, u_claimer.full_name as claimer_name
       FROM claims c
       JOIN items i ON c.item_id = i.id
       JOIN users u_claimer ON c.claimer_id = u_claimer.id
       WHERE c.id = $1`,
      [claim_id]
    );

    if (claimCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimCheck.rows[0];

    if (claim.item_owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to reject this claim' });
    }

    const finalReason = rejection_reason || 'Your claim was not approved by the finder.';

    await pool.query(
      `UPDATE claims SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['rejected', finalReason, claim_id]
    );

    // Notify the claimant that their claim was rejected. Fire-and-forget.
    emailService.sendClaimDecisionEmail({
      claimerEmail: claim.claimer_email,
      claimerName: claim.claimer_name,
      itemTitle: claim.item_title,
      approved: false,
      rejectionReason: finalReason
    });

    res.json({ message: 'Claim rejected' });
  } catch (error) {
    console.error('Reject claim error:', error);
    res.status(500).json({ error: 'Server error while rejecting claim' });
  }
};

// Mark an approved claim's item as returned/resolved.
// Either the finder (item owner) or the claimer may trigger this --
// no mutual confirmation required, per product decision.
exports.resolveClaim = async (req, res) => {
  try {
    const { claim_id } = req.params;

    const claimCheck = await pool.query(
      `SELECT c.*, i.user_id as item_owner_id, i.id as item_id, i.status as item_status
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
      return res.status(400).json({ error: 'Only approved claims can be marked as returned' });
    }

    if (claim.item_owner_id !== req.userId && claim.claimer_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to resolve this claim' });
    }

    if (claim.item_status === 'resolved') {
      return res.status(400).json({ error: 'This item has already been marked as returned' });
    }

    await pool.query(
      `UPDATE items SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [claim.item_id]
    );

    res.json({
      message: 'Item marked as returned',
      claim_id: claim.id,
      item_id: claim.item_id
    });
  } catch (error) {
    console.error('Resolve claim error:', error);
    res.status(500).json({ error: 'Server error while resolving claim' });
  }
};
