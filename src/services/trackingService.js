const crypto = require('crypto');
const { config } = require('../config/env');
const { dbRun, dbGet, dbAll } = require('../config/database');

const generateTrackingId = () => crypto.randomBytes(16).toString('hex');

// Get timestamp in EST for database storage
const getESTTimestamp = () => {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/(\d+)\/(\d+)\/(\d+),\s/, '$3-$1-$2 ');
};

// Parse user agent string
const parseUserAgent = (ua) => {
  if (!ua) return { browser: 'Unknown', browserVersion: '', os: 'Unknown', osVersion: '', deviceType: 'Unknown', isBot: false, isProxy: false, proxyName: null };

  const result = {
    browser: 'Unknown',
    browserVersion: '',
    os: 'Unknown',
    osVersion: '',
    deviceType: 'Desktop',
    isBot: false,
    isProxy: false,
    proxyName: null
  };

  // Email proxy detection (these mask the real user's info)
  if (/GoogleImageProxy|ggpht\.com/i.test(ua)) {
    result.isProxy = true;
    result.proxyName = 'Gmail Proxy';
    result.browser = 'Gmail Proxy';
    result.os = 'Google Servers';
    result.deviceType = 'Email Proxy';
    return result;
  }
  if (/YahooMailProxy/i.test(ua)) {
    result.isProxy = true;
    result.proxyName = 'Yahoo Mail Proxy';
    result.browser = 'Yahoo Mail Proxy';
    result.os = 'Yahoo Servers';
    result.deviceType = 'Email Proxy';
    return result;
  }
  if (/Outlook-iOS|Microsoft Outlook/i.test(ua)) {
    result.isProxy = true;
    result.proxyName = 'Outlook Proxy';
    result.browser = 'Outlook';
    result.deviceType = 'Email Proxy';
    return result;
  }

  // Bot detection
  const botPatterns = /bot|crawler|spider|crawling|facebookexternalhit|slurp|googlebot|bingbot|yandex|baidu|duckduck|sogou|exabot|ia_archiver|semrush|ahref|mj12bot|dotbot|petalbot|bytespider/i;
  if (botPatterns.test(ua)) {
    result.isBot = true;
    result.deviceType = 'Bot';
  }

  // Browser detection
  if (/Edg\//i.test(ua)) {
    result.browser = 'Edge';
    result.browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] || '';
  } else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) {
    result.browser = 'Opera';
    result.browserVersion = ua.match(/(?:OPR|Opera)\/([\d.]+)/)?.[1] || '';
  } else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) {
    result.browser = 'Chrome';
    result.browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || '';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    result.browser = 'Safari';
    result.browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] || '';
  } else if (/Firefox/i.test(ua)) {
    result.browser = 'Firefox';
    result.browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] || '';
  } else if (/MSIE|Trident/i.test(ua)) {
    result.browser = 'Internet Explorer';
    result.browserVersion = ua.match(/(?:MSIE |rv:)([\d.]+)/)?.[1] || '';
  }

  // OS detection
  if (/Windows NT 10/i.test(ua)) {
    result.os = 'Windows';
    result.osVersion = '10/11';
  } else if (/Windows NT 6.3/i.test(ua)) {
    result.os = 'Windows';
    result.osVersion = '8.1';
  } else if (/Windows NT 6.2/i.test(ua)) {
    result.os = 'Windows';
    result.osVersion = '8';
  } else if (/Windows NT 6.1/i.test(ua)) {
    result.os = 'Windows';
    result.osVersion = '7';
  } else if (/Windows/i.test(ua)) {
    result.os = 'Windows';
  } else if (/Mac OS X/i.test(ua)) {
    result.os = 'macOS';
    result.osVersion = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    result.os = 'iOS';
    result.osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '';
  } else if (/Android/i.test(ua)) {
    result.os = 'Android';
    result.osVersion = ua.match(/Android ([\d.]+)/)?.[1] || '';
  } else if (/Linux/i.test(ua)) {
    result.os = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    result.os = 'Chrome OS';
  }

  // Device type
  if (/Mobile|iPhone|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    result.deviceType = 'Mobile';
  } else if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) {
    result.deviceType = 'Tablet';
  }

  return result;
};

// 1x1 transparent PNG
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const createTrackedEmail = async (userId, { subject, recipient, senderEmail }) => {
  const id = generateTrackingId();
  const createdAt = getESTTimestamp();

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

const recordOpen = async (emailId, { ip, userAgent, referer, language }) => {
  // Verify email exists (no user check - pixels work for anyone)
  const email = await dbGet('SELECT id FROM tracked_emails WHERE id = ?', [emailId]);
  if (!email) {
    return null;
  }

  // Parse user agent
  const uaInfo = parseUserAgent(userAgent);

  // Get geolocation with extended fields
  let location = {
    city: 'Unknown', region: 'Unknown', country: 'Unknown', countryCode: '',
    isp: 'Unknown', org: '', timezone: '', lat: null, lon: null,
    mobile: false, proxy: false, hosting: false
  };

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

  // Detect known email proxy IPs
  const isGoogleProxy = ip && (ip.startsWith('74.125.') || ip.startsWith('66.249.') || ip.startsWith('209.85.'));
  const isYahooProxy = ip && ip.startsWith('98.137.');
  const isMicrosoftProxy = ip && (ip.startsWith('40.') || ip.startsWith('52.') || ip.startsWith('104.47.'));

  // Detect email security scanners (AWS, Proofpoint, Mimecast, etc.)
  const isSecurityScanner = ip && (
    ip.startsWith('44.') ||      // AWS (common for security scanners)
    ip.startsWith('54.') ||      // AWS
    ip.startsWith('52.') ||      // AWS
    ip.startsWith('34.') ||      // Google Cloud / AWS
    ip.startsWith('35.') ||      // Google Cloud
    ip.startsWith('13.') ||      // AWS
    ip.startsWith('18.') ||      // AWS
    ip.startsWith('3.') ||       // AWS
    ip.startsWith('146.75.') ||  // Fastly CDN
    ip.startsWith('151.101.')    // Fastly CDN
  );

  if (isGoogleProxy) {
    location.city = 'Gmail Proxy';
    location.country = 'Google Servers';
    location.isp = 'Google LLC';
    location.proxy = true;
    location.hosting = true;
  } else if (isYahooProxy) {
    location.city = 'Yahoo Mail Proxy';
    location.country = 'Yahoo Servers';
    location.isp = 'Yahoo';
    location.proxy = true;
    location.hosting = true;
  } else if (isMicrosoftProxy) {
    location.city = 'Outlook Proxy';
    location.country = 'Microsoft Servers';
    location.isp = 'Microsoft';
    location.proxy = true;
    location.hosting = true;
  } else if (isSecurityScanner) {
    location.city = 'Security Scanner';
    location.country = 'Cloud Server';
    location.isp = 'Email Security';
    location.proxy = true;
    location.hosting = true;
    // Mark as bot since it's automated
    uaInfo.isBot = true;
  } else if (!isLocalIP) {
    try {
      // Request all available fields from ip-api.com
      const geoUrl = `${config.GEO_API_URL}/${ip}?fields=status,message,country,countryCode,regionName,city,lat,lon,timezone,isp,org,mobile,proxy,hosting`;
      const response = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
      const geo = await response.json();
      if (geo.status === 'success') {
        location = {
          city: geo.city || 'Unknown',
          region: geo.regionName || 'Unknown',
          country: geo.country || 'Unknown',
          countryCode: geo.countryCode || '',
          isp: geo.isp || 'Unknown',
          org: geo.org || '',
          timezone: geo.timezone || '',
          lat: geo.lat || null,
          lon: geo.lon || null,
          mobile: geo.mobile || false,
          proxy: geo.proxy || false,
          hosting: geo.hosting || false
        };
      }
    } catch (err) {
      console.error('Geolocation error:', err.message);
    }
  } else {
    location.city = 'Local Network';
    location.country = 'Local';
  }

  const id = generateTrackingId();
  const timestamp = getESTTimestamp();

  await dbRun(
    `INSERT INTO email_opens (
      id, email_id, timestamp, ip, user_agent, referer,
      city, region, country, country_code, isp, org, timezone, lat, lon,
      is_mobile, is_proxy, is_hosting,
      browser, browser_version, os, os_version, device_type, is_bot, language
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, emailId, timestamp, ip || 'Unknown', userAgent, referer,
      location.city, location.region, location.country, location.countryCode,
      location.isp, location.org, location.timezone, location.lat, location.lon,
      location.mobile, location.proxy, location.hosting,
      uaInfo.browser, uaInfo.browserVersion, uaInfo.os, uaInfo.osVersion,
      uaInfo.deviceType, uaInfo.isBot, language || null
    ]
  );

  return { id, emailId, timestamp, ip, location, uaInfo, referer, language };
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
      countryCode: ipOpens[0].country_code,
      isp: ipOpens[0].isp,
      org: ipOpens[0].org,
      timezone: ipOpens[0].timezone,
      lat: ipOpens[0].lat,
      lon: ipOpens[0].lon,
      isMobile: ipOpens[0].is_mobile,
      isProxy: ipOpens[0].is_proxy,
      isHosting: ipOpens[0].is_hosting
    },
    device: {
      browser: ipOpens[0].browser,
      browserVersion: ipOpens[0].browser_version,
      os: ipOpens[0].os,
      osVersion: ipOpens[0].os_version,
      deviceType: ipOpens[0].device_type,
      isBot: ipOpens[0].is_bot,
      language: ipOpens[0].language
    },
    userAgent: ipOpens[0].user_agent,
    openCount: ipOpens.length,
    firstOpen: ipOpens[0].timestamp,
    lastOpen: ipOpens[ipOpens.length - 1].timestamp
  }));

  // Get attachments with download stats
  const attachments = await getAttachmentsByEmail(emailId);
  const attachmentsWithStats = await Promise.all(
    attachments.map(async (att) => {
      const downloads = await getDownloadsByAttachment(att.id);
      const uniqueIPs = new Set(downloads.map(d => d.ip));
      return {
        ...att,
        downloadUrl: `${config.BASE_URL}/api/track/download/${att.id}`,
        downloadCount: downloads.length,
        uniqueDownloads: uniqueIPs.size,
        downloads: downloads.map(d => ({
          ...d,
          device: {
            browser: d.browser,
            browserVersion: d.browser_version,
            os: d.os,
            osVersion: d.os_version,
            deviceType: d.device_type,
            isBot: d.is_bot,
            language: d.language
          },
          location: {
            city: d.city,
            region: d.region,
            country: d.country,
            countryCode: d.country_code,
            isp: d.isp,
            org: d.org,
            timezone: d.timezone,
            lat: d.lat,
            lon: d.lon,
            isMobile: d.is_mobile,
            isProxy: d.is_proxy,
            isHosting: d.is_hosting
          }
        }))
      };
    })
  );

  return {
    ...email,
    pixelUrl: `${config.BASE_URL}/api/track/${email.id}/pixel.png`,
    htmlSnippet: `<img src="${config.BASE_URL}/api/track/${email.id}/pixel.png" width="1" height="1" style="display:none;" alt="" />`,
    openCount: opens.length,
    uniqueOpens: readers.length,
    forwardDetected: readers.length > 1,
    opens,
    readers,
    attachments: attachmentsWithStats
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

const saveAttachment = async (emailId, { fileId, filename, mimetype, size, r2Key }) => {
  await dbRun(
    `INSERT INTO attachments (id, email_id, filename, mimetype, size, r2_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fileId, emailId, filename, mimetype, size, r2Key]
  );
  return { id: fileId, emailId, filename, mimetype, size, r2Key };
};

const getAttachment = async (attachmentId) => {
  return await dbGet('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
};

const getAttachmentsByEmail = async (emailId) => {
  return await dbAll('SELECT * FROM attachments WHERE email_id = ?', [emailId]);
};

const recordDownload = async (attachmentId, { ip, userAgent, language }) => {
  // Parse user agent
  const uaInfo = parseUserAgent(userAgent);

  // Get geolocation
  let location = {
    city: 'Unknown', region: 'Unknown', country: 'Unknown', countryCode: '',
    isp: 'Unknown', org: '', timezone: '', lat: null, lon: null,
    mobile: false, proxy: false, hosting: false
  };

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

  // Detect known proxies and scanners
  const isGoogleProxy = ip && (ip.startsWith('74.125.') || ip.startsWith('66.249.') || ip.startsWith('209.85.'));
  const isSecurityScanner = ip && (
    ip.startsWith('44.') || ip.startsWith('54.') || ip.startsWith('52.') ||
    ip.startsWith('34.') || ip.startsWith('35.') || ip.startsWith('13.') ||
    ip.startsWith('18.') || ip.startsWith('3.') ||
    ip.startsWith('146.75.') || ip.startsWith('151.101.')
  );

  if (isGoogleProxy) {
    location.city = 'Gmail Proxy';
    location.country = 'Google Servers';
    location.isp = 'Google LLC';
    location.proxy = true;
    location.hosting = true;
  } else if (isSecurityScanner) {
    location.city = 'Security Scanner';
    location.country = 'Cloud Server';
    location.isp = 'Email Security';
    location.proxy = true;
    location.hosting = true;
    uaInfo.isBot = true;
  } else if (!isLocalIP) {
    try {
      const geoUrl = `${config.GEO_API_URL}/${ip}?fields=status,message,country,countryCode,regionName,city,lat,lon,timezone,isp,org,mobile,proxy,hosting`;
      const response = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
      const geo = await response.json();
      if (geo.status === 'success') {
        location = {
          city: geo.city || 'Unknown',
          region: geo.regionName || 'Unknown',
          country: geo.country || 'Unknown',
          countryCode: geo.countryCode || '',
          isp: geo.isp || 'Unknown',
          org: geo.org || '',
          timezone: geo.timezone || '',
          lat: geo.lat || null,
          lon: geo.lon || null,
          mobile: geo.mobile || false,
          proxy: geo.proxy || false,
          hosting: geo.hosting || false
        };
      }
    } catch (err) {
      console.error('Geolocation error for download:', err.message);
    }
  }

  const id = generateTrackingId();
  const timestamp = getESTTimestamp();

  await dbRun(
    `INSERT INTO attachment_downloads (
      id, attachment_id, timestamp, ip, user_agent,
      city, region, country, country_code, isp, org, timezone, lat, lon,
      is_mobile, is_proxy, is_hosting,
      browser, browser_version, os, os_version, device_type, is_bot, language
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, attachmentId, timestamp, ip || 'Unknown', userAgent,
      location.city, location.region, location.country, location.countryCode,
      location.isp, location.org, location.timezone, location.lat, location.lon,
      location.mobile, location.proxy, location.hosting,
      uaInfo.browser, uaInfo.browserVersion, uaInfo.os, uaInfo.osVersion,
      uaInfo.deviceType, uaInfo.isBot, language || null
    ]
  );

  return { id, attachmentId, timestamp, ip, location, uaInfo };
};

const getDownloadsByAttachment = async (attachmentId) => {
  return await dbAll(
    'SELECT * FROM attachment_downloads WHERE attachment_id = ? ORDER BY timestamp DESC',
    [attachmentId]
  );
};

module.exports = {
  TRACKING_PIXEL,
  createTrackedEmail,
  recordOpen,
  getAllEmails,
  getEmailDetails,
  deleteEmail,
  getStats,
  saveAttachment,
  getAttachment,
  getAttachmentsByEmail,
  recordDownload,
  getDownloadsByAttachment,
  parseUserAgent
};
