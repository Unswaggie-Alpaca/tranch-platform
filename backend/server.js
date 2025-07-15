require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bodyParser = require('body-parser');

// Clerk imports
const { clerkClient } = require('@clerk/clerk-sdk-node');
const { syncClerkUser, deleteClerkUser } = require('./clerk-webhook');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

// ===========================
// DATABASE CONFIGURATION
// ===========================

// Helper function for database transactions with retry logic
const runTransaction = (callback) => {
  return new Promise((resolve, reject) => {
    const attemptTransaction = (retries = 3) => {
      db.serialize(() => {
        db.run('BEGIN EXCLUSIVE TRANSACTION', (err) => {
          if (err) {
            if (retries > 0 && err.code === 'SQLITE_BUSY') {
              setTimeout(() => attemptTransaction(retries - 1), 100);
              return;
            }
            return reject(err);
          }
          
          callback((err, result) => {
            if (err) {
              db.run('ROLLBACK', () => reject(err));
            } else {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) reject(commitErr);
                else resolve(result);
              });
            }
          });
        });
      });
    };
    
    attemptTransaction();
  });
};

// Data sanitization helpers to prevent sensitive data exposure
const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, stripe_customer_id, clerk_user_id, ...safeUser } = user;
  return safeUser;
};

const sanitizeProject = (project) => {
  if (!project) return null;
  const { stripe_payment_intent_id, ...safeProject } = project;
  return safeProject;
};

const sanitizePayment = (payment) => {
  if (!payment) return null;
  const { stripe_payment_intent_id, stripe_checkout_session_id, ...safePayment } = payment;
  return safePayment;
};

// Error handler that doesn't expose sensitive information
const safeErrorHandler = (err, res, message = 'An error occurred') => {
  console.error('Error:', err); // Log full error server-side
  
  // Don't expose database or system errors to client
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({ error: 'This operation violates a constraint' });
  }
  
  if (err.code === 'SQLITE_BUSY') {
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }
  
  // Generic error for production
  return res.status(500).json({ error: message });
};

// Security event logging
const logSecurityEvent = (eventType, severity, req, details = {}) => {
  const event = {
    event_type: eventType,
    severity: severity, // 'info', 'warning', 'critical'
    user_id: req.user ? req.user.id : null,
    ip_address: req.ip || req.connection.remoteAddress,
    user_agent: req.headers['user-agent'] || 'Unknown',
    endpoint: `${req.method} ${req.path}`,
    details: JSON.stringify(details)
  };
  
  db.run(
    `INSERT INTO security_events (event_type, severity, user_id, ip_address, user_agent, endpoint, details) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [event.event_type, event.severity, event.user_id, event.ip_address, event.user_agent, event.endpoint, event.details],
    (err) => {
      if (err) {
        console.error('Failed to log security event:', err);
      }
    }
  );
};

// Common security events to log
const SecurityEvents = {
  LOGIN_ATTEMPT: 'login_attempt',
  LOGIN_FAILED: 'login_failed',
  LOGIN_SUCCESS: 'login_success',
  ADMIN_ACTION: 'admin_action',
  PAYMENT_ATTEMPT: 'payment_attempt',
  PAYMENT_FAILED: 'payment_failed',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INVALID_FILE_UPLOAD: 'invalid_file_upload',
  CSRF_VIOLATION: 'csrf_violation',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  SESSION_EXPIRED: 'session_expired',
  SESSION_CREATED: 'session_created'
};

// Session management
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Clean up expired sessions periodically
setInterval(() => {
  db.run(
    'DELETE FROM user_sessions WHERE expires_at < datetime("now")',
    (err) => {
      if (err) console.error('Session cleanup error:', err);
    }
  );
}, SESSION_CLEANUP_INTERVAL);

// Create a new session
const createSession = (userId, req) => {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT);
  
  db.run(
    `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at) 
     VALUES (?, ?, ?, ?, ?)`,
    [userId, sessionToken, req.ip, req.headers['user-agent'], expiresAt.toISOString()],
    (err) => {
      if (err) console.error('Session creation error:', err);
      else {
        logSecurityEvent(SecurityEvents.SESSION_CREATED, 'info', req, { userId });
      }
    }
  );
  
  return sessionToken;
};

// Validate and update session activity
const validateSession = async (sessionToken) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM user_sessions 
       WHERE session_token = ? AND expires_at > datetime("now")`,
      [sessionToken],
      (err, session) => {
        if (err) return reject(err);
        
        if (!session) {
          return resolve(null);
        }
        
        // Update last activity and extend expiration
        const newExpiry = new Date(Date.now() + SESSION_TIMEOUT);
        db.run(
          `UPDATE user_sessions 
           SET last_activity = CURRENT_TIMESTAMP, expires_at = ? 
           WHERE id = ?`,
          [newExpiry.toISOString(), session.id],
          (err) => {
            if (err) console.error('Session update error:', err);
          }
        );
        
        resolve(session);
      }
    );
  });
};

// Field-level encryption for sensitive data
let ENCRYPTION_KEY;

if (process.env.FIELD_ENCRYPTION_KEY) {
  ENCRYPTION_KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex');
} else if (process.env.NODE_ENV === 'production') {
  // CRITICAL: Refuse to start in production without encryption key
  console.error('FATAL: FIELD_ENCRYPTION_KEY environment variable is required in production!');
  console.error('Generate a key with: openssl rand -hex 32');
  process.exit(1);
} else {
  // Development only - use consistent key
  console.warn('WARNING: Using development encryption key. Never use in production!');
  ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
}

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Encrypt sensitive field
const encryptField = (text) => {
  if (!text) return null;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Return iv:authTag:encrypted format
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

// Decrypt sensitive field
const decryptField = (encryptedText) => {
  if (!encryptedText) return null;
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // Not encrypted
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err);
    return null;
  }
};

// List of fields to encrypt
const ENCRYPTED_FIELDS = [
  'abn', // Australian Business Number
  'bank_account_number',
  'bank_routing_number',
  'tax_file_number',
  'driver_license',
  'passport_number'
];

// Middleware to encrypt sensitive fields in requests
const encryptSensitiveFields = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const encrypted = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (encrypted[field]) {
      encrypted[field] = encryptField(encrypted[field]);
    }
  }
  return encrypted;
};

// Decrypt sensitive fields in responses
const decryptSensitiveFields = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const decrypted = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (decrypted[field]) {
      decrypted[field] = decryptField(decrypted[field]);
    }
  }
  return decrypted;
};

const dbPath = process.env.NODE_ENV === 'production' 
  ? '/var/data/tranch.db'
  : './tranch.db';

const uploadsDir = process.env.NODE_ENV === 'production' 
  ? '/var/data/uploads'
  : './uploads';

// Ensure directories exist
if (process.env.NODE_ENV === 'production') {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize database
const db = new sqlite3.Database(dbPath);

// ===========================
// MIDDLEWARE SETUP
// ===========================
// Configure comprehensive security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "https://js.stripe.com", "https://maps.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://maps.googleapis.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tranch-platform.onrender.com', 'https://tranch.com.au', 'https://www.tranch.com.au']
    : 'http://localhost:3000',
  credentials: true
}));

app.options('*', cors());

// Rate limiting - general API limits
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}`);
    logSecurityEvent(SecurityEvents.RATE_LIMIT_EXCEEDED, 'warning', req, {
      ip: req.ip,
      endpoint: req.originalUrl
    });
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts, please try again later.'
});

// Payment endpoints rate limiting
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 payment attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many payment attempts, please try again later.'
});

// File upload rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many file uploads, please try again later.'
});

app.use('/api/', limiter);

// ===========================
// INPUT VALIDATION AND SANITIZATION
// ===========================

// HTML sanitization helper
const sanitizeHtml = (input) => {
  if (typeof input !== 'string') return input;
  // Remove any HTML tags and scripts
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
};

// Recursive sanitization for objects
const sanitizeInput = (input) => {
  if (input === null || input === undefined) return input;
  
  if (typeof input === 'string') {
    return sanitizeHtml(input);
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      // Skip sensitive fields from sanitization
      if (['password', 'token', 'secret'].includes(key.toLowerCase())) {
        sanitized[key] = value;
      } else {
        sanitized[key] = sanitizeInput(value);
      }
    }
    return sanitized;
  }
  
  return input;
};

// Input validation middleware
const validateInput = (req, res, next) => {
  // Sanitize all input
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  
  next();
};

// Specific validators for common fields
const validators = {
  email: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  amount: (amount) => {
    const num = parseInt(amount);
    return !isNaN(num) && num > 0 && num < 100000000; // Max $1M in cents
  },
  
  id: (id) => {
    const num = parseInt(id);
    return !isNaN(num) && num > 0;
  },
  
  role: (role) => {
    return ['borrower', 'funder', 'admin'].includes(role);
  }
};

// ===========================
// CSRF PROTECTION MIDDLEWARE
// ===========================

// CSRF token generation and validation
const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const csrfProtection = (req, res, next) => {
  // Skip CSRF for webhooks and GET requests
  if (req.path.includes('/webhooks/') || req.method === 'GET') {
    return next();
  }
  
  // Get token from header or body
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.headers['x-csrf-session'];
  
  // For authenticated requests, validate CSRF token
  if (req.user) {
    if (!token || !sessionToken || token !== sessionToken) {
      logSecurityEvent(SecurityEvents.CSRF_VIOLATION, 'critical', req, {
        hasToken: !!token,
        hasSessionToken: !!sessionToken
      });
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }
  
  next();
};

// Middleware to generate CSRF token for authenticated users
const generateCSRFMiddleware = (req, res, next) => {
  if (req.user && !req.csrfToken) {
    req.csrfToken = generateCSRFToken();
    res.setHeader('X-CSRF-Token', req.csrfToken);
  }
  next();
};

// ===========================
// AUTHENTICATION MIDDLEWARE (DEFINE BEFORE USE!)
// ===========================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify Clerk session token
    const { verifyToken } = require('@clerk/clerk-sdk-node');
    
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });
      
      const clerkUserId = payload.sub;
      
      // Get user from database
      db.get('SELECT * FROM users WHERE clerk_user_id = ?', [clerkUserId], async (err, user) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
          // User not in database, sync from Clerk
          try {
            const clerkUser = await clerkClient.users.getUser(clerkUserId);
            
            // Safer email extraction
            let email = null;
            let name = 'User';
            
            if (clerkUser.emailAddresses && Array.isArray(clerkUser.emailAddresses) && clerkUser.emailAddresses.length > 0) {
              const primaryEmail = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId);
              email = primaryEmail ? primaryEmail.emailAddress : clerkUser.emailAddresses[0].emailAddress;
            }
            
            if (!email) {
              console.error('No email found for Clerk user:', clerkUserId);
              return res.status(400).json({ error: 'No email address found for user' });
            }
            
            if (clerkUser.firstName || clerkUser.lastName) {
              name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
            } else {
              name = email.split('@')[0];
            }
            
            // Check if email already exists
            db.get('SELECT id FROM users WHERE email = ?', [email], (emailErr, existingUser) => {
              if (emailErr) {
                console.error('Email check error:', emailErr);
                return res.status(500).json({ error: 'Database error checking email' });
              }
              
              if (existingUser) {
                // Update existing user with clerk_user_id
                db.run(
                  'UPDATE users SET clerk_user_id = ?, name = ? WHERE email = ?',
                  [clerkUserId, name, email],
                  function(updateErr) {
                    if (updateErr) {
                      console.error('User update error:', updateErr);
                      return res.status(500).json({ error: 'Failed to update user' });
                    }
                    
                    // Get updated user
                    db.get('SELECT * FROM users WHERE email = ?', [email], (getErr, updatedUser) => {
                      if (getErr || !updatedUser) {
                        return res.status(500).json({ error: 'Failed to retrieve user' });
                      }
                      req.user = updatedUser;
                      req.db = db;
                      next();
                    });
                  }
                );
              } else {
                // Create new user
                db.run(
                  `INSERT INTO users (clerk_user_id, name, email, role, approved, verification_status) 
                   VALUES (?, ?, ?, 'borrower', 0, 'pending')`,
                  [clerkUserId, name, email],
                  function(createErr) {
                    if (createErr) {
                      console.error('User creation error:', createErr);
                      return res.status(500).json({ error: `Failed to create user: ${createErr.message}` });
                    }
                    
                    // Get newly created user
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (getErr, newUser) => {
                      if (getErr || !newUser) {
                        console.error('Failed to retrieve new user:', getErr);
                        return res.status(500).json({ error: 'Failed to retrieve user' });
                      }
                      req.user = newUser;
                      req.db = db;
                      next();
                    });
                  }
                );
              }
            });
          } catch (syncError) {
            console.error('User sync error:', syncError);
            return res.status(500).json({ error: `Failed to sync user: ${syncError.message}` });
          }
        } else {
          req.user = user;
          req.db = db;
          next();
        }
      });
    } catch (verifyError) {
      console.error('Token verification error:', verifyError);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Role-based access middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'User role not set. Please complete onboarding.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// ===========================
// FILE UPLOAD CONFIGURATION
// ===========================
// Import crypto for secure file naming, CSRF tokens, and encryption
const crypto = require('crypto');

// Magic byte validation for file types
const MAGIC_BYTES = {
  'jpg': { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  'png': { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  'pdf': { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  'doc': { bytes: [0xD0, 0xCF, 0x11, 0xE0], mime: 'application/msword' },
  'docx': { bytes: [0x50, 0x4B, 0x03, 0x04], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  'xls': { bytes: [0xD0, 0xCF, 0x11, 0xE0], mime: 'application/vnd.ms-excel' },
  'xlsx': { bytes: [0x50, 0x4B, 0x03, 0x04], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
};

// Validate file magic bytes
const validateMagicBytes = (buffer) => {
  for (const [ext, info] of Object.entries(MAGIC_BYTES)) {
    const match = info.bytes.every((byte, index) => buffer[index] === byte);
    if (match) return { valid: true, ext, mime: info.mime };
  }
  return { valid: false };
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate secure random filename to prevent path traversal
    const fileId = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    const secureFilename = `${fileId}${ext}`;
    cb(null, secureFilename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },
  fileFilter: async (req, file, cb) => {
    // First check extension
    const allowedExtensions = /^(jpeg|jpg|png|pdf|doc|docx|xls|xlsx|csv|txt)$/i;
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    
    if (!allowedExtensions.test(ext)) {
      return cb(new Error('Invalid file type. Only documents, images, and spreadsheets are allowed'));
    }
    
    // Check MIME type against whitelist
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'text/plain'
    ];
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid MIME type'));
    }
    
    // Store original filename securely in request for later use
    if (!req.uploadedFiles) req.uploadedFiles = [];
    req.uploadedFiles.push({
      originalName: file.originalname,
      fieldname: file.fieldname
    });
    
    cb(null, true);
  }
});

// ===========================
// WEBHOOK ENDPOINT (MUST BE BEFORE BODY PARSING)
// ===========================
app.post('/api/webhooks/clerk', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature
    const svix = require('svix');
    const webhook = new svix.Webhook(webhookSecret);
    
    const headers = {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    };

    let evt;
    try {
      evt = webhook.verify(req.body, headers);
    } catch (err) {
      console.error('Webhook verification failed:', err);
      return res.status(400).json({ error: 'Webhook verification failed' });
    }

    // Handle webhook events
    const { type, data } = evt;
    
    try {
      switch (type) {
        case 'user.created':
        case 'user.updated':
          await syncClerkUser(data);
          break;
          
        case 'user.deleted':
          await deleteClerkUser(data.id);
          break;
          
        default:
          console.log(`Unhandled webhook event: ${type}`);
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

app.post('/api/payments/create-checkout-session', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const { project_id } = req.body;
  
  try {
    // Validate project ownership
    const project = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM projects WHERE id = ? AND borrower_id = ?',
        [project_id, req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get fee amount
    const feeSettings = await new Promise((resolve, reject) => {
      db.get(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'project_listing_fee'",
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    const amount = parseInt(feeSettings?.setting_value || '49900');

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: `Publish Project: ${project.title}`,
            description: 'One-time fee to publish your project to verified funders'
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.APP_URL}/project/${project_id}?payment=success`,
      cancel_url: `${process.env.APP_URL}/project/${project_id}?payment=cancelled`,
      metadata: {
        project_id: String(project_id),
        user_id: String(req.user.id),
        payment_type: 'project_listing'
      }
    });

    res.json({ 
      checkout_url: session.url,
      session_id: session.id 
    });
    
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});


// ----
// Place this *before* any `app.use(express.json())` or other body parsers!
// ----
app.post('/api/webhooks/stripe', express.raw({type: ['application/json', 'application/json; charset=utf-8']}), async (req, res) => {
  console.log('=== Stripe Webhook Received ===');
  console.log('Headers:', req.headers);
  console.log('Webhook Secret Set:', !!process.env.STRIPE_WEBHOOK_SECRET);
  
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe webhook received:', event.type);
  
  // Check for replay attacks - prevent duplicate event processing
  try {
    const existingEvent = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM webhook_events WHERE event_id = ?',
        [event.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (existingEvent) {
      console.log('Webhook event already processed, skipping:', event.id);
      return res.json({ received: true, status: 'already_processed' });
    }
    
    // Store event to prevent replay
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO webhook_events (event_id, event_type, payload) VALUES (?, ?, ?)',
        [event.id, event.type, JSON.stringify(event)],
        (err) => {
          if (err && err.code !== 'SQLITE_CONSTRAINT') {
            // Ignore constraint errors (duplicate event_id)
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  } catch (err) {
    console.error('Error checking webhook replay:', err);
    // Continue processing even if replay check fails
  }

  // Database operation with retry
  const executeDbOperation = async (operation) => {
    let lastError;
    for (let i = 0; i < 3; i++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        if (err.code === 'SQLITE_BUSY' && i < 2) {
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  };

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('Payment intent succeeded:', paymentIntent.id);
        console.log('Metadata:', paymentIntent.metadata);
        
        if (paymentIntent.metadata.payment_type === 'project_listing') {
          const projectId = paymentIntent.metadata.project_id;
          
          // Use the transaction helper with proper locking
          await runTransaction(async (done) => {
            // First check if already processed (idempotency)
            db.get(
              'SELECT payment_status FROM projects WHERE id = ?',
              [projectId],
              (err, project) => {
                if (err) return done(err);
                
                if (project && project.payment_status === 'payment_pending') {
                  // Already processed, skip
                  return done(null, { status: 'already_processed' });
                }
                
                // Update project status with row locking
                db.run(
                  'UPDATE projects SET payment_status = ?, visible = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = ?',
                  ['payment_pending', projectId, 'unpaid'],
                  function(err) {
                    if (err) return done(err);
                    
                    if (this.changes === 0) {
                      // No rows updated, likely race condition
                      return done(null, { status: 'no_update' });
                    }
                    
                    // Update payment record
                    db.run(
                      'UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_payment_intent_id = ? AND status = ?',
                      ['completed', paymentIntent.id, 'pending'],
                      function(err2) {
                        if (err2) return done(err2);
                        done(null, { status: 'success', changes: this.changes });
                      }
                    );
                  }
                );
              }
            );
          });
          
          // Send admin notifications after successful transaction
          if (paymentIntent.metadata.project_id) {
            db.get(
              `SELECT p.*, u.name as borrower_name, u.email as borrower_email 
               FROM projects p 
               JOIN users u ON p.borrower_id = u.id 
               WHERE p.id = ?`,
              [projectId],
              (err, project) => {
                if (!err && project) {
                  db.all(
                    'SELECT email FROM users WHERE role = ?',
                    ['admin'],
                    (err, admins) => {
                      if (!err && admins) {
                        admins.forEach(admin => {
                          sendEmail('admin_review_required', admin.email, {
                            project_title: project.title,
                            project_id: project.id,
                            borrower_name: project.borrower_name,
                            loan_amount: project.loan_amount,
                            suburb: project.suburb
                          });
                        });
                      }
                    }
                  );
                }
              }
            );
          }
        }
        break;

      case 'payment_intent.payment_failed':
        const failedIntent = event.data.object;
        if (failedIntent.metadata.payment_type === 'project_listing') {
          await executeDbOperation(async () => {
            return new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                db.run(
                  'UPDATE payments SET status = ? WHERE stripe_payment_intent_id = ?',
                  ['failed', failedIntent.id],
                  (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    db.run(
                      'UPDATE projects SET payment_status = ? WHERE id = ?',
                      ['unpaid', failedIntent.metadata.project_id],
                      (err2) => {
                        if (err2) {
                          db.run('ROLLBACK');
                          reject(err2);
                          return;
                        }
                        
                        db.run('COMMIT');
                        resolve();
                      }
                    );
                  }
                );
              });
            });
          });
        }
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        if (invoice.subscription) {
          await executeDbOperation(async () => {
            return new Promise((resolve, reject) => {
              db.get(
                'SELECT * FROM users WHERE stripe_customer_id = ?', 
                [invoice.customer], 
                (err, user) => {
                  if (err) {
                    reject(err);
                  } else if (user) {
                    db.serialize(() => {
                      db.run('BEGIN TRANSACTION');
                      
                      db.run(
                        'UPDATE users SET subscription_status = ?, approved = 0 WHERE id = ?', 
                        ['payment_pending', user.id],
                        (updateErr) => {
                          if (updateErr) {
                            db.run('ROLLBACK');
                            reject(updateErr);
                            return;
                          }
                          
                          db.run(
                            'UPDATE payments SET status = ? WHERE user_id = ? AND payment_type = ? AND status = ?',
                            ['completed', user.id, 'subscription', 'pending'],
                            (paymentErr) => {
                              if (paymentErr) {
                                db.run('ROLLBACK');
                                reject(paymentErr);
                                return;
                              }
                              
                              db.run('COMMIT');
                              console.log('User subscription payment received:', user.id);
                              
                              // Send admin notification for subscription review
                              db.all(
                                'SELECT email FROM users WHERE role = ?',
                                ['admin'],
                                (err, admins) => {
                                  if (!err && admins && user) {
                                    admins.forEach(admin => {
                                      sendEmail('admin_subscription_review', admin.email, {
                                        user_name: user.name,
                                        user_email: user.email,
                                        user_id: user.id,
                                        company_name: user.company_name || 'Not specified'
                                      });
                                    });
                                  }
                                }
                              );
                              
                              resolve();
                            }
                          );
                        }
                      );
                    });
                  } else {
                    resolve();
                  }
                }
              );
            });
          });
        }
        break;

      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        await executeDbOperation(async () => {
          return new Promise((resolve, reject) => {
            db.get(
              'SELECT * FROM users WHERE stripe_customer_id = ?', 
              [subscription.customer], 
              (err, user) => {
                if (user) {
                  db.run(
                    'UPDATE users SET subscription_status = ? WHERE id = ?', 
                    ['cancelled', user.id],
                    (err2) => {
                      if (err2) reject(err2);
                      else resolve();
                    }
                  );
                } else {
                  resolve();
                }
              }
            );
          });
        });
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    res.json({received: true});
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// ===========================
// BODY PARSING MIDDLEWARE (AFTER WEBHOOKS)
// ===========================
app.use(express.json({ limit: '50mb' }));

// Apply input validation to all routes
app.use(validateInput);

// Apply CSRF protection to all routes except webhooks
app.use('/api', generateCSRFMiddleware);
app.use('/api', csrfProtection);

// ===========================
// AUTHENTICATED FILE SERVING
// ===========================
app.get('/uploads/:filename', authenticateToken, async (req, res) => {
  const filename = req.params.filename;
  
  // Security check for path traversal - BEFORE any path operations
  if (!filename || 
      filename.includes('..') || 
      filename.includes('/') || 
      filename.includes('\\') ||
      filename.includes('\0') ||
      filename.length > 255) {
    return res.status(400).send('Invalid filename');
  }
  
  // Validate filename format
  const validFilenameRegex = /^[a-zA-Z0-9_\-\.]+$/;
  if (!validFilenameRegex.test(filename)) {
    return res.status(400).send('Invalid filename format');
  }
  
  const filepath = path.join(uploadsDir, filename);
  
  // Ensure the resolved path is still within uploadsDir
  const normalizedPath = path.normalize(filepath);
  const normalizedUploadsDir = path.normalize(uploadsDir);
  
  if (!normalizedPath.startsWith(normalizedUploadsDir)) {
    return res.status(400).send('Invalid file path');
  }

  console.log('Requested file:', filename);
  console.log('Full path:', normalizedPath);
  console.log('File exists:', fs.existsSync(normalizedPath));
  
  // Check if user has access to this file
  db.get(
    `SELECT d.*, p.borrower_id 
     FROM documents d 
     JOIN projects p ON d.project_id = p.id 
     WHERE d.file_path LIKE ?`,
    [`%${filename}`],
    (err, document) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Database error');
      }
      
      if (!document) {
        return res.status(404).send('Not found');
      }
      
      // Check permissions
      if (req.user.role === 'borrower' && document.borrower_id !== req.user.id) {
        return res.status(403).send('Forbidden');
      }
      
      if (req.user.role === 'funder') {
        // Check if funder has approved access
        db.get(
          'SELECT * FROM access_requests WHERE project_id = ? AND funder_id = ? AND status = ?',
          [document.project_id, req.user.id, 'approved'],
          (err, access) => {
            if (!access) {
              return res.status(403).send('Forbidden');
            }
            res.sendFile(normalizedPath);
          }
        );
      } else if (req.user.role === 'admin') {
        // Admins can access all files
        res.sendFile(normalizedPath);
      } else {
        res.sendFile(normalizedPath);
      }
    }
  );
});

// ===========================
// DATABASE INITIALIZATION
// ===========================

db.serialize(() => {
  // Users table with Clerk integration
  // In server.js, update the users table creation
  db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK(role IN ('borrower', 'funder', 'admin')) NOT NULL,
  approved BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  
  -- Funder profile fields
  company_name TEXT,
  company_type TEXT,
  investment_focus TEXT,
  typical_deal_size_min INTEGER,
  typical_deal_size_max INTEGER,
  years_experience INTEGER,
  aum INTEGER,
  phone TEXT,
  linkedin TEXT,
  bio TEXT,
  abn TEXT,
  verification_status TEXT DEFAULT 'pending',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

  // Projects table
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT NOT NULL,
    suburb TEXT NOT NULL,
    city TEXT,
    state TEXT,
    postcode TEXT,
    loan_amount INTEGER NOT NULL,
    interest_rate REAL,
    loan_term INTEGER,
    property_type TEXT,
    development_stage TEXT,
    
    -- Financial details
    total_project_cost INTEGER,
    equity_contribution INTEGER,
    land_value INTEGER,
    construction_cost INTEGER,
    expected_gdc INTEGER,
    expected_profit INTEGER,
    lvr REAL,
    icr REAL,
    
    -- Project details
    project_size_sqm INTEGER,
    number_of_units INTEGER,
    number_of_levels INTEGER,
    car_spaces INTEGER,
    zoning TEXT,
    planning_permit_status TEXT,
    
    -- Risk factors
    market_risk_rating TEXT DEFAULT 'medium',
    construction_risk_rating TEXT DEFAULT 'medium',
    location_risk_rating TEXT DEFAULT 'medium',
    
    -- Timeline
    expected_start_date DATE,
    expected_completion_date DATE,
    
    -- Status fields
    payment_status TEXT DEFAULT 'unpaid',
    stripe_payment_intent_id TEXT,
    visible BOOLEAN DEFAULT FALSE,
    submission_status TEXT DEFAULT 'draft',
    documents_complete BOOLEAN DEFAULT FALSE,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (borrower_id) REFERENCES users (id)
  )`);

  // Documents table
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    status TEXT DEFAULT 'uploaded',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id)
  )`);

  // Access requests table
  db.run(`CREATE TABLE IF NOT EXISTS access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    funder_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    initial_message TEXT,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    declined_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects (id),
    FOREIGN KEY (funder_id) REFERENCES users (id)
  )`);

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    access_request_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    read_at DATETIME,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (access_request_id) REFERENCES access_requests (id),
    FOREIGN KEY (sender_id) REFERENCES users (id)
  )`);

  // Payments table
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    stripe_payment_intent_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'aud',
    payment_type TEXT CHECK(payment_type IN ('project_listing', 'subscription')) NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (project_id) REFERENCES projects (id)
  )`);


  // User subscriptions table
  db.run(`CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_id INTEGER PRIMARY KEY,
    stripe_subscription_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // AI chat tables
  db.run(`CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    session_title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (project_id) REFERENCES projects (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sender TEXT CHECK(sender IN ('user', 'ai')) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES ai_chat_sessions (id)
  )`);
  // Add these tables after your existing tables
// Update the deals table creation (add this after your existing table creation)
  db.run(`CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  access_request_id INTEGER NOT NULL,
  borrower_id INTEGER NOT NULL,
  funder_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id),
  FOREIGN KEY (access_request_id) REFERENCES access_requests (id),
  FOREIGN KEY (borrower_id) REFERENCES users (id),
  FOREIGN KEY (funder_id) REFERENCES users (id),
  UNIQUE(project_id, funder_id) -- This ensures one deal per funder per project
)`);

  db.run(`CREATE TABLE IF NOT EXISTS deal_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  request_id INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES deals (id),
  FOREIGN KEY (uploader_id) REFERENCES users (id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL,
  requester_id INTEGER NOT NULL,
  document_name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at DATETIME,
  FOREIGN KEY (deal_id) REFERENCES deals (id),
  FOREIGN KEY (requester_id) REFERENCES users (id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS deal_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES deals (id),
  FOREIGN KEY (user_id) REFERENCES users (id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS indicative_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL,
  funder_id INTEGER NOT NULL,
  loan_amount INTEGER NOT NULL,
  interest_rate REAL NOT NULL,
  loan_term INTEGER NOT NULL,
  establishment_fee INTEGER,
  other_fees TEXT,
  conditions TEXT,
  valid_until DATE,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES deals (id),
  FOREIGN KEY (funder_id) REFERENCES users (id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id INTEGER,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
)`);

// Webhook events table for replay protection
  db.run(`CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  payload TEXT
)`);

// Security events logging table
  db.run(`CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  user_id INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  endpoint TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Sessions table for tracking active sessions
  db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
)`);

  // System settings table
  db.run(`CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default settings
  db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES 
    ('project_listing_fee', '49900'),
    ('monthly_subscription_fee', '29900'),
    ('max_file_upload_size', '10485760'),
    ('ai_chat_enabled', 'true')`);
// Proposals table
  db.run(`CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL,
    funder_id INTEGER NOT NULL,
    loan_amount REAL NOT NULL,
    interest_rate REAL NOT NULL,
    loan_term INTEGER NOT NULL,
    repayment_frequency TEXT NOT NULL,
    establishment_fee REAL,
    other_fees TEXT,
    conditions TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deal_id) REFERENCES deals (id),
    FOREIGN KEY (funder_id) REFERENCES users (id)
  )`);

// Admin overrides tracking table
  db.run(`CREATE TABLE IF NOT EXISTS admin_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users (id)
  )`);

  // Create indexes for better query performance
  // User indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
  
  // Project indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_projects_borrower_id ON projects(borrower_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_projects_submission_status ON projects(submission_status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_projects_payment_status ON projects(payment_status)');
  
  // Access request indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_access_requests_project_funder ON access_requests(project_id, funder_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)');
  
  // Document indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id)');
  
  // Deal indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_deals_project_id ON deals(project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_deals_borrower_funder ON deals(borrower_id, funder_id)');
  
  // Webhook event index
  db.run('CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id)');
  
  // Proposal indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_proposals_deal_id ON proposals(deal_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)');
  
  // Security event indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at)');
  
  // Session indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at)');
  
  console.log('Database tables and indexes initialized');
    
});

// Add this after your database tables are created
// Migration to remove password constraint
db.get("PRAGMA table_info(users)", (err, rows) => {
  if (!err && rows) {
    // Check if we need to migrate
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, result) => {
      if (!err && result && result.sql.includes('password')) {
        console.log('Migrating users table to remove password column...');
        
        db.serialize(() => {
          // Create a new table without password
          db.run(`CREATE TABLE IF NOT EXISTS users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clerk_user_id TEXT UNIQUE,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            role TEXT CHECK(role IN ('borrower', 'funder', 'admin')) NOT NULL,
            approved BOOLEAN DEFAULT FALSE,
            stripe_customer_id TEXT,
            subscription_status TEXT DEFAULT 'inactive',
            company_name TEXT,
            company_type TEXT,
            investment_focus TEXT,
            typical_deal_size_min INTEGER,
            typical_deal_size_max INTEGER,
            years_experience INTEGER,
            aum INTEGER,
            phone TEXT,
            linkedin TEXT,
            bio TEXT,
            abn TEXT,
            verification_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, (err) => {
            if (err) {
              console.error('Failed to create new users table:', err);
              return;
            }
            
            // Copy data from old table
            db.run(`INSERT INTO users_new SELECT 
              id, clerk_user_id, name, email, role, approved, stripe_customer_id, 
              subscription_status, company_name, company_type, investment_focus,
              typical_deal_size_min, typical_deal_size_max, years_experience,
              aum, phone, linkedin, bio, abn, verification_status,
              created_at, updated_at
              FROM users`, (err) => {
              if (err) {
                console.error('Failed to copy user data:', err);
                return;
              }
              
              // Drop old table and rename new one
              db.run('DROP TABLE users', (err) => {
                if (err) {
                  console.error('Failed to drop old users table:', err);
                  return;
                }
                
                db.run('ALTER TABLE users_new RENAME TO users', (err) => {
                  if (err) {
                    console.error('Failed to rename users table:', err);
                  } else {
                    console.log('Successfully migrated users table');
                  }
                });
              });
            });
          });
        });
      }
    });
  }
});

// Migration to add rejection reason columns
db.run(`ALTER TABLE projects ADD COLUMN last_rejection_reason TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Failed to add last_rejection_reason column:', err);
  }
});

db.run(`ALTER TABLE projects ADD COLUMN rejection_date DATETIME`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Failed to add rejection_date column:', err);
  }
});

// Migration to add city, state, and postcode columns (added to schema but missing in production)
db.run(`ALTER TABLE projects ADD COLUMN city TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Failed to add city column:', err);
  } else if (!err) {
    console.log('Successfully added city column to projects table');
  }
});

db.run(`ALTER TABLE projects ADD COLUMN state TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Failed to add state column:', err);
  } else if (!err) {
    console.log('Successfully added state column to projects table');
  }
});

db.run(`ALTER TABLE projects ADD COLUMN postcode TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Failed to add postcode column:', err);
  } else if (!err) {
    console.log('Successfully added postcode column to projects table');
  }
});

// Import AI Chat routes (with Clerk auth)
const aiChatRoutes = require('./routes/ai-chat');
app.use('/api/ai-chat', authenticateToken, aiChatRoutes);

// Import Geocoding routes
const geocodingRoutes = require('./routes/geocoding');
app.use('/api/geocode', geocodingRoutes);

// ================================
// AUTH ROUTES
// ================================

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  // Use sanitized user data
  const safeUser = sanitizeUser(req.user);
  res.json({ user: safeUser });
});

// Update user role
app.post('/api/auth/set-role', authLimiter, authenticateToken, async (req, res) => {
  const { role } = req.body;
  
  if (!['borrower', 'funder'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  db.run(
    `UPDATE users SET role = ?, approved = ?, verification_status = ? WHERE id = ?`,
    [
      role,
      role === 'borrower' ? 1 : 0,
      role === 'borrower' ? 'verified' : 'pending',
      req.user.id
    ],
    async function(err) {
      if (err) {
        console.error('Role update error:', err);
        return res.status(500).json({ error: 'Failed to update role' });
      }

      // Update Clerk metadata
      try {
        await clerkClient.users.updateUserMetadata(req.user.clerk_user_id, {
          publicMetadata: { role }
        });
      } catch (clerkError) {
        console.error('Failed to update Clerk metadata:', clerkError);
      }

      res.json({ message: 'Role updated successfully', role });
    }
  );
});

// Complete funder profile
app.post('/api/auth/complete-profile', authenticateToken, async (req, res) => {
  const { 
    company_name, company_type, investment_focus,
    typical_deal_size_min, typical_deal_size_max,
    years_experience, aum, phone, linkedin, bio, abn
  } = req.body;

  // Both borrowers and funders can complete profiles now
  if (!req.user.role || (req.user.role !== 'funder' && req.user.role !== 'borrower')) {
    return res.status(400).json({ error: 'Invalid user role' });
  }

  db.run(
    `UPDATE users SET 
      company_name = ?, company_type = ?, investment_focus = ?,
      typical_deal_size_min = ?, typical_deal_size_max = ?,
      years_experience = ?, aum = ?, phone = ?, linkedin = ?, bio = ?, abn = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      company_name, company_type, investment_focus,
      typical_deal_size_min, typical_deal_size_max,
      years_experience, aum, phone, linkedin, bio, abn,
      req.user.id
    ],
    function(err) {
      if (err) {
        console.error('Profile update error:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      res.json({ message: 'Profile completed successfully' });
    }
  );
});

// ================================
// USER PROFILE ROUTES
// ================================

app.get('/api/users/:id/profile', authenticateToken, (req, res) => {
  const userId = req.params.id;

  if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.get(
    `SELECT id, name, email, role, approved, verification_status, created_at,
     company_name, company_type, investment_focus,
     typical_deal_size_min, typical_deal_size_max,
     years_experience, aum, phone, linkedin, bio
     FROM users WHERE id = ?`, 
    [userId], 
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    }
  );
});

app.put('/api/users/:id/profile', authenticateToken, async (req, res) => {
  const userId = req.params.id;

  if (req.user.id !== parseInt(userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { 
    name, company_name, company_type, investment_focus,
    typical_deal_size_min, typical_deal_size_max,
    years_experience, aum, phone, linkedin, bio
  } = req.body;

  db.run(
    `UPDATE users SET 
      name = ?, company_name = ?, company_type = ?, investment_focus = ?,
      typical_deal_size_min = ?, typical_deal_size_max = ?,
      years_experience = ?, aum = ?, phone = ?, linkedin = ?, bio = ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [
      name, company_name, company_type, investment_focus,
      typical_deal_size_min, typical_deal_size_max,
      years_experience, aum, phone, linkedin, bio,
      userId
    ],
    function(err) {
      if (err) {
        console.error('Profile update error:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      res.json({ message: 'Profile updated successfully' });
    }
  );
});

// ================================
// PROJECT ROUTES
// ================================

// Create project
app.post('/api/projects', authenticateToken, requireRole(['borrower']), (req, res) => {
  const {
    title, description, location, suburb, city, state, postcode, loan_amount, interest_rate, loan_term, 
    property_type, development_stage, total_project_cost, equity_contribution,
    land_value, construction_cost, expected_gdc, expected_profit,
    project_size_sqm, number_of_units, number_of_levels, car_spaces,
    zoning, planning_permit_status, expected_start_date, expected_completion_date,
    market_risk_rating, construction_risk_rating, location_risk_rating
  } = req.body;

  if (!title || !location || !suburb || !loan_amount) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  // Validate financial inputs
if (loan_amount < 100000 || loan_amount > 100000000) {
  return res.status(400).json({ error: 'Loan amount must be between $100,000 and $100,000,000' });
}

if (interest_rate && (interest_rate < 0 || interest_rate > 50)) {
  return res.status(400).json({ error: 'Interest rate must be between 0% and 50%' });
}

if (loan_term && (loan_term < 1 || loan_term > 120)) {
  return res.status(400).json({ error: 'Loan term must be between 1 and 120 months' });
}

if (total_project_cost && total_project_cost < 0) {
  return res.status(400).json({ error: 'Total project cost cannot be negative' });
}

if (equity_contribution && equity_contribution < 0) {
  return res.status(400).json({ error: 'Equity contribution cannot be negative' });
}

  const lvr = land_value && loan_amount ? (loan_amount / land_value * 100) : null;
  const icr = expected_profit && loan_amount ? (expected_profit / loan_amount * 100) : null;

  db.run(
    `INSERT INTO projects (
      borrower_id, title, description, location, suburb, city, state, postcode, loan_amount, 
      interest_rate, loan_term, property_type, development_stage,
      total_project_cost, equity_contribution, land_value, construction_cost,
      expected_gdc, expected_profit, lvr, icr,
      project_size_sqm, number_of_units, number_of_levels, car_spaces,
      zoning, planning_permit_status, expected_start_date, expected_completion_date,
      market_risk_rating, construction_risk_rating, location_risk_rating
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id, title, description, location, suburb, city, state, postcode, loan_amount,
      interest_rate, loan_term, property_type, development_stage,
      total_project_cost, equity_contribution, land_value, construction_cost,
      expected_gdc, expected_profit, lvr, icr,
      project_size_sqm, number_of_units, number_of_levels, car_spaces,
      zoning, planning_permit_status, expected_start_date, expected_completion_date,
      market_risk_rating, construction_risk_rating, location_risk_rating
    ],
    function(err) {
      if (err) {
        console.error('Project creation error:', err);
        console.error('Error details:', err.message);
        console.error('SQL error code:', err.code);
        return res.status(500).json({ 
          error: 'Failed to create project',
          details: err.message 
        });
      }

      res.status(201).json({
        message: 'Project created successfully',
        project_id: this.lastID
      });
    }
  );
});

// Get projects
// STEP 1: Find this line in your server.js:
// app.get('/api/projects', authenticateToken, (req, res) => {

// STEP 2: REPLACE THE ENTIRE FUNCTION (from app.get to the closing }); ) with this:

app.get('/api/projects', authenticateToken, (req, res) => {
if (req.user.role === 'borrower') {
  db.all(
    `SELECT p.*, 
            u.name as borrower_name,
            COUNT(DISTINCT d.id) as deal_count
     FROM projects p
     LEFT JOIN users u ON p.borrower_id = u.id
     LEFT JOIN deals d ON p.id = d.project_id AND d.status = 'active'
     WHERE p.borrower_id = ?
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [req.user.id],
    (err, projects) => {
      if (err) {
        console.error('Projects fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch projects' });
      }
      // Sanitize project data before sending
      const safeProjects = projects.map(sanitizeProject);
      res.json(safeProjects);
       }
);
}

   else if (req.user.role === 'funder') {
    // For funders - show published projects with deal status
    db.all(
      `SELECT p.*, 
              u.name as borrower_name,
              ar.status as access_status,
              ar.id as access_request_id,
              d.id as deal_id
       FROM projects p
       LEFT JOIN users u ON p.borrower_id = u.id
       LEFT JOIN access_requests ar ON p.id = ar.project_id AND ar.funder_id = ?
       LEFT JOIN deals d ON p.id = d.project_id AND d.funder_id = ? AND d.status = 'active'
       WHERE p.payment_status = 'paid' AND p.visible = 1
       ORDER BY p.created_at DESC`,
      [req.user.id, req.user.id],
      (err, projects) => {
        if (err) {
          console.error('Projects fetch error:', err);
          return res.status(500).json({ error: 'Failed to fetch projects' });
        }
        // Sanitize project data before sending
      const safeProjects = projects.map(sanitizeProject);
      res.json(safeProjects);
      }
    );
  } else {
    res.status(403).json({ error: 'Unauthorized role' });
  }
});

// Get single project
app.get('/api/projects/:id', authenticateToken, (req, res) => {
  const projectId = req.params.id;
  
  // Build query based on user role
  let query;
  let params;
  
  if (req.user.role === 'borrower') {
    query = `
      SELECT p.*, 
             u.name as borrower_name,
             d.id as deal_id
      FROM projects p
      LEFT JOIN users u ON p.borrower_id = u.id
      LEFT JOIN deals d ON p.id = d.project_id AND d.status = 'active'
      WHERE p.id = ? AND p.borrower_id = ?
    `;
    params = [projectId, req.user.id];
  } else if (req.user.role === 'funder') {
    query = `
      SELECT p.*, 
             u.name as borrower_name,
             ar.status as access_status,
             ar.id as access_request_id,
             d.id as deal_id
      FROM projects p
      LEFT JOIN users u ON p.borrower_id = u.id
      LEFT JOIN access_requests ar ON p.id = ar.project_id AND ar.funder_id = ?
      LEFT JOIN deals d ON p.id = d.project_id AND d.funder_id = ? AND d.status = 'active'
      WHERE p.id = ?
    `;
    params = [req.user.id, req.user.id, projectId];
  } else if (req.user.role === 'admin') {
    query = `
      SELECT p.*, 
             u.name as borrower_name
      FROM projects p
      LEFT JOIN users u ON p.borrower_id = u.id
      WHERE p.id = ?
    `;
    params = [projectId];
  }
  
  db.get(query, params, (err, project) => {
    if (err) {
      console.error('Project fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch project' });
    }
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
  // Check access permissions for funders
    if (req.user.role === 'funder' && project.payment_status !== 'paid' && !project.access_status) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Don't show payment_status details to non-owners
    if (req.user.role === 'funder' && project.payment_status !== 'paid') {
      delete project.payment_status;
      delete project.stripe_payment_intent_id;
    }
    
    res.json(project);
  });
});

// Add endpoint to get all deals for a project (for borrowers)
app.get('/api/projects/:projectId/deals', authenticateToken, (req, res) => {
  const projectId = req.params.projectId;
  
  // Check if user owns the project or is a funder with a deal
  db.all(
    `SELECT d.*, 
            f.name as funder_name, 
            f.email as funder_email,
            iq.status as proposal_status
     FROM deals d
     JOIN users f ON d.funder_id = f.id
     LEFT JOIN indicative_quotes iq ON d.id = iq.deal_id AND iq.status = 'accepted'
     WHERE d.project_id = ? 
     AND (d.borrower_id = ? OR d.funder_id = ?)
     AND d.status = 'active'
     ORDER BY d.created_at DESC`,
    [projectId, req.user.id, req.user.id],
    (err, deals) => {
      if (err) {
        console.error('Deals fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch deals' });
      }
      res.json(deals);
    }
  );
});

// Update project
app.put('/api/projects/:id', authenticateToken, requireRole(['borrower']), (req, res) => {
  const projectId = req.params.id;
  const updateFields = req.body;
  
  // SECURITY: Whitelist allowed fields
  const allowedFields = [
    'title', 'description', 'location', 'suburb', 'loan_amount',
    'interest_rate', 'loan_term', 'property_type', 'development_stage',
    'total_project_cost', 'equity_contribution', 'land_value',
    'construction_cost', 'expected_gdc', 'expected_profit',
    'project_size_sqm', 'number_of_units', 'number_of_levels',
    'car_spaces', 'zoning', 'planning_permit_status',
    'expected_start_date', 'expected_completion_date',
    'market_risk_rating', 'construction_risk_rating', 'location_risk_rating'
  ];
  
  // Filter out non-allowed fields
  const filteredFields = {};
  for (const field of allowedFields) {
    if (updateFields.hasOwnProperty(field)) {
      filteredFields[field] = updateFields[field];
    }
  }
  
  filteredFields.updated_at = new Date().toISOString();

  const fields = Object.keys(filteredFields);
  const values = Object.values(filteredFields);
  
  // Validate all fields are in whitelist to prevent SQL injection
  const safeFields = fields.filter(field => 
    allowedFields.includes(field) || field === 'updated_at'
  );
  
  if (safeFields.length !== fields.length) {
    return res.status(400).json({ error: 'Invalid fields in request' });
  }
  
  const placeholders = safeFields.map(field => `${field} = ?`).join(', ');

  db.run(
    `UPDATE projects SET ${placeholders} WHERE id = ? AND borrower_id = ?`,
    [...values, projectId, req.user.id],
    function(err) {
      if (err) {
        console.error('Project update error:', err);
        return res.status(500).json({ error: 'Failed to update project' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }
      
      res.json({ message: 'Project updated successfully' });
    }
  );
});

// Resubmit project for review (after rejection)
app.post('/api/projects/:id/resubmit', authenticateToken, requireRole(['borrower']), (req, res) => {
  const projectId = req.params.id;
  
  // First check if the project exists and belongs to the user and is rejected
  db.get(
    `SELECT * FROM projects 
     WHERE id = ? AND borrower_id = ? AND submission_status = 'rejected'`,
    [projectId, req.user.id],
    (err, project) => {
      if (err) {
        console.error('Project lookup error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found or not eligible for resubmission' });
      }
      
      // Update the project status for resubmission
      db.run(
        `UPDATE projects SET 
         payment_status = 'payment_pending',
         submission_status = 'pending_review',
         visible = 0,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [projectId],
        (err) => {
          if (err) {
            console.error('Project resubmit error:', err);
            return res.status(500).json({ error: 'Failed to resubmit project' });
          }
          
          res.json({ 
            message: 'Project resubmitted successfully',
            status: 'pending_review'
          });
        }
      );
    }
  );
});

// ================================
// DOCUMENT MANAGEMENT ROUTES
// ================================

const REQUIRED_DOCUMENT_TYPES = [
  'development_application',
  'feasibility_study',
  'site_survey',
  'planning_permit',
  'financial_statements',
  'construction_contract',
  'insurance_documents',
  'environmental_report'
];

// Upload documents
app.post('/api/projects/:id/documents', uploadLimiter, authenticateToken, requireRole(['borrower']), upload.array('documents', 10), (req, res) => {
  const projectId = req.params.id;
  const { document_types } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  // Verify project ownership
  db.get(
    'SELECT * FROM projects WHERE id = ? AND borrower_id = ?', 
    [projectId, req.user.id], 
    (err, project) => {
      if (err || !project) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }

      const documentPromises = req.files.map((file, index) => {
        return new Promise((resolve, reject) => {
          const documentType = document_types ? 
            (Array.isArray(document_types) ? document_types[index] : JSON.parse(document_types)[index]) 
            : 'other';
          
          db.run(
            'INSERT INTO documents (project_id, document_type, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
            [projectId, documentType, file.originalname, file.path, file.size, file.mimetype],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({
                  id: this.lastID,
                  document_type: documentType,
                  file_name: file.originalname,
                  file_path: file.path
                });
              }
            }
          );
        });
      });

      Promise.all(documentPromises)
        .then(documents => {
          checkDocumentCompleteness(projectId);
          
          res.status(201).json({
            message: 'Documents uploaded successfully',
            documents: documents
          });
        })
        .catch(err => {
          console.error('Document upload error:', err);
          res.status(500).json({ error: 'Failed to save documents' });
        });
    }
  );
});

// Get project documents
app.get('/api/projects/:id/documents', authenticateToken, (req, res) => {
  const projectId = req.params.id;

  // Check access permissions
  if (req.user.role === 'borrower') {
    db.get(
      'SELECT id FROM projects WHERE id = ? AND borrower_id = ?', 
      [projectId, req.user.id], 
      (err, project) => {
        if (err || !project) {
          return res.status(403).json({ error: 'Access denied' });
        }
        fetchDocuments();
      }
    );
  } else if (req.user.role === 'funder') {
    db.get(
      'SELECT status FROM access_requests WHERE project_id = ? AND funder_id = ?', 
      [projectId, req.user.id], 
      (err, access) => {
        if (!access || access.status !== 'approved') {
          return res.status(403).json({ error: 'Access not granted' });
        }
        fetchDocuments();
      }
    );
  } else if (req.user.role === 'admin') {
    fetchDocuments();
  }

  function fetchDocuments() {
    db.all(
      'SELECT * FROM documents WHERE project_id = ? ORDER BY uploaded_at DESC', 
      [projectId], 
      (err, documents) => {
        if (err) {
          console.error('Documents fetch error:', err);
          return res.status(500).json({ error: 'Failed to fetch documents' });
        }
        res.json(documents);
      }
    );
  }
});

// Delete document
app.delete('/api/documents/:id', authenticateToken, requireRole(['borrower']), (req, res) => {
  const documentId = req.params.id;

  db.get(
    'SELECT d.*, p.borrower_id FROM documents d JOIN projects p ON d.project_id = p.id WHERE d.id = ?', 
    [documentId], 
    (err, document) => {
      if (err || !document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (document.borrower_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Delete file from filesystem
      fs.unlink(path.join(uploadsDir, path.basename(document.file_path)), (fsErr) => {
  if (fsErr) {
    console.error('File deletion error:', fsErr);
  }
});

      // Delete from database
      db.run('DELETE FROM documents WHERE id = ?', [documentId], (err) => {
        if (err) {
          console.error('Document deletion error:', err);
          return res.status(500).json({ error: 'Failed to delete document' });
        }

        checkDocumentCompleteness(document.project_id);
        
        res.json({ message: 'Document deleted successfully' });
      });
    }
  );
});

// Check document completeness helper
function checkDocumentCompleteness(projectId) {
  db.all(
    'SELECT DISTINCT document_type FROM documents WHERE project_id = ?', 
    [projectId], 
    (err, docs) => {
      if (err) return;
      
      const uploadedTypes = docs.map(doc => doc.document_type);
      const hasAllRequired = REQUIRED_DOCUMENT_TYPES.every(type => uploadedTypes.includes(type));
      
      db.run(
        'UPDATE projects SET documents_complete = ? WHERE id = ?', 
        [hasAllRequired, projectId]
      );
    }
  );
}

// Get required documents
app.get('/api/required-documents', authenticateToken, (req, res) => {
  res.json({
    required_documents: REQUIRED_DOCUMENT_TYPES,
    descriptions: {
      development_application: 'Development Application (DA) submitted to council',
      feasibility_study: 'Comprehensive feasibility study with financial projections',
      site_survey: 'Professional site survey and contour plans',
      planning_permit: 'Planning permit or approval documentation',
      financial_statements: 'Recent financial statements (company and director)',
      construction_contract: 'Construction contract or tender documentation',
      insurance_documents: 'Professional indemnity and public liability insurance',
      environmental_report: 'Environmental impact assessment or contamination report'
    }
  });
});

// ================================
// ACCESS REQUEST & MESSAGING ROUTES
// ================================

// Create access request
app.post('/api/access-requests', authenticateToken, requireRole(['funder']), (req, res) => {
  const { project_id, initial_message } = req.body;

  if (!req.user.approved) {
    return res.status(403).json({ error: 'Account pending approval' });
  }

  db.get(
    'SELECT * FROM access_requests WHERE project_id = ? AND funder_id = ? AND status IN (?, ?)', 
    [project_id, req.user.id, 'pending', 'approved'], 
    (err, existing) => {
      if (existing) {
        return res.status(400).json({ error: 'Access request already exists' });
      }

      // Get project details to notify borrower
      db.get(
        'SELECT borrower_id, title FROM projects WHERE id = ?',
        [project_id],
        async (err, project) => {
          if (err || !project) {
            return res.status(404).json({ error: 'Project not found' });
          }
          
          db.run(
            'INSERT INTO access_requests (project_id, funder_id, initial_message) VALUES (?, ?, ?)',
            [project_id, req.user.id, initial_message],
            async function(err) {
              if (err) {
                console.error('Access request creation error:', err);
                return res.status(500).json({ error: 'Failed to create access request' });
              }
              
              const requestId = this.lastID;
              
              // Create notification for borrower
              try {
                await createNotification(
                  project.borrower_id,
                  'access_request',
                  `${req.user.name} has requested access to "${project.title}"`,
                  requestId
                );
              } catch (notifErr) {
                console.error('Failed to create notification:', notifErr);
              }
              
              res.status(201).json({ 
                message: 'Access request submitted',
                request_id: requestId
              });
            }
          );
        }
      );
    }
  );
});

// Get access requests
app.get('/api/access-requests', authenticateToken, (req, res) => {
  let query, params;

  if (req.user.role === 'borrower') {
    query = `SELECT ar.*, p.title as project_title, p.loan_amount,
             u.name as funder_name, u.email as funder_email,
             u.company_name, u.company_type, u.investment_focus,
             u.years_experience, u.bio, u.verification_status
             FROM access_requests ar 
             JOIN projects p ON ar.project_id = p.id 
             JOIN users u ON ar.funder_id = u.id 
             WHERE p.borrower_id = ?
             ORDER BY ar.requested_at DESC`;
    params = [req.user.id];
  } else if (req.user.role === 'funder') {
    query = `SELECT ar.*, p.title as project_title, p.suburb, p.loan_amount,
             u.name as borrower_name, u.email as borrower_email
             FROM access_requests ar 
             JOIN projects p ON ar.project_id = p.id 
             JOIN users u ON p.borrower_id = u.id 
             WHERE ar.funder_id = ?
             ORDER BY ar.requested_at DESC`;
    params = [req.user.id];
  } else if (req.user.role === 'admin') {
    query = `SELECT ar.*, p.title as project_title,
             u.name as funder_name, u.email as funder_email,
             b.name as borrower_name, b.email as borrower_email
             FROM access_requests ar 
             JOIN projects p ON ar.project_id = p.id 
             JOIN users u ON ar.funder_id = u.id 
             JOIN users b ON p.borrower_id = b.id
             ORDER BY ar.requested_at DESC`;
    params = [];
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.all(query, params, (err, requests) => {
    if (err) {
      console.error('Access requests fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch access requests' });
    }
    res.json(requests);
  });
});

// Approve access request
app.put('/api/access-requests/:id/approve', authenticateToken, requireRole(['borrower']), (req, res) => {
  const requestId = req.params.id;

  db.get(
    `SELECT ar.*, p.borrower_id, p.title as project_title FROM access_requests ar 
     JOIN projects p ON ar.project_id = p.id 
     WHERE ar.id = ?`,
    [requestId],
    (err, request) => {
      if (err || !request) {
        return res.status(404).json({ error: 'Access request not found' });
      }

      if (request.borrower_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      db.run(
        'UPDATE access_requests SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['approved', requestId],
        async (err) => {
          if (err) {
            console.error('Access request approval error:', err);
            return res.status(500).json({ error: 'Failed to approve request' });
          }
          
          // Create notification for funder
          try {
            await createNotification(
              request.funder_id,
              'access_granted',
              `Your access request for "${request.project_title}" has been approved!`,
              request.project_id
            );
          } catch (notifErr) {
            console.error('Failed to create notification:', notifErr);
          }
          
          res.json({ message: 'Access request approved' });
        }
      );
    }
  );
});

// Decline access request
app.put('/api/access-requests/:id/decline', authenticateToken, requireRole(['borrower']), (req, res) => {
  const requestId = req.params.id;

  db.get(
    `SELECT ar.*, p.borrower_id FROM access_requests ar 
     JOIN projects p ON ar.project_id = p.id 
     WHERE ar.id = ?`,
    [requestId],
    (err, request) => {
      if (err || !request) {
        return res.status(404).json({ error: 'Access request not found' });
      }

      if (request.borrower_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      db.run(
        'UPDATE access_requests SET status = ?, declined_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['declined', requestId],
        (err) => {
          if (err) {
            console.error('Access request decline error:', err);
            return res.status(500).json({ error: 'Failed to decline request' });
          }
          res.json({ message: 'Access request declined' });
        }
      );
    }
  );
});

// Get messages
app.get('/api/access-requests/:id/messages', authenticateToken, (req, res) => {
  const requestId = req.params.id;

  db.get(
    `SELECT ar.*, p.borrower_id FROM access_requests ar 
     JOIN projects p ON ar.project_id = p.id 
     WHERE ar.id = ?`,
    [requestId],
    (err, request) => {
      if (err || !request) {
        return res.status(404).json({ error: 'Access request not found' });
      }

      // Check access permissions
      if (req.user.role === 'borrower' && request.borrower_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (req.user.role === 'funder' && request.funder_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      db.all(
        `SELECT m.*, u.name as sender_name 
         FROM messages m 
         JOIN users u ON m.sender_id = u.id 
         WHERE m.access_request_id = ? 
         ORDER BY m.sent_at ASC`,
        [requestId],
        (err, messages) => {
          if (err) {
            console.error('Messages fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch messages' });
          }
          res.json(messages);
        }
      );
    }
  );
});

// Send message
app.post('/api/access-requests/:id/messages', authenticateToken, (req, res) => {
  const requestId = req.params.id;
  const { message, message_type = 'text' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  db.get(
    `SELECT ar.*, p.borrower_id FROM access_requests ar 
     JOIN projects p ON ar.project_id = p.id 
     WHERE ar.id = ?`,
    [requestId],
    (err, request) => {
      if (err || !request) {
        return res.status(404).json({ error: 'Access request not found' });
      }

      // Check access permissions
      if (req.user.role === 'borrower' && request.borrower_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (req.user.role === 'funder' && request.funder_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      db.run(
        'INSERT INTO messages (access_request_id, sender_id, sender_role, message, message_type) VALUES (?, ?, ?, ?, ?)',
        [requestId, req.user.id, req.user.role, message.trim(), message_type],
        function(err) {
          if (err) {
            console.error('Message creation error:', err);
            return res.status(500).json({ error: 'Failed to send message' });
          }
          res.status(201).json({ 
            message: 'Message sent successfully',
            message_id: this.lastID 
          });
        }
      );
    }
  );
});

// Mark message as read
app.put('/api/messages/:id/read', authenticateToken, (req, res) => {
  const messageId = req.params.id;

  db.run(
    'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND sender_id != ?',
    [messageId, req.user.id],
    function(err) {
      if (err) {
        console.error('Message read update error:', err);
        return res.status(500).json({ error: 'Failed to mark message as read' });
      }
      res.json({ message: 'Message marked as read' });
    }
  );
});

// ================================
// PAYMENT ROUTES
// ================================

// Create project payment

// ================================================
// SERVER CHANGES - Replace your existing endpoint
// ================================================

app.post('/api/payments/create-project-payment', paymentLimiter, authenticateToken, requireRole(['borrower']), async (req, res) => {
  const { project_id } = req.body;
  
  try {
    // Validate project ownership
    const project = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM projects WHERE id = ? AND borrower_id = ?',
        [project_id, req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    // Get project listing fee
    const feeSettings = await new Promise((resolve, reject) => {
      db.get(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'project_listing_fee'",
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    const amount = parseInt(feeSettings?.setting_value || '49900');

    // Check for existing payments
    const existingPayment = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM payments
         WHERE project_id = ? 
         AND payment_type = 'project_listing'
         AND status IN ('pending', 'completed')
         ORDER BY created_at DESC LIMIT 1`,
        [project_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingPayment) {
      if (existingPayment.status === 'completed') {
        return res.status(400).json({ error: 'Project already paid for' });
      }
      
      // For ANY pending payment, check if it actually succeeded in Stripe
      if (existingPayment.stripe_payment_intent_id) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            existingPayment.stripe_payment_intent_id
          );
          
          // If payment succeeded but webhook failed, update manually
          if (paymentIntent.status === 'succeeded') {
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE payments SET status = ? WHERE id = ?',
                ['completed', existingPayment.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE projects SET payment_status = ?, visible = 0 WHERE id = ?',
                ['payment_pending', project_id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            return res.json({
              status: 'payment_pending',
              message: 'Payment already completed, pending admin review'
            });
          }
        } catch (stripeError) {
          console.error('Failed to retrieve payment intent:', stripeError);
        }
      }
      
      // ALWAYS delete any pending payment record to start fresh
      console.log('Deleting existing pending payment record:', existingPayment.id);
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM payments WHERE id = ?',
          [existingPayment.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Create new payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud',
      metadata: {
        project_id: String(project_id),
        user_id: String(req.user.id),
        payment_type: 'project_listing',
        user_email: req.user.email
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Insert new payment record
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO payments (user_id, project_id, stripe_payment_intent_id, amount, payment_type, status) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, project_id, paymentIntent.id, amount, 'project_listing', 'pending'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Store the payment intent ID
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE projects SET stripe_payment_intent_id = ? WHERE id = ?',
        [paymentIntent.id, project_id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log('New payment intent created:', {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      status: paymentIntent.status,
      metadata: paymentIntent.metadata
    });

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: amount,
      status: 'new'
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Payment creation failed' });
  }
});

// Create subscription
// ================================================
// SERVER SIDE - Update your create-subscription endpoint
// ================================================

app.post('/api/payments/create-subscription', paymentLimiter, authenticateToken, requireRole(['funder']), async (req, res) => {
  try {
    const { payment_method_id } = req.body;
    
    if (!payment_method_id) {
      return res.status(400).json({ error: 'Payment method ID is required' });
    }
    
    // Get subscription fee from system settings
    const feeSettings = await new Promise((resolve, reject) => {
      db.get(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'monthly_subscription_fee'",
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    const subscriptionAmount = parseInt(feeSettings?.setting_value || '29900');
    
    // Check for existing payments (keep your existing logic)
    const existingPayment = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM payments 
         WHERE user_id = ? 
         AND payment_type = 'subscription'
         AND status IN ('pending', 'completed')
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingPayment) {
      if (existingPayment.status === 'completed' || req.user.subscription_status === 'active') {
        return res.status(400).json({ error: 'Already have an active subscription' });
      }
      // Delete any pending subscription attempts
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM payments WHERE id = ?',
          [existingPayment.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    // Create or get customer (keep your existing logic)
    let customerId = req.user.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: { 
          user_id: String(req.user.id),
          role: req.user.role
        }
      });
      customerId = customer.id;
      
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET stripe_customer_id = ? WHERE id = ?', 
          [customerId, req.user.id], 
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(payment_method_id, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: payment_method_id,
      },
    });

    // OPTION 1: Create subscription that charges immediately
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_FUNDER_MONTHLY_PRICE_ID.trim() }],
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription'
      },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });

    // IMPORTANT: Confirm the payment intent immediately
    if (subscription.latest_invoice.payment_intent) {
      const paymentIntent = await stripe.paymentIntents.confirm(
        subscription.latest_invoice.payment_intent.id,
        {
          payment_method: payment_method_id
        }
      );

      if (paymentIntent.status === 'succeeded') {
        // Payment succeeded immediately
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO payments (user_id, stripe_payment_intent_id, amount, payment_type, status) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, paymentIntent.id, subscriptionAmount, 'subscription', 'completed'],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });

        // Store subscription info
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT OR REPLACE INTO user_subscriptions (user_id, stripe_subscription_id, stripe_customer_id) VALUES (?, ?, ?)',
            [req.user.id, subscription.id, customerId],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        // Update user status
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE users SET subscription_status = ?, approved = 0 WHERE id = ?',
            ['payment_pending', req.user.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        return res.json({
          subscription_id: subscription.id,
          status: 'success',
          message: 'Subscription payment successful'
        });
      } else if (paymentIntent.status === 'requires_action') {
        // 3D Secure required
        return res.json({
          subscription_id: subscription.id,
          client_secret: paymentIntent.client_secret,
          status: 'requires_action'
        });
      }
    }

    // Shouldn't reach here
    throw new Error('Failed to process subscription payment');

  } catch (error) {
    console.error('Subscription creation error:', error);
    
    // Clean up failed subscription if created
    if (error.raw && error.raw.subscription) {
      try {
        await stripe.subscriptions.del(error.raw.subscription);
      } catch (cleanupError) {
        console.error('Failed to clean up subscription:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      error: error.message || 'Subscription creation failed' 
    });
  }
});

// Cancel subscription
app.post('/api/payments/cancel-subscription', authenticateToken, requireRole(['funder']), async (req, res) => {
  try {
    // Get user's subscription ID
    const subscriptionData = await new Promise((resolve, reject) => {
      db.get(
        'SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ?',
        [req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!subscriptionData || !subscriptionData.stripe_subscription_id) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel the subscription in Stripe
    const subscription = await stripe.subscriptions.cancel(
      subscriptionData.stripe_subscription_id
    );

    // Update user's subscription status
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET subscription_status = ? WHERE id = ?',
        ['cancelled', req.user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Update payment record
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE payments 
         SET status = 'cancelled' 
         WHERE user_id = ? AND payment_type = 'subscription' AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      message: 'Subscription cancelled successfully',
      cancellation_date: subscription.canceled_at
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to cancel subscription' 
    });
  }
});

// Update payment method
app.post('/api/payments/update-payment-method', authenticateToken, requireRole(['funder']), async (req, res) => {
  try {
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({ error: 'Payment method ID required' });
    }

    const customerId = req.user.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    // Attach the new payment method to the customer
    await stripe.paymentMethods.attach(payment_method_id, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: payment_method_id,
      },
    });

    // Get user's subscription to update its default payment method
    const subscriptionData = await new Promise((resolve, reject) => {
      db.get(
        'SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ?',
        [req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (subscriptionData && subscriptionData.stripe_subscription_id) {
      await stripe.subscriptions.update(
        subscriptionData.stripe_subscription_id,
        {
          default_payment_method: payment_method_id,
        }
      );
    }

    res.json({
      message: 'Payment method updated successfully'
    });
  } catch (error) {
    console.error('Payment method update error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update payment method' 
    });
  }
});

// ================================
// NOTIFICATION HELPER FUNCTIONS
// ================================

const createNotification = (userId, type, message, relatedId = null) => {
  console.log('Creating notification:', { userId, type, message, relatedId });
  
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (user_id, type, message, related_id) 
       VALUES (?, ?, ?, ?)`,
      [userId, type, message, relatedId],
      function(err) {
        if (err) {
          console.error('Failed to create notification:', err);
          reject(err);
        } else {
          console.log('Notification created successfully with ID:', this.lastID);
          resolve(this.lastID);
        }
      }
    );
  });
};

// ================================
// ADMIN ROUTES
// ================================

// Get all users
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(
    `SELECT id, name, email, role, approved, verification_status, 
     subscription_status, company_name, company_type, created_at 
     FROM users ORDER BY created_at DESC`, 
    (err, users) => {
      if (err) {
        console.error('Admin users fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }
      res.json(users);
    }
  );
});

// Approve user
app.put('/api/admin/users/:id/approve', authenticateToken, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;

  // First get user details to check role
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run(
      'UPDATE users SET approved = TRUE, verification_status = ? WHERE id = ?', 
      ['verified', userId], 
      async (err) => {
        if (err) {
          console.error('User approval error:', err);
          return res.status(500).json({ error: 'Failed to approve user' });
        }
        
        // Create notification for funder accounts
        if (user.role === 'funder') {
          try {
            await createNotification(
              userId,
              'account_approved',
              'Your account has been approved! You can now browse projects and submit offers.',
              null
            );
          } catch (notifErr) {
            console.error('Failed to create notification:', notifErr);
          }
        }
        
        res.json({ message: 'User approved successfully' });
      }
    );
  });
});

// Get admin stats
app.get('/api/admin/stats', authenticateToken, requireRole(['admin']), (req, res) => {
  const stats = {};
  
  const queries = [
    { key: 'total_users', query: 'SELECT COUNT(*) as count FROM users' },
    { key: 'total_projects', query: 'SELECT COUNT(*) as count FROM projects' },
    { key: 'active_projects', query: 'SELECT COUNT(*) as count FROM projects WHERE payment_status = "paid"' },
    { key: 'pending_requests', query: 'SELECT COUNT(*) as count FROM access_requests WHERE status = "pending"' },
    { key: 'total_revenue', query: 'SELECT SUM(amount) as total FROM payments WHERE status = "completed"' }
  ];

  Promise.all(queries.map(({ key, query }) => 
    new Promise((resolve) => {
      db.get(query, (err, result) => {
        stats[key] = err ? 0 : (result.count || result.total || 0);
        resolve();
      });
    })
  )).then(() => {
    res.json(stats);
  });
});

// Get system settings
app.get('/api/admin/system-settings', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(
    'SELECT * FROM system_settings ORDER BY setting_key', 
    (err, settings) => {
      if (err) {
        console.error('System settings fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch settings' });
      }
      res.json(settings);
    }
  );
});

// ===========================
// ADMIN GOD MODE OVERRIDES
// ===========================

// Force approve a funder (bypass all checks)
app.post('/api/admin/force-approve-funder/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;
  const { reason } = req.body;
  
  db.run(
    `UPDATE users SET 
     approved = 1, 
     verification_status = 'verified',
     subscription_status = 'active',
     updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND role = 'funder'`,
    [userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to force approve' });
      }
      
      // Log admin action
      console.log(`ADMIN OVERRIDE: Force approved funder ${userId}. Reason: ${reason}`);
      
      res.json({ 
        message: 'Funder force approved with active subscription',
        changes: this.changes 
      });
    }
  );
});

// Get unpaid and payment pending projects
app.get('/api/admin/unpaid-projects', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(
    `SELECT p.*, u.name as borrower_name, u.email as borrower_email,
            pay.stripe_payment_intent_id, pay.status as payment_status,
            pay.created_at as payment_date, pay.amount as payment_amount
     FROM projects p
     JOIN users u ON p.borrower_id = u.id
     LEFT JOIN payments pay ON p.id = pay.project_id
     WHERE p.payment_status IN ('unpaid', 'pending') OR p.visible = 0
     ORDER BY p.created_at DESC`,
    (err, projects) => {
      if (err) {
        console.error('Failed to fetch unpaid projects:', err);
        return res.status(500).json({ error: 'Failed to fetch projects' });
      }
      // Sanitize project data before sending
      const safeProjects = projects.map(sanitizeProject);
      res.json(safeProjects);
    }
  );
});

// Check Stripe payment status
app.post('/api/admin/check-stripe-payment/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  
  try {
    // Get payment intent from database
    const payment = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM payments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!payment || !payment.stripe_payment_intent_id) {
      return res.json({ 
        hasPayment: false, 
        message: 'No payment found for this project' 
      });
    }
    
    // Check payment status in Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
    
    res.json({
      hasPayment: true,
      paymentStatus: paymentIntent.status,
      amount: paymentIntent.amount,
      created: new Date(paymentIntent.created * 1000),
      paymentMethod: paymentIntent.payment_method,
      stripePaymentId: paymentIntent.id
    });
  } catch (err) {
    console.error('Stripe check error:', err);
    res.status(500).json({ error: 'Failed to check Stripe payment' });
  }
});

// Enhanced force publish with logging
app.post('/api/admin/force-publish-project/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const projectId = req.params.id;
  const { reason, stripePaymentVerified } = req.body;
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Update project status
    db.run(
      `UPDATE projects SET 
       payment_status = 'paid',
       visible = 1,
       stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, 'admin_override_' || datetime('now')),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [projectId],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to update project' });
        }
        
        // Log the override
        db.run(
          `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
           VALUES (?, 'force_publish', ?, 'project', ?)`,
          [req.user.id, projectId, reason + (stripePaymentVerified ? ' [Stripe Payment Verified]' : '')],
          (err) => {
            if (err) console.error('Failed to log override:', err);
          }
        );
        
        // Update payment record if exists
        db.run(
          `UPDATE payments SET status = 'completed' 
           WHERE project_id = ? AND status = 'pending'`,
          [projectId]
        );
        
        db.run('COMMIT');
        
        console.log(`ADMIN OVERRIDE: Force published project ${projectId}. Reason: ${reason}`);
        
        res.json({ 
          message: 'Project force published',
          changes: this.changes 
        });
      }
    );
  });
});

// Get admin override history
app.get('/api/admin/override-history', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(
    `SELECT ao.*, u.name as admin_name 
     FROM admin_overrides ao
     JOIN users u ON ao.admin_id = u.id
     ORDER BY ao.created_at DESC
     LIMIT 100`,
    (err, overrides) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch override history' });
      }
      res.json(overrides);
    }
  );
});

// Sync Stripe payment status for a project
// Enhanced sync stripe payment with better error handling
app.post('/api/admin/sync-stripe-payment/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  
  try {
    // Get the latest payment for this project
    const payment = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM payments 
         WHERE project_id = ? 
         ORDER BY created_at DESC LIMIT 1`,
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!payment) {
      // No payment record, create one as completed
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO payments (user_id, project_id, amount, payment_type, status, stripe_payment_intent_id) 
           VALUES ((SELECT borrower_id FROM projects WHERE id = ?), ?, 49900, 'project_listing', 'completed', ?)`,
          [projectId, projectId, `admin_override_${Date.now()}`],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    // Force update project to paid status
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = 'paid',
         visible = 1,
         stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ?),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [`admin_force_${Date.now()}`, projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Update payment status if exists
    if (payment) {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE payments SET status = 'completed' WHERE id = ?`,
          [payment.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    res.json({ 
      message: 'Project force synced to paid status',
      projectUpdated: true
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Failed to sync payment: ' + err.message });
  }
});

// Manually confirm payment for a project
app.post('/api/admin/confirm-payment/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  const { paymentIntentId } = req.body;
  
  try {
    // First check if payment intent exists in Stripe
    let stripeVerified = false;
    if (paymentIntentId && paymentIntentId.startsWith('pi_')) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        stripeVerified = paymentIntent.status === 'succeeded';
        console.log('Stripe payment intent status:', paymentIntent.status);
      } catch (stripeErr) {
        console.error('Failed to retrieve payment intent from Stripe:', stripeErr);
      }
    }
    
    // Update project to paid and visible
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = 'paid',
         visible = 1,
         stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ?),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [paymentIntentId || `admin_confirmed_${Date.now()}`, projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Update payment record if exists
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE payments SET status = 'completed' 
         WHERE project_id = ? AND payment_type = 'project_listing'`,
        [projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'manual_payment_confirm', ?, 'project', ?)`,
        [req.user.id, projectId, `Manual payment confirmation. Stripe verified: ${stripeVerified}`],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve(); // Don't fail the request if logging fails
        }
      );
    });
    
    res.json({ 
      message: 'Payment confirmed and project published',
      stripeVerified: stripeVerified
    });
  } catch (err) {
    console.error('Manual payment confirmation error:', err);
    res.status(500).json({ error: 'Failed to confirm payment: ' + err.message });
  }
});

// Add a force revert to draft function
app.post('/api/admin/revert-to-draft/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  const { reason } = req.body;
  
  try {
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = 'unpaid',
         visible = 0,
         submission_status = 'draft',
         last_rejection_reason = ?,
         rejection_date = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason || 'No specific reason provided', projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log the action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'revert_to_draft', ?, 'project', ?)`,
        [req.user.id, projectId, reason || 'Admin revert to draft'],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve(); // Don't fail on logging error
        }
      );
    });
    
    res.json({ 
      message: 'Project reverted to draft status',
      success: true
    });
  } catch (err) {
    console.error('Revert error:', err);
    res.status(500).json({ error: 'Failed to revert project: ' + err.message });
  }
});

// Approve project after payment verification
app.post('/api/admin/approve-project/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  
  try {
    // Get project details
    const project = await new Promise((resolve, reject) => {
      db.get(
        `SELECT p.*, u.name as borrower_name, u.email as borrower_email 
         FROM projects p 
         JOIN users u ON p.borrower_id = u.id 
         WHERE p.id = ? AND p.payment_status = 'payment_pending'`,
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found or not in payment_pending state' });
    }
    
    // Update project to published
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = 'paid',
         visible = 1,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'approve_project', ?, 'project', 'Approved after payment verification')`,
        [req.user.id, projectId],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    // Send email notification to borrower
    sendEmail('project_published', project.borrower_email, {
      project_title: project.title,
      project_id: project.id,
      admin_action: true
    });
    
    // Create in-app notification for borrower
    await createNotification(
      project.borrower_id,
      'project_approved',
      `Your project "${project.title}" has been approved and is now live!`,
      projectId
    );
    
    res.json({ 
      message: 'Project approved and published',
      success: true
    });
  } catch (err) {
    console.error('Approve project error:', err);
    res.status(500).json({ error: 'Failed to approve project: ' + err.message });
  }
});

// Deny project with reason (but keep payment)
app.post('/api/admin/deny-project/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  const { reason } = req.body;
  
  if (!reason) {
    return res.status(400).json({ error: 'Denial reason is required' });
  }
  
  try {
    // Get project details
    const project = await new Promise((resolve, reject) => {
      db.get(
        `SELECT p.*, u.name as borrower_name, u.email as borrower_email 
         FROM projects p 
         JOIN users u ON p.borrower_id = u.id 
         WHERE p.id = ? AND p.payment_status = 'payment_pending'`,
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found or not in payment_pending state' });
    }
    
    // Update project - keep payment status as paid but not visible
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = 'paid',
         visible = 0,
         submission_status = 'rejected',
         last_rejection_reason = ?,
         rejection_date = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'deny_project', ?, 'project', ?)`,
        [req.user.id, projectId, reason],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    // Send email notification to borrower
    sendEmail('project_rejected', project.borrower_email, {
      project_title: project.title,
      project_id: project.id,
      reason: reason
    });
    
    res.json({ 
      message: 'Project denied with reason',
      success: true
    });
  } catch (err) {
    console.error('Deny project error:', err);
    res.status(500).json({ error: 'Failed to deny project: ' + err.message });
  }
});

// Confirm payment status
app.post('/api/payments/confirm-project-payment', authenticateToken, requireRole(['borrower']), async (req, res) => {
  try {
    const { payment_intent_id, project_id } = req.body;
    
    if (!payment_intent_id || !project_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify project belongs to user
    const project = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM projects WHERE id = ? AND borrower_id = ?',
        [project_id, req.user.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check payment intent status with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    
    if (paymentIntent.status === 'succeeded') {
      // Payment succeeded but webhook might have failed
      // Manually update the project status
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE projects SET payment_status = ?, visible = 0 WHERE id = ?',
          ['payment_pending', project_id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      res.json({ 
        status: 'succeeded',
        message: 'Payment confirmed, pending admin review'
      });
    } else {
      res.json({ 
        status: paymentIntent.status,
        message: 'Payment not yet confirmed'
      });
    }
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Mark project as payment failed (return to draft)
app.post('/api/admin/payment-failed/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  
  try {
    // Get project details
    const project = await new Promise((resolve, reject) => {
      db.get(
        `SELECT p.*, u.name as borrower_name, u.email as borrower_email 
         FROM projects p 
         JOIN users u ON p.borrower_id = u.id 
         WHERE p.id = ?`,
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Update project to unpaid/draft
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = 'unpaid',
         visible = 0,
         submission_status = 'draft',
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Update payment record if exists
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE payments SET status = 'failed' 
         WHERE project_id = ? AND status = 'completed'`,
        [projectId],
        (err) => {
          if (err) console.error('Failed to update payment:', err);
          resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'payment_failed', ?, 'project', 'Payment verification failed')`,
        [req.user.id, projectId],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    // Send email notification to borrower
    sendEmail('payment_failed_notification', project.borrower_email, {
      project_title: project.title,
      project_id: project.id
    });
    
    res.json({ 
      message: 'Project marked as payment failed and returned to draft',
      success: true
    });
  } catch (err) {
    console.error('Payment failed error:', err);
    res.status(500).json({ error: 'Failed to mark payment as failed: ' + err.message });
  }
});

// Get all projects for admin with enhanced filtering
app.get('/api/admin/projects', authenticateToken, requireRole(['admin']), (req, res) => {
  const { status, payment_status } = req.query;
  
  let query = `
    SELECT p.*, 
      u.name as borrower_name, 
      u.email as borrower_email,
      (SELECT COUNT(*) FROM access_requests WHERE project_id = p.id) as access_request_count,
      (SELECT COUNT(*) FROM deals WHERE project_id = p.id) as deal_count,
      pm.status as payment_record_status,
      pm.stripe_payment_intent_id as payment_intent_id
    FROM projects p
    JOIN users u ON p.borrower_id = u.id
    LEFT JOIN payments pm ON p.id = pm.project_id AND pm.payment_type = 'project_listing'
    WHERE 1=1
  `;
  
  const params = [];
  
  if (status === 'pending_review') {
    query += ` AND p.payment_status = 'payment_pending'`;
  } else if (status === 'published') {
    query += ` AND p.visible = 1 AND p.payment_status = 'paid'`;
  } else if (status === 'draft') {
    query += ` AND p.payment_status = 'unpaid'`;
  } else if (status === 'rejected') {
    query += ` AND p.submission_status = 'rejected'`;
  }
  
  if (payment_status) {
    query += ` AND p.payment_status = ?`;
    params.push(payment_status);
  }
  
  query += ` ORDER BY 
    CASE 
      WHEN p.payment_status = 'payment_pending' THEN 0
      ELSE 1
    END,
    p.updated_at DESC`;
  
  db.all(query, params, (err, projects) => {
    if (err) {
      console.error('Admin projects fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }
    res.json(projects);
  });
});

// Universal project status control for admin
app.post('/api/admin/update-project-status/:projectId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { projectId } = req.params;
  const { payment_status, visible, reason } = req.body;
  
  try {
    // Validate inputs
    const validPaymentStatuses = ['unpaid', 'payment_pending', 'paid'];
    if (!validPaymentStatuses.includes(payment_status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    
    if (typeof visible !== 'boolean') {
      return res.status(400).json({ error: 'Visible must be boolean' });
    }
    
    // Get current project state
    const project = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM projects WHERE id = ?',
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Update project status
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET 
         payment_status = ?,
         visible = ?,
         submission_status = CASE 
           WHEN ? = 'paid' AND ? = 0 THEN 'rejected'
           WHEN ? = 'unpaid' THEN 'draft'
           ELSE submission_status
         END,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payment_status, visible ? 1 : 0, payment_status, visible ? 1 : 0, payment_status, projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'status_change', ?, 'project', ?)`,
        [req.user.id, projectId, reason || `Changed to ${payment_status}/${visible ? 'visible' : 'hidden'}`],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    res.json({ 
      message: 'Project status updated',
      payment_status,
      visible,
      success: true
    });
  } catch (err) {
    console.error('Update project status error:', err);
    res.status(500).json({ error: 'Failed to update project status: ' + err.message });
  }
});

// Approve funder subscription after payment verification
app.post('/api/admin/approve-subscription/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Get user details
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE id = ? AND role = 'funder' AND subscription_status = 'payment_pending'`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found or not in payment_pending state' });
    }
    
    // Update user to active subscription
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         subscription_status = 'active',
         approved = 1,
         verification_status = 'verified',
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'approve_subscription', ?, 'user', 'Approved after payment verification')`,
        [req.user.id, userId],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    // Send email notification to funder
    sendEmail('subscription_approved', user.email, {
      user_name: user.name
    });
    
    res.json({ 
      message: 'Subscription approved and activated',
      success: true
    });
  } catch (err) {
    console.error('Approve subscription error:', err);
    res.status(500).json({ error: 'Failed to approve subscription: ' + err.message });
  }
});

// Deny subscription with reason
app.post('/api/admin/deny-subscription/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  
  if (!reason) {
    return res.status(400).json({ error: 'Denial reason is required' });
  }
  
  try {
    // Get user details
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE id = ? AND role = 'funder'`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user - keep payment record but don't activate
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         subscription_status = 'inactive',
         approved = 0,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'deny_subscription', ?, 'user', ?)`,
        [req.user.id, userId, reason],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    // Send email notification to funder
    sendEmail('subscription_denied', user.email, {
      user_name: user.name,
      reason: reason
    });
    
    res.json({ 
      message: 'Subscription denied with reason',
      success: true
    });
  } catch (err) {
    console.error('Deny subscription error:', err);
    res.status(500).json({ error: 'Failed to deny subscription: ' + err.message });
  }
});

// Mark subscription as payment failed
app.post('/api/admin/subscription-failed/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Get user details
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE id = ? AND role = 'funder'`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user to inactive
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         subscription_status = 'inactive',
         approved = 0,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Update payment record if exists
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE payments SET status = 'failed' 
         WHERE user_id = ? AND payment_type = 'subscription' AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1`,
        [userId],
        (err) => {
          if (err) console.error('Failed to update payment:', err);
          resolve();
        }
      );
    });
    
    // Log admin action
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
         VALUES (?, 'subscription_payment_failed', ?, 'user', 'Payment verification failed')`,
        [req.user.id, userId],
        (err) => {
          if (err) console.error('Failed to log override:', err);
          resolve();
        }
      );
    });
    
    res.json({ 
      message: 'Subscription marked as payment failed',
      success: true
    });
  } catch (err) {
    console.error('Subscription payment failed error:', err);
    res.status(500).json({ error: 'Failed to mark subscription as failed: ' + err.message });
  }
});

// Force complete a deal
app.post('/api/admin/force-complete-deal/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const dealId = req.params.id;
  const { reason } = req.body;
  
  db.run(
    `UPDATE deals SET 
     status = 'completed',
     updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [dealId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to force complete deal' });
      }
      
      console.log(`ADMIN OVERRIDE: Force completed deal ${dealId}. Reason: ${reason}`);
      
      res.json({ 
        message: 'Deal force completed',
        changes: this.changes 
      });
    }
  );
});

// Delete any project (with cascade)
app.delete('/api/admin/delete-project/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const projectId = req.params.id;
  const { reason } = req.body;
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Delete in order of dependencies
    db.run('DELETE FROM messages WHERE access_request_id IN (SELECT id FROM access_requests WHERE project_id = ?)', [projectId]);
    db.run('DELETE FROM access_requests WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM documents WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM payments WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM ai_chat_sessions WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM deals WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM projects WHERE id = ?', [projectId], function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to delete project' });
      }
      
      db.run('COMMIT');
      console.log(`ADMIN OVERRIDE: Deleted project ${projectId}. Reason: ${reason}`);
      res.json({ message: 'Project and all related data deleted' });
    });
  });
});

// View all payments (including failed ones)
app.get('/api/admin/all-payments', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(
    `SELECT p.*, u.name as user_name, u.email as user_email, 
            pr.title as project_title
     FROM payments p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN projects pr ON p.project_id = pr.id
     ORDER BY p.created_at DESC
     LIMIT 100`,
    (err, payments) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch payments' });
      }
      res.json(payments);
    }
  );
});

// Masquerade as another user (view only)
app.get('/api/admin/view-as-user/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;
  
  db.get(
    `SELECT * FROM users WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get user's projects or access requests
      if (user.role === 'borrower') {
        db.all(
          `SELECT * FROM projects WHERE borrower_id = ?`,
          [userId],
          (err, projects) => {
            res.json({ user, projects });
          }
        );
      } else {
        db.all(
          `SELECT ar.*, p.title as project_title 
           FROM access_requests ar
           JOIN projects p ON ar.project_id = p.id
           WHERE ar.funder_id = ?`,
          [userId],
          (err, requests) => {
            res.json({ user, access_requests: requests });
          }
        );
      }
    }
  );
});

// In server.js, add after the notification preferences table creation:

// Get notification preferences
app.get('/api/notifications/preferences', authenticateToken, (req, res) => {
  db.get(
    `SELECT * FROM notification_preferences WHERE user_id = ?`,
    [req.user.id],
    (err, preferences) => {
      if (err) {
        console.error('Preferences fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch preferences' });
      }
      
      // Return default preferences if none exist
      if (!preferences) {
        const defaults = {
          email_messages: true,
          email_project_updates: true,
          email_newsletter: false,
          email_access_requests: true,
          email_deal_engagement: true,
          email_proposals: true,
          email_document_requests: true,
          email_project_published: true,
          email_project_rejected: true,
          email_access_approved: true,
          email_proposal_response: true,
          email_borrower_messages: true,
          email_account_approved: true,
          email_payment_success: true
        };
        return res.json(defaults);
      }
      
      res.json(preferences);
    }
  );
});

// Update notification preferences
app.put('/api/notifications/preferences', authenticateToken, (req, res) => {
  const preferences = req.body;
  
  // Create the table if it doesn't exist
  db.run(`CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER PRIMARY KEY,
    email_messages BOOLEAN DEFAULT 1,
    email_project_updates BOOLEAN DEFAULT 1,
    email_newsletter BOOLEAN DEFAULT 0,
    email_access_requests BOOLEAN DEFAULT 1,
    email_deal_engagement BOOLEAN DEFAULT 1,
    email_proposals BOOLEAN DEFAULT 1,
    email_document_requests BOOLEAN DEFAULT 1,
    email_project_published BOOLEAN DEFAULT 1,
    email_project_rejected BOOLEAN DEFAULT 1,
    email_access_approved BOOLEAN DEFAULT 1,
    email_proposal_response BOOLEAN DEFAULT 1,
    email_borrower_messages BOOLEAN DEFAULT 1,
    email_account_approved BOOLEAN DEFAULT 1,
    email_payment_success BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Table creation error:', err);
      return res.status(500).json({ error: 'Failed to create preferences table' });
    }
    
    // Build dynamic update query
    const fields = Object.keys(preferences).filter(key => key.startsWith('email_'));
    const values = fields.map(field => preferences[field] ? 1 : 0);
    const placeholders = fields.map(field => `${field} = ?`).join(', ');
    
    db.run(
      `INSERT OR REPLACE INTO notification_preferences (user_id, ${fields.join(', ')}) 
       VALUES (?, ${fields.map(() => '?').join(', ')})`,
      [req.user.id, ...values],
      function(err) {
        if (err) {
          console.error('Preferences update error:', err);
          return res.status(500).json({ error: 'Failed to update preferences' });
        }
        res.json({ message: 'Preferences updated successfully' });
      }
    );
  });
});

// Import email service
const { sendEmail } = require('./email-service');

// Send email notification endpoint
app.post('/api/notifications/email', authenticateToken, async (req, res) => {
  const { type, recipient_id, data } = req.body;
  
  try {
    // Get recipient details
    const recipient = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [recipient_id], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Check notification preferences
    const preferences = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM notification_preferences WHERE user_id = ?',
        [recipient_id],
        (err, prefs) => {
          if (err) reject(err);
          else resolve(prefs);
        }
      );
    });
    
    // Map notification types to preference fields
    const preferenceMap = {
      'access_request_received': 'email_access_requests',
      'deal_room_created': 'email_deal_engagement',
      'project_published': 'email_project_published',
      'project_rejected': 'email_project_rejected'
    };
    
    const preferenceField = preferenceMap[type];
    
    // Check if user wants this type of email
    if (preferences && preferenceField && !preferences[preferenceField]) {
      return res.json({ message: 'User has opted out of this notification type' });
    }
    
    // Send email
    await sendEmail(type, recipient.email, {
      ...data,
      recipient_name: recipient.name
    });
    
    res.json({ message: 'Email notification sent' });
  } catch (error) {
    console.error('Email notification error (non-blocking):', error);
    // Return success even if email fails - don't block functionality
    res.json({ message: 'Notification processed (email may have failed)' });
  }
});

// Send system message to any user
app.post('/api/admin/send-system-message', authenticateToken, requireRole(['admin']), (req, res) => {
  const { user_id, message, type = 'system' } = req.body;
  
  db.run(
    `INSERT INTO notifications (user_id, type, message, related_id, created_at)
     VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
    [user_id, type, message],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to send message' });
      }
      
      res.json({ 
        message: 'System message sent',
        notification_id: this.lastID 
      });
    }
  );
});

// Export all platform data
app.get('/api/admin/export-all-data', authenticateToken, requireRole(['admin']), (req, res) => {
  const data = {};
  
  db.serialize(() => {
    db.all('SELECT * FROM users', (err, users) => {
      data.users = users;
      
      db.all('SELECT * FROM projects', (err, projects) => {
        data.projects = projects;
        
        db.all('SELECT * FROM deals', (err, deals) => {
          data.deals = deals;
          
          db.all('SELECT * FROM payments', (err, payments) => {
            data.payments = payments;
            
            db.all('SELECT * FROM access_requests', (err, requests) => {
              data.access_requests = requests;
              
              res.json({
                export_date: new Date().toISOString(),
                platform_stats: {
                  total_users: data.users.length,
                  total_projects: data.projects.length,
                  total_deals: data.deals.length,
                  total_payments: data.payments.length
                },
                data: data
              });
            });
          });
        });
      });
    });
  });
});

// Update system setting
app.put('/api/admin/system-settings/:key', authenticateToken, requireRole(['admin']), (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  db.run(
    'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
    [value, key],
    function(err) {
      if (err) {
        console.error('System setting update error:', err);
        return res.status(500).json({ error: 'Failed to update setting' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      
      res.json({ message: 'Setting updated successfully' });
    }
  );
});



// ================================
// UTILITY ROUTES
// ================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    auth: 'clerk'
  });
});

// ================================
// DEAL ROUTES
// ================================

// Update the deal creation to handle multiple funders properly
app.post('/api/deals', authenticateToken, (req, res) => {
  const { project_id, access_request_id } = req.body;

  if (!project_id || !access_request_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.serialize(() => {
    db.run('BEGIN EXCLUSIVE TRANSACTION');
    
    // Verify the access request is approved
    db.get(
      `SELECT ar.*, p.borrower_id, p.title as project_title
       FROM access_requests ar
       JOIN projects p ON ar.project_id = p.id
       WHERE ar.id = ? 
       AND ar.status = 'approved' 
       AND (ar.funder_id = ? OR p.borrower_id = ?)`,
      [access_request_id, req.user.id, req.user.id],
      (err, accessRequest) => {
        if (err) {
          console.error('Access request lookup error:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Database error' });
        }

        if (!accessRequest) {
          db.run('ROLLBACK');
          return res.status(404).json({ error: 'Access request not found or not approved' });
        }

        // Check if deal already exists for this funder
        db.get(
          'SELECT id FROM deals WHERE project_id = ? AND funder_id = ? AND status = "active"',
          [project_id, accessRequest.funder_id],
          (err, existingDeal) => {
            if (err) {
              console.error('Deal lookup error:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Database error' });
            }

            if (existingDeal) {
              db.run('COMMIT');
              return res.json({ deal_id: existingDeal.id });
            }

            // Create new deal
            db.run(
              `INSERT INTO deals (project_id, access_request_id, borrower_id, funder_id, status) 
               VALUES (?, ?, ?, ?, 'active')`,
              [project_id, access_request_id, accessRequest.borrower_id, accessRequest.funder_id],
              function(err) {
                if (err) {
                  console.error('Deal creation error:', err);
                  db.run('ROLLBACK');
                  
                  // Check if it's a unique constraint violation
                  if (err.code === 'SQLITE_CONSTRAINT') {
                    // Another request created the deal, try to fetch it
                    db.get(
                      'SELECT id FROM deals WHERE project_id = ? AND funder_id = ? AND status = "active"',
                      [project_id, accessRequest.funder_id],
                      (fetchErr, newDeal) => {
                        if (newDeal) {
                          return res.json({ deal_id: newDeal.id });
                        }
                        return res.status(500).json({ error: 'Failed to create deal' });
                      }
                    );
                  } else {
                    return res.status(500).json({ error: 'Failed to create deal' });
                  }
                } else {
                  const dealId = this.lastID;
                  
                  // Get funder's name for notification
                  db.get('SELECT name FROM users WHERE id = ?', [req.user.id], (userErr, funderUser) => {
                    const funderName = funderUser?.name || 'A funder';
                    
                    // Send notification to borrower
                    createNotification(
                      accessRequest.borrower_id, 
                      'deal_engagement', 
                      `${funderName} has engaged with your project: ${accessRequest.project_title}`, 
                      dealId
                    ).catch(err => console.error('Failed to create notification:', err));
                    
                    db.run('COMMIT');
                    res.status(201).json({ 
                      message: 'Deal created successfully',
                      deal_id: dealId 
                    });
                  });
                }
              }
            );
          }
        );
      }
    );
  });
});


// Get user contact info
app.get('/api/users/:id/contact', authenticateToken, async (req, res) => {
  const userId = req.params.id;
  
  // Check if users have shared contact info through a deal
  db.get(
    `SELECT COUNT(*) as hasShared FROM deals 
     WHERE ((borrower_id = ? AND funder_id = ?) OR (borrower_id = ? AND funder_id = ?))
     AND status IN ('active', 'accepted', 'completed')`,
    [req.user.id, userId, userId, req.user.id],
    (err, result) => {
      if (err || !result.hasShared) {
        return res.status(403).json({ error: 'Contact info not shared' });
      }
      
      db.get(
        'SELECT name, email, phone, company_name, linkedin FROM users WHERE id = ?',
        [userId],
        (err, contact) => {
          if (err || !contact) {
            return res.status(404).json({ error: 'User not found' });
          }
          res.json(contact);
        }
      );
    }
  );
});

// Share contact info
app.post('/api/users/share-contact', authenticateToken, (req, res) => {
  const { user_id, target_user_id } = req.body;
  
  // Verify request is from the correct user
  if (user_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  // Log contact share (you might want to create a contact_shares table)
  console.log(`User ${user_id} shared contact with ${target_user_id}`);
  
  res.json({ message: 'Contact info shared successfully' });
});

// Reject project and move back to draft
app.post('/api/admin/reject-project/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const projectId = req.params.id;
  const { reason } = req.body;
  
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason is required' });
  }
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Update project status back to draft
    db.run(
      `UPDATE projects SET 
       payment_status = 'unpaid',
       visible = 0,
       submission_status = 'draft',
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [projectId],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to update project' });
        }
        
        // Log the admin action
        db.run(
          `INSERT INTO admin_overrides (admin_id, action_type, target_id, target_type, reason)
           VALUES (?, 'reject_project', ?, 'project', ?)`,
          [req.user.id, projectId, reason],
          (err) => {
            if (err) console.error('Failed to log override:', err);
          }
        );
        
        db.run('COMMIT');
        
        console.log(`ADMIN ACTION: Rejected project ${projectId}. Reason: ${reason}`);
        
        res.json({ 
          message: 'Project rejected and moved to draft',
          changes: this.changes 
        });
      }
    );
  });
});

// ===========================
// ADMIN MESSAGING ROUTES
// ===========================

// Send message from admin to any user
app.post('/api/admin/messages/send', authenticateToken, requireRole(['admin']), (req, res) => {
  const { user_id, message } = req.body;
  
  if (!user_id || !message || !message.trim()) {
    return res.status(400).json({ error: 'User ID and message are required' });
  }
  
  // Insert the message
  db.run(
    'INSERT INTO admin_messages (admin_id, user_id, message, sender_role) VALUES (?, ?, ?, ?)',
    [req.user.id, user_id, message.trim(), 'admin'],
    function(err) {
      if (err) {
        console.error('Admin message creation error:', err);
        return res.status(500).json({ error: 'Failed to send message' });
      }
      
      // Create notification for the user
      db.run(
        `INSERT INTO notifications (user_id, type, message, related_id)
         VALUES (?, 'admin_message', 'You have a new message from admin', ?)`,
        [user_id, this.lastID],
        (notifErr) => {
          if (notifErr) console.error('Failed to create notification:', notifErr);
        }
      );
      
      res.status(201).json({ 
        message: 'Message sent successfully',
        message_id: this.lastID 
      });
    }
  );
});

// Get all admin conversations
app.get('/api/admin/messages', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(
    `SELECT DISTINCT 
      u.id as user_id,
      u.name as user_name,
      u.email as user_email,
      u.role as user_role,
      (SELECT COUNT(*) FROM admin_messages am 
       WHERE (am.admin_id = ? AND am.user_id = u.id) 
       OR (am.user_id = ? AND am.admin_id = u.id AND am.sender_role = 'user')
       AND am.read_at IS NULL AND am.sender_role = 'user') as unread_count,
      (SELECT message FROM admin_messages am2 
       WHERE (am2.admin_id = ? AND am2.user_id = u.id) 
       OR (am2.user_id = ? AND am2.admin_id = u.id)
       ORDER BY am2.sent_at DESC LIMIT 1) as last_message,
      (SELECT sent_at FROM admin_messages am3 
       WHERE (am3.admin_id = ? AND am3.user_id = u.id) 
       OR (am3.user_id = ? AND am3.admin_id = u.id)
       ORDER BY am3.sent_at DESC LIMIT 1) as last_message_time
     FROM users u
     WHERE EXISTS (
       SELECT 1 FROM admin_messages am 
       WHERE (am.admin_id = ? AND am.user_id = u.id) 
       OR (am.user_id = ? AND am.admin_id = u.id)
     )
     ORDER BY last_message_time DESC`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id],
    (err, conversations) => {
      if (err) {
        console.error('Admin conversations fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch conversations' });
      }
      res.json(conversations || []);
    }
  );
});

// Get messages with a specific user
app.get('/api/admin/messages/:userId', authenticateToken, (req, res) => {
  const userId = parseInt(req.params.userId);
  
  // Check if user is admin or the user themselves
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Simplified query for admin viewing messages with a specific user
  if (req.user.role === 'admin') {
    db.all(
      `SELECT am.*, 
        CASE 
          WHEN am.sender_role = 'admin' THEN admin_user.name 
          ELSE regular_user.name 
        END as sender_name
       FROM admin_messages am
       LEFT JOIN users admin_user ON admin_user.id = am.admin_id
       LEFT JOIN users regular_user ON regular_user.id = am.user_id
       WHERE am.user_id = ?
       ORDER BY am.sent_at ASC`,
      [userId],
      (err, messages) => {
        if (err) {
          console.error('Admin messages fetch error:', err);
          return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        
        // Mark user messages as read (messages from user that admin hasn't read)
        if (messages.length > 0) {
          db.run(
            `UPDATE admin_messages 
             SET read_at = CURRENT_TIMESTAMP 
             WHERE user_id = ? AND sender_role = 'user' AND read_at IS NULL`,
            [userId],
            (err) => {
              if (err) console.error('Failed to mark messages as read:', err);
            }
          );
        }
        
        res.json(messages || []);
      }
    );
  } else {
    // For regular users viewing their admin messages
    db.all(
      `SELECT am.*, 
        u.name as sender_name
       FROM admin_messages am
       JOIN users u ON (am.sender_role = 'admin' AND u.id = am.admin_id) 
                    OR (am.sender_role = 'user' AND u.id = am.user_id)
       WHERE am.user_id = ?
       ORDER BY am.sent_at ASC`,
      [req.user.id],
      (err, messages) => {
        if (err) {
          console.error('Admin messages fetch error:', err);
          return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        
        // Mark admin messages as read
        if (messages.length > 0) {
          db.run(
            `UPDATE admin_messages 
             SET read_at = CURRENT_TIMESTAMP 
             WHERE user_id = ? AND sender_role = 'admin' AND read_at IS NULL`,
            [req.user.id],
            (err) => {
              if (err) console.error('Failed to mark messages as read:', err);
            }
          );
        }
        
        res.json(messages || []);
      }
    );
  }
});

// Send message from user to admin (reply)
app.post('/api/messages/admin/reply', authenticateToken, (req, res) => {
  const { message } = req.body;
  
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  // Get any admin ID (for simplicity, we'll use the first admin)
  db.get(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    (err, admin) => {
      if (err || !admin) {
        return res.status(500).json({ error: 'No admin found' });
      }
      
      db.run(
        'INSERT INTO admin_messages (admin_id, user_id, message, sender_role) VALUES (?, ?, ?, ?)',
        [admin.id, req.user.id, message.trim(), 'user'],
        function(err) {
          if (err) {
            console.error('User message creation error:', err);
            return res.status(500).json({ error: 'Failed to send message' });
          }
          
          // Create notification for admin
          db.run(
            `INSERT INTO notifications (user_id, type, message, related_id)
             VALUES (?, 'admin_message', ?, ?)`,
            [admin.id, `New message from ${req.user.name}`, req.user.id],
            (notifErr) => {
              if (notifErr) console.error('Failed to create notification:', notifErr);
            }
          );
          
          res.status(201).json({ 
            message: 'Message sent successfully',
            message_id: this.lastID 
          });
        }
      );
    }
  );
});

// Get user's admin messages (for regular users)
app.get('/api/messages/admin', authenticateToken, (req, res) => {
  db.all(
    `SELECT am.*, 
      u.name as admin_name
     FROM admin_messages am
     JOIN users u ON u.id = am.admin_id
     WHERE am.user_id = ?
     ORDER BY am.sent_at ASC`,
    [req.user.id],
    (err, messages) => {
      if (err) {
        console.error('User admin messages fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }
      
      // Mark admin messages as read
      if (messages.length > 0) {
        db.run(
          `UPDATE admin_messages 
           SET read_at = CURRENT_TIMESTAMP 
           WHERE user_id = ? AND sender_role = 'admin' AND read_at IS NULL`,
          [req.user.id],
          (err) => {
            if (err) console.error('Failed to mark messages as read:', err);
          }
        );
      }
      
      res.json(messages || []);
    }
  );
});


app.post('/api/geocode/autocomplete', authenticateToken, async (req, res) => {
  const { input } = req.body;
  
  if (!input || input.length < 3) {
    return res.json({ predictions: [] });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=au&q=${encodeURIComponent(input)}&limit=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Tranch Platform/1.0' // Required by Nominatim
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Nominatim API error');
    }
    
    const data = await response.json();
    
    // Transform Nominatim response to match Google Places format
    const predictions = data.map(item => ({
      description: item.display_name,
      place_id: item.place_id,
      structured_formatting: {
        main_text: item.display_name.split(',')[0],
        secondary_text: item.display_name.split(',').slice(1).join(',')
      }
    }));
    
    res.json({ predictions });
  } catch (err) {
    console.error('Geocoding error:', err);
    res.status(500).json({ error: 'Geocoding failed' });
  }
});
// Add endpoint to get project documents for deal room
// In server.js, replace the existing endpoint with this fixed version:

// Get project documents for deal room
app.get('/api/projects/:projectId/documents/deal', authenticateToken, (req, res) => {
  const projectId = req.params.projectId;
  
  // Verify user has access via a deal
  db.get(
    `SELECT d.* FROM deals d 
     WHERE d.project_id = ? 
     AND (d.borrower_id = ? OR d.funder_id = ?)
     AND d.status = 'active'
     LIMIT 1`,
    [projectId, req.user.id, req.user.id],
    (err, deal) => {
      if (err) {
        console.error('Deal access check error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!deal) {
        return res.status(403).json({ error: 'Access denied - no active deal found' });
      }

      // Get project documents with uploader name from project owner
      db.all(
        `SELECT d.*, p.borrower_id, u.name as uploader_name
         FROM documents d
         JOIN projects p ON d.project_id = p.id
         JOIN users u ON p.borrower_id = u.id
         WHERE d.project_id = ?
         ORDER BY d.uploaded_at DESC`,
        [projectId],
        (err, documents) => {
          if (err) {
            console.error('Documents fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch documents' });
          }
          res.json(documents || []);
        }
      );
    }
  );
});

// Get deal by ID
app.get('/api/deals/:id', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  db.get(
    `SELECT d.*, 
     p.title as project_title, p.loan_amount, p.suburb,
     b.name as borrower_name, b.email as borrower_email,
     f.name as funder_name, f.email as funder_email
     FROM deals d
     JOIN projects p ON d.project_id = p.id
     JOIN users b ON d.borrower_id = b.id
     JOIN users f ON d.funder_id = f.id
     WHERE d.id = ? AND (d.borrower_id = ? OR d.funder_id = ? OR ? = 'admin')`,
    [dealId, req.user.id, req.user.id, req.user.role],
    (err, deal) => {
      if (err) {
        console.error('Deal fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch deal' });
      }

      if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      res.json(deal);
    }
  );
});

// Get deal documents
app.get('/api/deals/:id/documents', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  // First verify user has access to this deal
  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      // Get documents
      db.all(
        `SELECT dd.*, u.name as uploader_name 
         FROM deal_documents dd 
         JOIN users u ON dd.uploader_id = u.id 
         WHERE dd.deal_id = ? 
         ORDER BY dd.uploaded_at DESC`,
        [dealId],
        (err, documents) => {
          if (err) {
            console.error('Documents fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch documents' });
          }
          res.json(documents);
        }
      );
    }
  );
});

// Upload deal documents
app.post('/api/deals/:id/documents', authenticateToken, upload.array('documents', 10), (req, res) => {
  const dealId = req.params.id;
  const requestId = req.body.request_id;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  // Verify user has access to this deal
  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      const documentPromises = req.files.map((file) => {
        return new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO deal_documents (deal_id, uploader_id, file_name, file_path, file_size, mime_type, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [dealId, req.user.id, file.originalname, file.path, file.size, file.mimetype, requestId || null],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({
                  id: this.lastID,
                  file_name: file.originalname,
                  file_path: file.path
                });
              }
            }
          );
        });
      });

      Promise.all(documentPromises)
        .then(documents => {
          res.status(201).json({
            message: 'Documents uploaded successfully',
            documents: documents
          });
        })
        .catch(err => {
          console.error('Document upload error:', err);
          res.status(500).json({ error: 'Failed to save documents' });
        });
    }
  );
});

// Get document requests for a deal
app.get('/api/deals/:id/document-requests', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  // Verify user has access to this deal
  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      // Get document requests
      db.all(
        `SELECT dr.*, u.name as requester_name 
         FROM document_requests dr 
         JOIN users u ON dr.requester_id = u.id 
         WHERE dr.deal_id = ? 
         ORDER BY dr.created_at DESC`,
        [dealId],
        (err, requests) => {
          if (err) {
            console.error('Document requests fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch document requests' });
          }
          res.json(requests);
        }
      );
    }
  );
});

// Create document request
app.post('/api/deals/:id/document-requests', authenticateToken, (req, res) => {
  const dealId = req.params.id;
  const { document_name, description } = req.body;

  if (!document_name) {
    return res.status(400).json({ error: 'Document name is required' });
  }

  // Verify user has access to this deal
  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.run(
        'INSERT INTO document_requests (deal_id, requester_id, document_name, description) VALUES (?, ?, ?, ?)',
        [dealId, req.user.id, document_name, description],
        function(err) {
          if (err) {
            console.error('Document request creation error:', err);
            return res.status(500).json({ error: 'Failed to create document request' });
          }

          res.status(201).json({
            message: 'Document request created successfully',
            request_id: this.lastID
          });
        }
      );
    }
  );
});

// Get deal comments
app.get('/api/deals/:id/comments', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  // Verify user has access to this deal
  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      // Get comments
      db.all(
        `SELECT dc.*, u.name as user_name 
         FROM deal_comments dc 
         JOIN users u ON dc.user_id = u.id 
         WHERE dc.deal_id = ? 
         ORDER BY dc.created_at ASC`,
        [dealId],
        (err, comments) => {
          if (err) {
            console.error('Comments fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch comments' });
          }
          res.json(comments);
        }
      );
    }
  );
});

// Add deal comment
app.post('/api/deals/:id/comments', authenticateToken, (req, res) => {
  const dealId = req.params.id;
  const { comment } = req.body;

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  // Verify user has access to this deal
  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.run(
        'INSERT INTO deal_comments (deal_id, user_id, comment) VALUES (?, ?, ?)',
        [dealId, req.user.id, comment.trim()],
        function(err) {
          if (err) {
            console.error('Comment creation error:', err);
            return res.status(500).json({ error: 'Failed to create comment' });
          }

          res.status(201).json({
            message: 'Comment added successfully',
            comment_id: this.lastID
          });
        }
      );
    }
  );
});

// Create indicative quote
app.post('/api/deals/:id/quotes', authenticateToken, requireRole(['funder']), (req, res) => {
  const dealId = req.params.id;
  const { 
    loan_amount, 
    interest_rate, 
    loan_term, 
    establishment_fee, 
    other_fees,
    conditions,
    valid_until 
  } = req.body;

  if (!loan_amount || !interest_rate || !loan_term) {
    return res.status(400).json({ error: 'Loan amount, interest rate, and term are required' });
  }

  // Verify user has access to this deal and is the funder
  db.get(
    'SELECT * FROM deals WHERE id = ? AND funder_id = ?',
    [dealId, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.run(
        `INSERT INTO indicative_quotes 
         (deal_id, funder_id, loan_amount, interest_rate, loan_term, establishment_fee, other_fees, conditions, valid_until) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [dealId, req.user.id, loan_amount, interest_rate, loan_term, establishment_fee, other_fees, conditions, valid_until],
        function(err) {
          if (err) {
            console.error('Quote creation error:', err);
            return res.status(500).json({ error: 'Failed to create quote' });
          }

          // Create notification for borrower
          const quoteId = this.lastID;
          createNotification(
            deal.borrower_id,
            'proposal_received',
            `You have received a funding offer from ${req.user.name}`,
            dealId
          ).catch(err => console.error('Failed to create notification:', err));

          res.status(201).json({
            message: 'Quote submitted successfully',
            quote_id: quoteId
          });
        }
      );
    }
  );
});
// Add these endpoints to your server.js file

// Get deal details
app.get('/api/deals/:id', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  db.get(
    `SELECT d.*, 
            p.title as project_title, p.description as project_description,
            p.loan_amount as requested_amount, p.property_type, p.suburb,
            ub.name as borrower_name, uf.name as funder_name
     FROM deals d
     JOIN projects p ON d.project_id = p.id
     JOIN users ub ON d.borrower_id = ub.id
     JOIN users uf ON d.funder_id = uf.id
     WHERE d.id = ? AND (d.borrower_id = ? OR d.funder_id = ?)`,
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err) {
        console.error('Deal fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch deal' });
      }
      if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      res.json(deal);
    }
  );
});

// Complete deal
app.put('/api/deals/:id/complete', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.run(
        'UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', dealId],
        function(err) {
          if (err) {
            console.error('Deal update error:', err);
            return res.status(500).json({ error: 'Failed to complete deal' });
          }

          // Update project status
          db.run(
            'UPDATE projects SET submission_status = ? WHERE id = ?',
            ['closed', deal.project_id],
            (err) => {
              if (err) console.error('Project update error:', err);
            }
          );

          res.json({ message: 'Deal completed successfully' });
        }
      );
    }
  );
});

// Fulfill document request
app.put('/api/document-requests/:id/fulfill', authenticateToken, (req, res) => {
  const requestId = req.params.id;

  db.run(
    'UPDATE document_requests SET status = ?, fulfilled_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['fulfilled', requestId],
    function(err) {
      if (err) {
        console.error('Request update error:', err);
        return res.status(500).json({ error: 'Failed to update request' });
      }
      res.json({ message: 'Request fulfilled' });
    }
  );
});

// Get deal comments
app.get('/api/deals/:id/comments', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.all(
        `SELECT dc.*, u.name as user_name 
         FROM deal_comments dc 
         JOIN users u ON dc.user_id = u.id 
         WHERE dc.deal_id = ? 
         ORDER BY dc.created_at ASC`,
        [dealId],
        (err, comments) => {
          if (err) {
            console.error('Comments fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch comments' });
          }
          res.json(comments);
        }
      );
    }
  );
});

// Create deal comment
app.post('/api/deals/:id/comments', authenticateToken, (req, res) => {
  const dealId = req.params.id;
  const { comment } = req.body;

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.run(
        'INSERT INTO deal_comments (deal_id, user_id, comment) VALUES (?, ?, ?)',
        [dealId, req.user.id, comment.trim()],
        function(err) {
          if (err) {
            console.error('Comment creation error:', err);
            return res.status(500).json({ error: 'Failed to create comment' });
          }

          // Create notification for the other party
          const recipientId = req.user.id === deal.borrower_id ? deal.funder_id : deal.borrower_id;
          db.run(
            'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
            [recipientId, 'comment', 'New comment in deal room', dealId]
          );

          res.status(201).json({
            message: 'Comment posted successfully',
            comment_id: this.lastID
          });
        }
      );
    }
  );
});

// Get deal proposal
app.get('/api/deals/:id/proposal', authenticateToken, (req, res) => {
  const dealId = req.params.id;

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.get(
        `SELECT iq.*, u.name as funder_name 
         FROM indicative_quotes iq
         JOIN users u ON iq.funder_id = u.id
         WHERE iq.deal_id = ? 
         ORDER BY iq.created_at DESC 
         LIMIT 1`,
        [dealId],
        (err, proposal) => {
          if (err) {
            console.error('Proposal fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch proposal' });
          }
          // Return empty object if no proposal found instead of null
          if (!proposal) {
            return res.json({});
          }
          res.json(proposal);
        }
      );
    }
  );
});

// Create proposal
app.post('/api/deals/:id/proposals', authenticateToken, requireRole(['funder']), (req, res) => {
  const dealId = req.params.id;
  const { loan_amount, interest_rate, loan_term, establishment_fee, other_fees, conditions } = req.body;

  // Validate required fields
  if (!loan_amount || !interest_rate || !loan_term) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      details: {
        loan_amount: !loan_amount ? 'Required' : 'OK',
        interest_rate: !interest_rate ? 'Required' : 'OK',
        loan_term: !loan_term ? 'Required' : 'OK'
      }
    });
  }

  db.get(
    'SELECT * FROM deals WHERE id = ? AND funder_id = ?',
    [dealId, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 14); // Valid for 14 days

      db.run(
        `INSERT INTO indicative_quotes 
         (deal_id, funder_id, loan_amount, interest_rate, loan_term, establishment_fee, other_fees, conditions, valid_until) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [dealId, req.user.id, loan_amount, interest_rate, loan_term, establishment_fee || 0, other_fees, conditions, validUntil.toISOString()],
        function(err) {
          if (err) {
            console.error('Proposal creation error:', err);
            return res.status(500).json({ error: 'Failed to create proposal' });
          }

          // Create notification for borrower
          const proposalId = this.lastID;
          createNotification(
            deal.borrower_id,
            'proposal_received',
            `You have received a funding offer from ${req.user.name}`,
            dealId
          ).catch(err => console.error('Failed to create notification:', err));

          res.status(201).json({
            message: 'Proposal submitted successfully',
            proposal_id: proposalId
          });
        }
      );
    }
  );
});

// Respond to proposal
app.put('/api/proposals/:id/respond', authenticateToken, requireRole(['borrower']), (req, res) => {
  const proposalId = req.params.id;
  const { response, reason } = req.body;

  if (!['accept', 'decline', 'counter'].includes(response)) {
    return res.status(400).json({ error: 'Invalid response type' });
  }

  db.get(
    `SELECT iq.*, d.borrower_id, d.funder_id, d.id as deal_id
     FROM indicative_quotes iq
     JOIN deals d ON iq.deal_id = d.id
     WHERE iq.id = ? AND d.borrower_id = ?`,
    [proposalId, req.user.id],
    (err, proposal) => {
      if (err || !proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const status = response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'countered';

      db.run(
        'UPDATE indicative_quotes SET status = ? WHERE id = ?',
        [status, proposalId],
        function(err) {
          if (err) {
            console.error('Proposal update error:', err);
            return res.status(500).json({ error: 'Failed to update proposal' });
          }

          // Update deal status if accepted
          if (status === 'accepted') {
            db.run(
              'UPDATE deals SET status = ? WHERE id = ?',
              ['accepted', proposal.deal_id]
            );
          }

          // If declined with reason, add it to the deal comments
          if (status === 'declined' && reason) {
            db.run(
              'INSERT INTO deal_comments (deal_id, user_id, user_name, comment, created_at) VALUES (?, ?, ?, ?, ?)',
              [
                proposal.deal_id,
                req.user.id,
                req.user.name,
                `Declined proposal with reason: ${reason}`,
                new Date().toISOString()
              ]
            );
          }

          // Create notification for funder
          const notificationMessage = status === 'declined' && reason 
            ? `Your offer has been declined. Reason: ${reason}`
            : `Your offer has been ${status}`;
            
          createNotification(
            proposal.funder_id,
            'proposal_response',
            notificationMessage,
            proposal.deal_id
          ).catch(err => console.error('Failed to create notification:', err));

          res.json({ message: `Proposal ${status} successfully` });
        }
      );
    }
  );
});

// Download deal document
app.get('/api/deals/:dealId/documents/:documentId', authenticateToken, (req, res) => {
  const { dealId, documentId } = req.params;

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.get(
        'SELECT * FROM deal_documents WHERE id = ? AND deal_id = ?',
        [documentId, dealId],
        (err, document) => {
          if (err || !document) {
            return res.status(404).json({ error: 'Document not found' });
          }

          const filePath = path.join(__dirname, document.file_path);
          res.download(filePath, document.file_name);
        }
      );
    }
  );
});

// View deal document (inline viewing for PDFs)
app.get('/api/deals/:dealId/documents/:documentId/view', authenticateToken, (req, res) => {
  const { dealId, documentId } = req.params;

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      db.get(
        'SELECT * FROM deal_documents WHERE id = ? AND deal_id = ?',
        [documentId, dealId],
        (err, document) => {
          if (err || !document) {
            return res.status(404).json({ error: 'Document not found' });
          }

          // Extract just the filename from the stored path
          const filename = path.basename(document.file_path);
          
          // Use the same secure file serving logic as the /uploads endpoint
          // Security check for path traversal
          if (!filename || 
              filename.includes('..') || 
              filename.includes('/') || 
              filename.includes('\\') ||
              filename.includes('\0') ||
              filename.length > 255) {
            return res.status(400).send('Invalid filename');
          }
          
          const filepath = path.join(uploadsDir, filename);
          
          // Check if file exists and is within uploads directory
          if (!filepath.startsWith(uploadsDir)) {
            return res.status(403).send('Access denied');
          }
          
          // Send file for inline viewing
          res.sendFile(filepath, {
            headers: {
              'Content-Type': document.mime_type || 'application/octet-stream',
              'Content-Disposition': 'inline'
            }
          }, (err) => {
            if (err) {
              console.error('File send error:', err);
              if (!res.headersSent) {
                res.status(404).send('File not found');
              }
            }
          });
        }
      );
    }
  );
});

// Get notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  console.log('Fetching notifications for user:', req.user.id);
  
  db.all(
    `SELECT * FROM notifications 
     WHERE user_id = ? 
     ORDER BY created_at DESC 
     LIMIT 50`,
    [req.user.id],
    (err, notifications) => {
      if (err) {
        console.error('Notifications fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch notifications' });
      }
      console.log(`Found ${notifications.length} notifications for user ${req.user.id}`);
      res.json(notifications);
    }
  );
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  const notificationId = req.params.id;

  db.run(
    'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
    [notificationId, req.user.id],
    function(err) {
      if (err) {
        console.error('Notification update error:', err);
        return res.status(500).json({ error: 'Failed to update notification' });
      }
      res.json({ message: 'Notification marked as read' });
    }
  );
});

// Create notification (for internal use)
app.post('/api/deals/:id/notifications', authenticateToken, (req, res) => {
  const dealId = req.params.id;
  const { type, message } = req.body;

  db.get(
    'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
    [dealId, req.user.id, req.user.id],
    (err, deal) => {
      if (err || !deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      const recipientId = req.user.id === deal.borrower_id ? deal.funder_id : deal.borrower_id;

      db.run(
        'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
        [recipientId, type, message, dealId],
        function(err) {
          if (err) {
            console.error('Notification creation error:', err);
            return res.status(500).json({ error: 'Failed to create notification' });
          }
          res.json({ message: 'Notification sent' });
        }
      );
    }
  );
});

// ================================
// ERROR HANDLING
// ================================

// Multer error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 10 files per upload.' });
    }
  }
  
  console.error('Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Tranch Backend Server running on port ${PORT}`);
  console.log(`🔐 Authentication: Clerk`);
  console.log(`📊 Database: SQLite (${dbPath})`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Connected' : 'Not configured'}`);
  console.log(`🤖 OpenAI: ${process.env.OPENAI_API_KEY ? 'Connected' : 'Using fallback responses'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});


// Export app and middleware for use in other modules
module.exports = {
  app,
  authenticateToken,
  requireRole,
  uploadLimiter,
  authLimiter,
  paymentLimiter,
  logSecurityEvent,
  SecurityEvents,
  sanitizeUser,
  sanitizeProject,
  encryptField,
  decryptField
};