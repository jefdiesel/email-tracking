const { google } = require('googleapis');
const { config } = require('../config/env');
const { dbRun } = require('../config/database');
const { createTrackedEmail } = require('./trackingService');

// In-memory session store for Gmail tokens
// Tokens are NOT persisted - users must reconnect each session for security
const sessionTokens = new Map();

const createOAuth2Client = () => {
  return new google.auth.OAuth2(
    config.GMAIL_CLIENT_ID,
    config.GMAIL_CLIENT_SECRET,
    config.GMAIL_REDIRECT_URI
  );
};

const getAuthUrl = (state) => {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'online', // No refresh tokens - session only
    scope: [
      'https://www.googleapis.com/auth/gmail.send',  // Send emails only
      'https://www.googleapis.com/auth/userinfo.email'  // Get email address
      // NOTE: No gmail.readonly - we cannot read user's emails
    ],
    state,
    prompt: 'consent'
  });
};

const exchangeCodeForTokens = async (code) => {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

// Store tokens in memory only (session-based)
const saveUserTokens = async (userId, tokens) => {
  sessionTokens.set(userId, {
    tokens,
    connectedAt: new Date().toISOString()
  });
  console.log(`Gmail connected for user ${userId} (session-based, not persisted)`);
};

// Get tokens from memory
const getUserTokens = async (userId) => {
  const session = sessionTokens.get(userId);
  if (!session) {
    return null;
  }
  return session.tokens;
};

// Clear tokens from memory
const disconnectGmail = async (userId) => {
  sessionTokens.delete(userId);
  console.log(`Gmail disconnected for user ${userId}`);
};

// Clear all tokens for a user (called on logout)
const clearUserSession = (userId) => {
  sessionTokens.delete(userId);
};

const getAuthenticatedClient = async (userId) => {
  const tokens = await getUserTokens(userId);
  if (!tokens) {
    throw new Error('Gmail not connected. Please connect your Gmail account first.');
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // For session-based auth, if token expires, user must reconnect
  // No automatic refresh since we're not persisting tokens

  return oauth2Client;
};

const getGmailProfile = async (userId) => {
  const auth = await getAuthenticatedClient(userId);
  const oauth2 = google.oauth2({ version: 'v2', auth });

  const userInfo = await oauth2.userinfo.get();
  return {
    email: userInfo.data.email
  };
};

const sendTrackedEmail = async (userId, { to, subject, body, isHtml = false, attachments = [] }) => {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });
  const oauth2 = google.oauth2({ version: 'v2', auth });

  // Get sender email from userinfo (not gmail.readonly)
  const userInfo = await oauth2.userinfo.get();
  const senderEmail = userInfo.data.email;

  // Create tracked email record
  const trackedEmail = await createTrackedEmail(userId, {
    subject,
    recipient: to,
    senderEmail
  });

  // Append tracking pixel to email body
  let emailBody = body;
  if (isHtml) {
    // Insert tracking pixel before closing body tag or at end
    if (emailBody.includes('</body>')) {
      emailBody = emailBody.replace('</body>', `${trackedEmail.htmlSnippet}</body>`);
    } else {
      emailBody += trackedEmail.htmlSnippet;
    }
  } else {
    // Convert plain text to HTML and add pixel
    emailBody = `
      <html>
        <body>
          <div style="white-space: pre-wrap;">${escapeHtml(body)}</div>
          ${trackedEmail.htmlSnippet}
        </body>
      </html>
    `;
  }

  let message;

  if (attachments.length > 0) {
    // Build multipart/mixed MIME message with attachments
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const headers = [
      `From: ${senderEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`
    ].join('\r\n');

    // HTML body part
    const bodyPart = [
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(emailBody).toString('base64')
    ].join('\r\n');

    // Attachment parts
    const attachmentParts = attachments.map(file => {
      const filename = file.originalname.replace(/"/g, '\\"');
      return [
        `--${boundary}`,
        `Content-Type: ${file.mimetype}`,
        `Content-Disposition: attachment; filename="${filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        file.buffer.toString('base64')
      ].join('\r\n');
    });

    message = [headers, '', bodyPart, ...attachmentParts, `--${boundary}--`].join('\r\n');
  } else {
    // Simple message without attachments (existing format)
    const messageParts = [
      `From: ${senderEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      emailBody
    ];

    message = messageParts.join('\r\n');
  }

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Send email
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });

  // Update tracked email with Gmail message ID
  await dbRun(
    'UPDATE tracked_emails SET gmail_message_id = ? WHERE id = ?',
    [response.data.id, trackedEmail.id]
  );

  return {
    success: true,
    messageId: response.data.id,
    trackedEmail: {
      id: trackedEmail.id,
      subject,
      recipient: to,
      senderEmail,
      pixelUrl: trackedEmail.pixelUrl
    }
  };
};

const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

const isGmailConnected = async (userId) => {
  const tokens = await getUserTokens(userId);
  return tokens !== null;
};

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  saveUserTokens,
  getUserTokens,
  disconnectGmail,
  clearUserSession,
  getGmailProfile,
  sendTrackedEmail,
  isGmailConnected
};
