const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/tranch',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables
const initializeDatabase = async () => {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('borrower', 'funder', 'admin')) NOT NULL,
        approved BOOLEAN DEFAULT FALSE,
        stripe_customer_id TEXT,
        subscription_status TEXT DEFAULT 'inactive',
        company_name TEXT,
        company_type TEXT,
        investment_focus TEXT,
        typical_deal_size_min INTEGER,
        typical_deal_size_max INTEGER,
        years_experience INTEGER,
        aum INTEGER,
        phone TEXT,
        linkedin TEXT,
        bio TEXT,
        verification_status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add other tables here...
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

module.exports = { pool, initializeDatabase };