const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { dbGet } = require('../config/database');

// Authenticate JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Verify user still exists
    const user = await dbGet('SELECT id, email, name FROM users WHERE id = ?', [decoded.userId]);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token.'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.'
    });
  }
};

// Optional auth - doesn't fail if no token, just sets req.user if valid
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const user = await dbGet('SELECT id, email, name FROM users WHERE id = ?', [decoded.userId]);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch {
    // Ignore errors, just proceed without user
    next();
  }
};

module.exports = { authenticate, optionalAuth };
