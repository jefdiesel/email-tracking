// Input validation middleware

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (email) => {
  return emailRegex.test(email);
};

const sanitizeString = (str, maxLength = 500) => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
};

// Validate registration input
const validateRegister = (req, res, next) => {
  const { email, password, name } = req.body;
  const errors = [];

  if (!email || !validateEmail(email)) {
    errors.push('Valid email is required');
  }

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (password && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (password && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  req.body.email = email.toLowerCase().trim();
  req.body.name = sanitizeString(name || '', 100);

  next();
};

// Validate login input
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || !validateEmail(email)) {
    errors.push('Valid email is required');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  req.body.email = email.toLowerCase().trim();

  next();
};

// Validate tracked email creation
const validateCreateEmail = (req, res, next) => {
  const { subject, recipient, senderEmail } = req.body;
  const errors = [];

  if (!subject || subject.trim().length === 0) {
    errors.push('Subject is required');
  }

  if (!recipient || !validateEmail(recipient)) {
    errors.push('Valid recipient email is required');
  }

  if (senderEmail && !validateEmail(senderEmail)) {
    errors.push('Invalid sender email format');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  req.body.subject = sanitizeString(subject, 200);
  req.body.recipient = recipient.toLowerCase().trim();
  req.body.senderEmail = senderEmail ? senderEmail.toLowerCase().trim() : null;

  next();
};

// Validate UUID/tracking ID format
const validateTrackingId = (req, res, next) => {
  const { id } = req.params;

  // 32-char hex string
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid tracking ID format'
    });
  }

  next();
};

// Validate comma-separated email list
const validateEmailList = (emailStr) => {
  if (!emailStr || emailStr.trim().length === 0) return { emails: [], invalid: [] };
  const emails = emailStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0);
  const invalid = emails.filter(e => !validateEmail(e));
  return { emails, invalid };
};

// Validate Gmail send request
const validateGmailSend = (req, res, next) => {
  const { to, cc, bcc, subject, body } = req.body;
  const errors = [];

  // Validate To (required, can be comma-separated)
  const toResult = validateEmailList(to);
  if (toResult.emails.length === 0) {
    errors.push('At least one recipient email is required');
  } else if (toResult.invalid.length > 0) {
    errors.push(`Invalid recipient email(s): ${toResult.invalid.join(', ')}`);
  }

  // Validate CC (optional)
  const ccResult = validateEmailList(cc || '');
  if (ccResult.invalid.length > 0) {
    errors.push(`Invalid CC email(s): ${ccResult.invalid.join(', ')}`);
  }

  // Validate BCC (optional)
  const bccResult = validateEmailList(bcc || '');
  if (bccResult.invalid.length > 0) {
    errors.push(`Invalid BCC email(s): ${bccResult.invalid.join(', ')}`);
  }

  if (!subject || subject.trim().length === 0) {
    errors.push('Subject is required');
  }

  if (!body || body.trim().length === 0) {
    errors.push('Email body is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  req.body.to = toResult.emails.join(', ');
  req.body.cc = ccResult.emails.join(', ');
  req.body.bcc = bccResult.emails.join(', ');
  req.body.subject = sanitizeString(subject, 200);
  req.body.body = sanitizeString(body, 50000);

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateEmail,
  validateTrackingId,
  validateGmailSend,
  validateEmail,
  sanitizeString
};
