const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  throw new Error('MESSAGE_ENCRYPTION_KEY is not defined in environment variables');
}

if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  throw new Error('MESSAGE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}

const KEY = Buffer.from(ENCRYPTION_KEY, 'hex');

/**
 * Encrypt text using AES-256-CBC
 * @param {string} text - Plain text to encrypt
 * @returns {object} - { iv: string, content: string }
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text to encrypt must be a non-empty string');
  }

  
  const iv = crypto.randomBytes(16);
  
 
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    iv: iv.toString('hex'),
    content: encrypted
  };
}

/**
 * Decrypt encrypted object using AES-256-CBC
 * @param {object} encryptedObject - { iv: string, content: string }
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedObject) {
  if (!encryptedObject || !encryptedObject.iv || !encryptedObject.content) {
    throw new Error('Invalid encrypted object format');
  }

  // Convert IV from hex
  const iv = Buffer.from(encryptedObject.iv, 'hex');
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  
  // Decrypt
  let decrypted = decipher.update(encryptedObject.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};
