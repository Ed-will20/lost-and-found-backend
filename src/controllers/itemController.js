const pool = require('../config/database');

// Create new item (found or lost)
exports.createItem = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      found_address,
      found_city,
      found_state,
      found_zip,
      found_lat,
      found_lng,
      found_date,
      is_sensitive,
      tags,
      post_type
    } = req.body;

    const images = req.files ? req.files.map(file => file.path) : [];

    const latitude = found_lat && found_lat !== '' ? parseFloat(found_lat) : null;
    const longitude = found_lng && found_lng !== '' ? parseFloat(found_lng) : null;

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    const resolvedPostType = post_type === 'lost' ? 'lost' : 'found';

    const result = await pool.query(
      `INSERT INTO items (
        user_id, title, description, category, images,
        found_address, found_city, found_state, found_zip,
        found_lat, found_lng, found_date, is_sensitive, tags, post_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        req.userId, title, description, category, images,
        found_address, found_city, found_state, found_zip,
        latitude, longitude, found_date, is_sensitive || false,
        parsedTags, resolvedPostType
      ]
    );

    res.status(201).json({
      message: 'Item posted successfully',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Server error while creating item' });
  }
};

// Get all items with filters
exports.getItems = async (req, res) => {
  try {
    const {
      category,
      state,
      city,
      status = 'found',
      post_type,
      limit = 50,
      offset = 0,
      search
    } = req.query;

    let query = `
      SELECT i.*, u.full_name as finder_name, u.rating as finder_rating
      FROM items i
      JOIN users u ON i.user_id = u.id
      WHERE i.status = $1
    `;
    const params = [status];
    let paramIndex = 2;

    if (post_type) {
      query += ` AND i.post_type = $${paramIndex}`;
      params.push(post_type);
      paramIndex++;
    }

    if (category) {
      query += ` AND i.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (state) {
      query += ` AND i.found_state ILIKE $${paramIndex}`;
      params.push(state);
      paramIndex++;
    }

    if (city) {
      query += ` AND i.found_city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (search) {
      query += ` AND (i.title ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      items: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Server error while fetching items' });
  }
};

// Get single item by ID
exports.getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT i.*,
              u.full_name as finder_name,
              u.email as finder_email,
              u.phone_number as finder_phone,
              u.rating as finder_rating,
              u.profile_picture_url as finder_picture
       FROM items i
       JOIN users u ON i.user_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Server error while fetching item' });
  }
};

// Search items by location (nearby)
exports.searchNearby = async (req, res) => {
  try {
    const { lat, lng, radius = 50 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(searchRadius)) {
      return res.status(400).json({ error: 'Invalid coordinates or radius' });
    }

    const latDelta = searchRadius / 69;
    const lngDelta = searchRadius / (69 * Math.cos(latitude * Math.PI / 180));

    const result = await pool.query(
      `SELECT i.*, u.full_name as finder_name, u.rating as finder_rating
       FROM items i
       JOIN users u ON i.user_id = u.id
       WHERE i.status = 'found'
         AND i.found_lat IS NOT NULL
         AND i.found_lng IS NOT NULL
         AND i.found_lat BETWEEN $1 AND $2
         AND i.found_lng BETWEEN $3 AND $4
       ORDER BY i.created_at DESC
       LIMIT 50`,
      [
        latitude - latDelta,
        latitude + latDelta,
        longitude - lngDelta,
        longitude + lngDelta
      ]
    );

    res.json({
      items: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Search nearby error:', error);
    res.status(500).json({ error: 'Server error while searching nearby items' });
  }
};

// Update item
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;

    const itemCheck = await pool.query(
      'SELECT user_id FROM items WHERE id = $1',
      [id]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (itemCheck.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this item' });
    }

    const {
      title,
      description,
      category,
      found_address,
      found_city,
      found_state,
      found_zip,
      found_lat,
      found_lng,
      found_date,
      tags,
      post_type
    } = req.body;

    let images = null;
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => file.path);
    }

    let parsedTags = null;
    if (tags !== undefined && tags !== '') {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    const latitude = found_lat && found_lat !== '' ? parseFloat(found_lat) : null;
    const longitude = found_lng && found_lng !== '' ? parseFloat(found_lng) : null;

    const resolvedPostType = (post_type === 'lost' || post_type === 'found') ? post_type : null;

    const result = await pool.query(
      `UPDATE items SET
        title        = COALESCE($1,  title),
        description  = COALESCE($2,  description),
        category     = COALESCE($3,  category),
        found_address= COALESCE($4,  found_address),
        found_city   = COALESCE($5,  found_city),
        found_state  = COALESCE($6,  found_state),
        found_zip    = COALESCE($7,  found_zip),
        found_lat    = COALESCE($8,  found_lat),
        found_lng    = COALESCE($9,  found_lng),
        found_date   = COALESCE($10, found_date),
        tags         = COALESCE($11, tags),
        images       = COALESCE($12, images),
        post_type    = COALESCE($13, post_type),
        updated_at   = CURRENT_TIMESTAMP
      WHERE id = $14
      RETURNING *`,
      [
        title        || null,
        description  || null,
        category     || null,
        found_address|| null,
        found_city   || null,
        found_state  || null,
        found_zip    || null,
        latitude,
        longitude,
        found_date   || null,
        parsedTags,
        images,
        resolvedPostType,
        id
      ]
    );

    res.json({ message: 'Item updated successfully', item: result.rows[0] });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Server error while updating item' });
  }
};

// Delete item
exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;

    const itemCheck = await pool.query(
      'SELECT user_id FROM items WHERE id = $1',
      [id]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (itemCheck.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this item' });
    }

    await pool.query('DELETE FROM items WHERE id = $1', [id]);

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Server error while deleting item' });
  }
};

// Get user's posted items
exports.getMyItems = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json({
      items: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get my items error:', error);
    res.status(500).json({ error: 'Server error while fetching your items' });
  }
};
