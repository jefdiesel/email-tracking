const express = require('express');
const router = express.Router();
const trackingService = require('../services/trackingService');
const { authenticate } = require('../middleware/auth');
const { validateCreateEmail, validateTrackingId } = require('../middleware/validate');
const { apiRateLimit, pixelRateLimit } = require('../middleware/rateLimit');

// Helper to extract client IP (handles Railway, Cloudflare, and other proxies)
const getClientIP = (req) => {
  // Try various headers in order of reliability
  const cfConnectingIP = req.headers['cf-connecting-ip']; // Cloudflare
  if (cfConnectingIP) return cfConnectingIP;

  const trueClientIP = req.headers['true-client-ip']; // Akamai, Cloudflare Enterprise
  if (trueClientIP) return trueClientIP;

  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // Get the first (original client) IP from the chain
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIP = req.headers['x-real-ip'];
  if (xRealIP) return xRealIP;

  // Fallback to Express's req.ip
  const ip = req.ip;
  // Remove IPv6 prefix if present
  if (ip && ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }

  return ip || 'Unknown';
};

// POST /api/track/create - Create tracked email
router.post('/create', authenticate, apiRateLimit, validateCreateEmail, async (req, res) => {
  try {
    const { subject, recipient, senderEmail } = req.body;
    const trackedEmail = await trackingService.createTrackedEmail(req.user.id, {
      subject,
      recipient,
      senderEmail
    });

    res.status(201).json({
      success: true,
      email: trackedEmail
    });
  } catch (error) {
    console.error('Create tracked email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create tracked email'
    });
  }
});

// GET /api/track/:id/pixel.png - Tracking pixel (no auth required)
router.get('/:id/pixel.png', pixelRateLimit, async (req, res) => {
  try {
    const { id } = req.params;

    // Record the open
    await trackingService.recordOpen(id, {
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer']
    });

    // Return 1x1 transparent PNG with no-cache headers
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': trackingService.TRACKING_PIXEL.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    res.send(trackingService.TRACKING_PIXEL);
  } catch (error) {
    // Still return pixel even on error
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.send(trackingService.TRACKING_PIXEL);
  }
});

// GET /api/track/emails - List all tracked emails
router.get('/emails', authenticate, apiRateLimit, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await trackingService.getAllEmails(req.user.id, { page, limit });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve emails'
    });
  }
});

// GET /api/track/stats - Get tracking statistics
router.get('/stats', authenticate, apiRateLimit, async (req, res) => {
  try {
    const stats = await trackingService.getStats(req.user.id);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

// GET /api/track/emails/:id - Get email details
router.get('/emails/:id', authenticate, apiRateLimit, validateTrackingId, async (req, res) => {
  try {
    const email = await trackingService.getEmailDetails(req.user.id, req.params.id);

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    res.json({
      success: true,
      email
    });
  } catch (error) {
    console.error('Get email details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve email details'
    });
  }
});

// DELETE /api/track/emails/:id - Delete tracked email
router.delete('/emails/:id', authenticate, apiRateLimit, validateTrackingId, async (req, res) => {
  try {
    const deleted = await trackingService.deleteEmail(req.user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    res.json({
      success: true,
      message: 'Email deleted successfully'
    });
  } catch (error) {
    console.error('Delete email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete email'
    });
  }
});

module.exports = router;
