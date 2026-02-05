const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { config } = require('../config/env');
const crypto = require('crypto');

// Initialize R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

const generateFileId = () => crypto.randomBytes(16).toString('hex');

/**
 * Upload a file to R2
 * @param {Buffer} buffer - File content
 * @param {string} filename - Original filename
 * @param {string} mimetype - File MIME type
 * @param {string} emailId - Associated tracked email ID
 * @returns {Promise<{fileId: string, key: string, size: number}>}
 */
const uploadFile = async (buffer, filename, mimetype, emailId) => {
  const fileId = generateFileId();
  const ext = filename.split('.').pop() || 'bin';
  const key = `attachments/${emailId}/${fileId}.${ext}`;

  await r2Client.send(new PutObjectCommand({
    Bucket: config.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ContentDisposition: `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    Metadata: {
      'original-filename': filename,
      'email-id': emailId,
    },
  }));

  return {
    fileId,
    key,
    size: buffer.length,
  };
};

/**
 * Get a file from R2
 * @param {string} key - The S3 key
 * @returns {Promise<{body: ReadableStream, contentType: string, contentDisposition: string}>}
 */
const getFile = async (key) => {
  const response = await r2Client.send(new GetObjectCommand({
    Bucket: config.R2_BUCKET_NAME,
    Key: key,
  }));

  return {
    body: response.Body,
    contentType: response.ContentType,
    contentDisposition: response.ContentDisposition,
    contentLength: response.ContentLength,
  };
};

/**
 * Check if R2 is configured
 */
const isConfigured = () => {
  return !!(config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY);
};

module.exports = {
  uploadFile,
  getFile,
  isConfigured,
  generateFileId,
};
