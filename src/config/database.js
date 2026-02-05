const { Pool } = require('pg');

// PostgreSQL connection - Railway provides DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        gmail_tokens TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tracked emails table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracked_emails (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        recipient TEXT NOT NULL,
        sender_email TEXT,
        gmail_message_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Email opens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_opens (
        id TEXT PRIMARY KEY,
        email_id TEXT NOT NULL REFERENCES tracked_emails(id) ON DELETE CASCADE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip TEXT,
        user_agent TEXT,
        referer TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        country_code TEXT,
        isp TEXT,
        org TEXT,
        timezone TEXT,
        lat REAL,
        lon REAL,
        is_mobile BOOLEAN DEFAULT FALSE,
        is_proxy BOOLEAN DEFAULT FALSE,
        is_hosting BOOLEAN DEFAULT FALSE,
        browser TEXT,
        browser_version TEXT,
        os TEXT,
        os_version TEXT,
        device_type TEXT,
        is_bot BOOLEAN DEFAULT FALSE,
        language TEXT
      )
    `);

    // Add new columns if they don't exist (migration for existing databases)
    const newColumns = [
      { name: 'country_code', type: 'TEXT' },
      { name: 'org', type: 'TEXT' },
      { name: 'timezone', type: 'TEXT' },
      { name: 'lat', type: 'REAL' },
      { name: 'lon', type: 'REAL' },
      { name: 'is_mobile', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'is_proxy', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'is_hosting', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'browser', type: 'TEXT' },
      { name: 'browser_version', type: 'TEXT' },
      { name: 'os', type: 'TEXT' },
      { name: 'os_version', type: 'TEXT' },
      { name: 'device_type', type: 'TEXT' },
      { name: 'is_bot', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'language', type: 'TEXT' }
    ];
    for (const col of newColumns) {
      try {
        await client.query(`ALTER TABLE email_opens ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      } catch (e) {
        // Column might already exist
      }
    }

    // Sessions table for refresh tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attachments table (files stored in R2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        email_id TEXT NOT NULL REFERENCES tracked_emails(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mimetype TEXT,
        size INTEGER,
        r2_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attachment downloads table (tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS attachment_downloads (
        id TEXT PRIMARY KEY,
        attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip TEXT,
        user_agent TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        country_code TEXT,
        isp TEXT,
        org TEXT,
        timezone TEXT,
        lat REAL,
        lon REAL,
        is_mobile BOOLEAN DEFAULT FALSE,
        is_proxy BOOLEAN DEFAULT FALSE,
        is_hosting BOOLEAN DEFAULT FALSE,
        browser TEXT,
        browser_version TEXT,
        os TEXT,
        os_version TEXT,
        device_type TEXT,
        is_bot BOOLEAN DEFAULT FALSE,
        language TEXT
      )
    `);

    // Create indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tracked_emails_user_id ON tracked_emails(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_opens_email_id ON email_opens(email_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attachment_downloads_attachment_id ON attachment_downloads(attachment_id)`);

    console.log('Database tables initialized');
  } finally {
    client.release();
  }
};

// Database query methods
const dbRun = async (sql, params = []) => {
  // Convert ? placeholders to $1, $2, etc for PostgreSQL
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  const result = await pool.query(pgSql, params);
  return { rowCount: result.rowCount, changes: result.rowCount };
};

const dbGet = async (sql, params = []) => {
  // Convert ? placeholders to $1, $2, etc for PostgreSQL
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  const result = await pool.query(pgSql, params);
  return result.rows[0] || null;
};

const dbAll = async (sql, params = []) => {
  // Convert ? placeholders to $1, $2, etc for PostgreSQL
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  const result = await pool.query(pgSql, params);
  return result.rows;
};

// Graceful shutdown
const closeDatabase = async () => {
  await pool.end();
};

module.exports = {
  pool,
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
  closeDatabase
};
