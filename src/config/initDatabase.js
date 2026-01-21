const pool = require('./database');

const createTables = async () => {
  try {
    console.log('🔧 Creating database tables...');

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20),
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        profile_picture_url TEXT,
        city VARCHAR(100),
        state VARCHAR(50),
        zip_code VARCHAR(10),
        verification_status VARCHAR(20) DEFAULT 'unverified',
        rating DECIMAL(3,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created');

    // Items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50),
        status VARCHAR(20) DEFAULT 'found',
        images TEXT[],
        found_address TEXT,
        found_city VARCHAR(100),
        found_state VARCHAR(50),
        found_zip VARCHAR(10),
        found_lat DECIMAL(10, 8),
        found_lng DECIMAL(11, 8),
        found_date DATE,
        is_sensitive BOOLEAN DEFAULT false,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Items table created');

    // Claims table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID REFERENCES items(id) ON DELETE CASCADE,
        claimer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        proof_images TEXT[],
        proof_description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Claims table created');

    // Chats table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID REFERENCES items(id) ON DELETE CASCADE,
        finder_id UUID REFERENCES users(id) ON DELETE CASCADE,
        claimer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Chats table created');

    // Messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        message_text TEXT NOT NULL,
        read_status BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Messages table created');

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_items_location ON items(found_lat, found_lng);
      CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
      CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
      CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    `);
    console.log('✅ Indexes created');

    console.log('🎉 Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
};

createTables();
