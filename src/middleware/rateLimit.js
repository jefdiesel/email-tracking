const { config } = require('../config/env');

// Simple in-memory rate limiter
// For production, consider using redis-based rate limiting
const rateLimitStore = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > config.RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

const getClientIdentifier = (req) => {
  // Use user ID if authenticated, otherwise IP
  if (req.user) {
    return `user:${req.user.id}`;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : req.headers['x-real-ip'] || req.ip || 'unknown';

  return `ip:${ip}`;
};

const rateLimit = (options = {}) => {
  const windowMs = options.windowMs || config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests || config.RATE_LIMIT_MAX_REQUESTS;
  const message = options.message || 'Too many requests, please try again later.';

  return (req, res, next) => {
    const clientId = getClientIdentifier(req);
    const now = Date.now();

    let clientData = rateLimitStore.get(clientId);

    if (!clientData || now - clientData.windowStart > windowMs) {
      clientData = {
        windowStart: now,
        requests: 0
      };
    }

    clientData.requests++;
    rateLimitStore.set(clientId, clientData);

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - clientData.requests);
    const resetTime = Math.ceil((clientData.windowStart + windowMs - now) / 1000);

    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': resetTime
    });

    if (clientData.requests > maxRequests) {
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: resetTime
      });
    }

    next();
  };
};

// Stricter rate limit for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Too many authentication attempts, please try again later.'
});

// Standard API rate limit
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100
});

// Relaxed rate limit for tracking pixels (needs to be higher)
const pixelRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: 'Rate limit exceeded.'
});

module.exports = {
  rateLimit,
  authRateLimit,
  apiRateLimit,
  pixelRateLimit
};
