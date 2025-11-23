const { google } = require('googleapis');
const { config } = require('../config/env');
const { dbRun, dbGet } = require('../config/database');
const { createTrackedEmail } = require('./trackingService');

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
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
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

const saveUserTokens = async (userId, tokens) => {
  await dbRun(
    'UPDATE users SET gmail_tokens = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(tokens), new Date().toISOString(), userId]
  );
};

const getUserTokens = async (userId) => {
  const user = await dbGet('SELECT gmail_tokens FROM users WHERE id = ?', [userId]);
  if (!user || !user.gmail_tokens) {
    return null;
  }
  return JSON.parse(user.gmail_tokens);
};

const disconnectGmail = async (userId) => {
  await dbRun(
    'UPDATE users SET gmail_tokens = NULL, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), userId]
  );
};

const getAuthenticatedClient = async (userId) => {
  const tokens = await getUserTokens(userId);
  if (!tokens) {
    throw new Error('Gmail not connected. Please connect your Gmail account first.');
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Handle token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    const updatedTokens = { ...tokens, ...newTokens };
    await saveUserTokens(userId, updatedTokens);
  });

  return oauth2Client;
};

const getGmailProfile = async (userId) => {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const profile = await gmail.users.getProfile({ userId: 'me' });
  return {
    email: profile.data.emailAddress,
    messagesTotal: profile.data.messagesTotal,
    threadsTotal: profile.data.threadsTotal
  };
};

const sendTrackedEmail = async (userId, { to, subject, body, isHtml = false }) => {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Get sender email from Gmail profile
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const senderEmail = profile.data.emailAddress;

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

  // Create email message
  const messageParts = [
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    emailBody
  ];

  const message = messageParts.join('\r\n');
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
  getGmailProfile,
  sendTrackedEmail,
  isGmailConnected
};
