const { Pool } = require('pg');

// Don't require dotenv in production - Railway provides env vars directly
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Prefer DATABASE_URL over individual variables
const connectionString = process.env.DATABASE_URL;

console.log('🔍 Database connection check:');
console.log('DATABASE_URL exists:', !!connectionString);
console.log('Connection string starts with:', connectionString ? connectionString.substring(0, 20) + '...' : 'NOT FOUND');

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
