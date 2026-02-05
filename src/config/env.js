require('dotenv').config();
const crypto = require('crypto');

// Auto-generate JWT secret if not provided (persists for this process only)
const getJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  // Generate a random secret - WARNING: this changes on restart!
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: JWT_SECRET not set. Generated temporary secret. Users will be logged out on restart!');
  return generated;
};

// Try to detect Railway URL automatically
const getBaseUrl = () => {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.RAILWAY_STATIC_URL) {
    return process.env.RAILWAY_STATIC_URL;
  }
  return `http://localhost:${process.env.PORT || 3000}`;
};

const config = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  BASE_URL: getBaseUrl(),

  // JWT
  JWT_SECRET: getJwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',

  // Gmail OAuth2
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || '',
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || '',
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || `${getBaseUrl()}/api/gmail/callback`,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // User whitelist (comma-separated emails, empty = allow all)
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS
    ? process.env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase())
    : [],

  // Geolocation
  GEO_API_URL: 'https://ip-api.com/json',

  // Cloudflare R2
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'buggers',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '',
};

// Validate config - now just warns instead of crashing
const validateConfig = () => {
  const warnings = [];

  if (config.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
      warnings.push('JWT_SECRET not set - using temporary secret (users logged out on restart)');
    }
    if (!process.env.BASE_URL && !process.env.RAILWAY_PUBLIC_DOMAIN) {
      warnings.push('BASE_URL not set - tracking pixel URLs may be incorrect');
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn(`   - ${w}`));
    console.warn('');
  }
};

module.exports = { config, validateConfig };
