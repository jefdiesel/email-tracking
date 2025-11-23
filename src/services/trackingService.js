const crypto = require('crypto');
const { config } = require('../config/env');
const { dbRun, dbGet, dbAll } = require('../config/database');

const generateTrackingId = () => crypto.randomBytes(16).toString('hex');

// 1x1 transparent PNG
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const createTrackedEmail = async (userId, { subject, recipient, senderEmail }) => {
  const id = generateTrackingId();
  const createdAt = new Date().toISOString();

  await dbRun(
    `INSERT INTO tracked_emails (id, user_id, subject, recipient, sender_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, subject, recipient, senderEmail, createdAt]
  );

  const pixelUrl = `${config.BASE_URL}/api/track/${id}/pixel.png`;
  const htmlSnippet = `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  return {
    id,
    subject,
    recipient,
    senderEmail,
    createdAt,
    pixelUrl,
    htmlSnippet
  };
};

const recordOpen = async (emailId, { ip, userAgent, referer }) => {
  console.log('recordOpen called with IP:', ip);

  // Verify email exists (no user check - pixels work for anyone)
  const email = await dbGet('SELECT id FROM tracked_emails WHERE id = ?', [emailId]);
  if (!email) {
    return null;
  }

  // Get geolocation
  let location = { city: 'Unknown', region: 'Unknown', country: 'Unknown', isp: 'Unknown' };

  const isLocalIP = !ip ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.');

  console.log('isLocalIP:', isLocalIP);

  if (!isLocalIP) {
    try {
      const geoUrl = `${config.GEO_API_URL}/${ip}?fields=status,country,regionName,city,isp`;
      console.log('Fetching geolocation from:', geoUrl);
      const response = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
      const geo = await response.json();
      console.log('Geolocation response:', geo);
      if (geo.status === 'success') {
        location = {
          city: geo.city || 'Unknown',
          region: geo.regionName || 'Unknown',
          country: geo.country || 'Unknown',
          isp: geo.isp || 'Unknown'
        };
      } else {
        console.log('Geolocation failed with status:', geo.status, geo.message);
      }
    } catch (err) {
      console.error('Geolocation error:', err.message);
    }
  } else {
    console.log('Skipping geolocation for local IP');
  }

  const id = generateTrackingId();
  const timestamp = new Date().toISOString();

  await dbRun(
    `INSERT INTO email_opens (id, email_id, timestamp, ip, user_agent, referer, city, region, country, isp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, emailId, timestamp, ip || 'Unknown', userAgent, referer, location.city, location.region, location.country, location.isp]
  );

  return { id, emailId, timestamp, ip, location, userAgent, referer };
};

const getAllEmails = async (userId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const emails = await dbAll(
    `SELECT * FROM tracked_emails WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  const total = await dbGet(
    'SELECT COUNT(*) as count FROM tracked_emails WHERE user_id = ?',
    [userId]
  );

  // Add metrics to each email
  const emailsWithMetrics = await Promise.all(
    emails.map(async (email) => {
      const opens = await dbAll(
        'SELECT ip FROM email_opens WHERE email_id = ?',
        [email.id]
      );
      const uniqueIPs = new Set(opens.map((o) => o.ip));
      const lastOpen = await dbGet(
        'SELECT timestamp FROM email_opens WHERE email_id = ? ORDER BY timestamp DESC LIMIT 1',
        [email.id]
      );

      return {
        ...email,
        openCount: opens.length,
        uniqueOpens: uniqueIPs.size,
        forwardDetected: uniqueIPs.size > 1,
        lastOpenedAt: lastOpen?.timestamp || null,
        pixelUrl: `${config.BASE_URL}/api/track/${email.id}/pixel.png`
      };
    })
  );

  return {
    emails: emailsWithMetrics,
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(total.count / limit)
    }
  };
};

const getEmailDetails = async (userId, emailId) => {
  const email = await dbGet(
    'SELECT * FROM tracked_emails WHERE id = ? AND user_id = ?',
    [emailId, userId]
  );

  if (!email) {
    return null;
  }

  const opens = await dbAll(
    'SELECT * FROM email_opens WHERE email_id = ? ORDER BY timestamp ASC',
    [emailId]
  );

  // Group opens by IP
  const byIP = {};
  opens.forEach((open) => {
    if (!byIP[open.ip]) {
      byIP[open.ip] = [];
    }
    byIP[open.ip].push(open);
  });

  const readers = Object.entries(byIP).map(([ip, ipOpens]) => ({
    ip,
    location: {
      city: ipOpens[0].city,
      region: ipOpens[0].region,
      country: ipOpens[0].country,
      isp: ipOpens[0].isp
    },
    userAgent: ipOpens[0].user_agent,
    openCount: ipOpens.length,
    firstOpen: ipOpens[0].timestamp,
    lastOpen: ipOpens[ipOpens.length - 1].timestamp
  }));

  return {
    ...email,
    pixelUrl: `${config.BASE_URL}/api/track/${email.id}/pixel.png`,
    htmlSnippet: `<img src="${config.BASE_URL}/api/track/${email.id}/pixel.png" width="1" height="1" style="display:none;" alt="" />`,
    openCount: opens.length,
    uniqueOpens: readers.length,
    forwardDetected: readers.length > 1,
    opens,
    readers
  };
};

const deleteEmail = async (userId, emailId) => {
  const result = await dbRun(
    'DELETE FROM tracked_emails WHERE id = ? AND user_id = ?',
    [emailId, userId]
  );
  return result.changes > 0;
};

const getStats = async (userId) => {
  const totalEmails = await dbGet(
    'SELECT COUNT(*) as count FROM tracked_emails WHERE user_id = ?',
    [userId]
  );

  const totalOpens = await dbGet(
    `SELECT COUNT(*) as count FROM email_opens
     WHERE email_id IN (SELECT id FROM tracked_emails WHERE user_id = ?)`,
    [userId]
  );

  const openedEmails = await dbGet(
    `SELECT COUNT(DISTINCT email_id) as count FROM email_opens
     WHERE email_id IN (SELECT id FROM tracked_emails WHERE user_id = ?)`,
    [userId]
  );

  const recentOpens = await dbAll(
    `SELECT eo.*, te.subject, te.recipient
     FROM email_opens eo
     JOIN tracked_emails te ON eo.email_id = te.id
     WHERE te.user_id = ?
     ORDER BY eo.timestamp DESC LIMIT 10`,
    [userId]
  );

  return {
    totalEmails: totalEmails.count,
    totalOpens: totalOpens.count,
    openedEmails: openedEmails.count,
    openRate: totalEmails.count > 0 ? ((openedEmails.count / totalEmails.count) * 100).toFixed(1) : 0,
    recentOpens
  };
};

module.exports = {
  TRACKING_PIXEL,
  createTrackedEmail,
  recordOpen,
  getAllEmails,
  getEmailDetails,
  deleteEmail,
  getStats
};
