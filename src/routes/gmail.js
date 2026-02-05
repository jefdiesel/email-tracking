const express = require('express');
const router = express.Router();
const multer = require('multer');
const gmailService = require('../services/gmailService');
const { authenticate } = require('../middleware/auth');
const { validateGmailSend } = require('../middleware/validate');
const { apiRateLimit } = require('../middleware/rateLimit');
const { config } = require('../config/env');

// Configure multer for file attachments (memory storage, no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 25 * 1024 * 1024 // 25MB per file
  }
});

// GET /api/gmail/auth - Get Gmail OAuth URL
router.get('/auth', authenticate, (req, res) => {
  try {
    if (!config.GMAIL_CLIENT_ID || !config.GMAIL_CLIENT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'Gmail integration not configured. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.'
      });
    }

    // Use user ID as state for security
    const authUrl = gmailService.getAuthUrl(req.user.id);

    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Gmail auth URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Gmail authorization URL'
    });
  }
});

// GET /api/gmail/callback - Gmail OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/?gmail_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect('/?gmail_error=missing_parameters');
    }

    // State contains user ID
    const userId = state;

    // Exchange code for tokens
    const tokens = await gmailService.exchangeCodeForTokens(code);

    // Save tokens for user
    await gmailService.saveUserTokens(userId, tokens);

    // Redirect back to app with success
    res.redirect('/?gmail_connected=true');
  } catch (error) {
    console.error('Gmail callback error:', error);
    res.redirect('/?gmail_error=authorization_failed');
  }
});

// GET /api/gmail/status - Check Gmail connection status
router.get('/status', authenticate, async (req, res) => {
  try {
    const isConnected = await gmailService.isGmailConnected(req.user.id);

    if (!isConnected) {
      return res.json({
        success: true,
        connected: false,
        message: 'Gmail not connected'
      });
    }

    // Try to get profile to verify connection still works
    try {
      const profile = await gmailService.getGmailProfile(req.user.id);
      return res.json({
        success: true,
        connected: true,
        profile
      });
    } catch {
      // Token might be expired/revoked
      return res.json({
        success: true,
        connected: false,
        message: 'Gmail connection expired. Please reconnect.'
      });
    }
  } catch (error) {
    console.error('Gmail status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Gmail status'
    });
  }
});

// POST /api/gmail/disconnect - Disconnect Gmail
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await gmailService.disconnectGmail(req.user.id);

    res.json({
      success: true,
      message: 'Gmail disconnected successfully'
    });
  } catch (error) {
    console.error('Gmail disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Gmail'
    });
  }
});

// POST /api/gmail/send - Send tracked email via Gmail
router.post('/send', authenticate, apiRateLimit, upload.array('attachments', 5), validateGmailSend, async (req, res) => {
  try {
    const { to, cc, bcc, subject, body, isHtml } = req.body;

    const result = await gmailService.sendTrackedEmail(req.user.id, {
      to,
      cc,
      bcc,
      subject,
      body,
      isHtml: isHtml === 'true' || isHtml === true,
      attachments: req.files || []
    });

    res.json({
      success: true,
      message: 'Email sent successfully',
      ...result
    });
  } catch (error) {
    console.error('Gmail send error:', error);

    if (error.message.includes('not connected')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to send email. Please try again.'
    });
  }
});

module.exports = router;
