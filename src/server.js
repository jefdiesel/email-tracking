const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { config, validateConfig } = require('./config/env');
const { initDatabase } = require('./config/database');
const authRoutes = require('./routes/auth');
const trackingRoutes = require('./routes/tracking');
const gmailRoutes = require('./routes/gmail');

const app = express();

// Trust proxy (Railway, Heroku, etc.) - required for correct IP detection
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging in development
if (config.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/gmail', gmailRoutes);

// Legacy route support (redirect old pixel URLs)
app.get('/track/:id/pixel.png', (req, res) => {
  res.redirect(301, `/api/track/${req.params.id}/pixel.png`);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: 'Not found' });
  } else {
    next();
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: config.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.log('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

// Start server
let server;

const start = async () => {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    await initDatabase();
    console.log('Database initialized');

    // Start listening
    server = app.listen(config.PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           EMAIL TRACKER - Secure Multi-User               ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: ${config.BASE_URL.padEnd(35)}║
║  Environment: ${config.NODE_ENV.padEnd(42)}║
║  Gmail Integration: ${(config.GMAIL_CLIENT_ID ? 'Configured' : 'Not configured').padEnd(36)}║
╚═══════════════════════════════════════════════════════════╝
      `);
    });

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();

module.exports = app;
