const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('../config/env');
const { dbRun, dbGet, dbAll } = require('../config/database');

const generateId = () => crypto.randomBytes(16).toString('hex');

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');

  return { accessToken, refreshToken };
};

const register = async ({ email, password, name }) => {
  // Check whitelist (if configured)
  if (config.ALLOWED_EMAILS.length > 0) {
    if (!config.ALLOWED_EMAILS.includes(email.toLowerCase())) {
      throw new Error('Registration is restricted. Your email is not on the allowed list.');
    }
  }

  // Check if user exists
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    throw new Error('Email already registered');
  }

  const id = generateId();
  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

  await dbRun(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
    [id, email, passwordHash, name || null]
  );

  const { accessToken, refreshToken } = generateTokens(id);

  // Store refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun(
    'INSERT INTO sessions (id, user_id, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
    [generateId(), id, refreshToken, expiresAt]
  );

  return {
    user: { id, email, name },
    accessToken,
    refreshToken
  };
};

const login = async ({ email, password }) => {
  const user = await dbGet(
    'SELECT id, email, password_hash, name FROM users WHERE email = ?',
    [email]
  );

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw new Error('Invalid email or password');
  }

  const { accessToken, refreshToken } = generateTokens(user.id);

  // Store refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun(
    'INSERT INTO sessions (id, user_id, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
    [generateId(), user.id, refreshToken, expiresAt]
  );

  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken
  };
};

const refreshAccessToken = async (refreshToken) => {
  const session = await dbGet(
    'SELECT * FROM sessions WHERE refresh_token = ? AND expires_at > NOW()',
    [refreshToken]
  );

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  const user = await dbGet('SELECT id, email, name FROM users WHERE id = ?', [session.user_id]);
  if (!user) {
    throw new Error('User not found');
  }

  // Generate new tokens
  const tokens = generateTokens(user.id);

  // Update session with new refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun(
    'UPDATE sessions SET refresh_token = ?, expires_at = ? WHERE id = ?',
    [tokens.refreshToken, expiresAt, session.id]
  );

  return {
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  };
};

const logout = async (refreshToken) => {
  await dbRun('DELETE FROM sessions WHERE refresh_token = ?', [refreshToken]);
};

const logoutAll = async (userId) => {
  await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]);
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }

  const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!validPassword) {
    throw new Error('Current password is incorrect');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
  await dbRun('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    newPasswordHash,
    new Date().toISOString(),
    userId
  ]);

  // Invalidate all sessions
  await logoutAll(userId);
};

const deleteAccount = async (userId, password) => {
  const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw new Error('Password is incorrect');
  }

  // Delete user (cascades to sessions, emails, opens)
  await dbRun('DELETE FROM users WHERE id = ?', [userId]);
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
  changePassword,
  deleteAccount
};
