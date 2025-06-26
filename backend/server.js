// server.js - Production-Ready Tranch Platform Backend
// Version 3.0.0 - Complete Security & Performance Overhaul

// ===========================
// DEPENDENCIES & IMPORTS
// ===========================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sqlite3 = require('sqlite3').verbose();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { promisify } = require('util');

// Clerk imports
const { clerkClient } = require('@clerk/clerk-sdk-node');
const { Webhook } = require('svix');

// ===========================
// ENVIRONMENT VALIDATION
// ===========================
const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_FUNDER_MONTHLY_PRICE_ID'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file');
  process.exit(1);
}

// ===========================
// APP INITIALIZATION
// ===========================
const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// ===========================
// PATHS & DIRECTORIES
// ===========================
const dbPath = isProduction ? '/var/data/tranch.db' : './tranch.db';
const uploadsDir = isProduction ? '/var/data/uploads' : './uploads';
const tempDir = isProduction ? '/var/data/temp' : './temp';

// Ensure directories exist
const ensureDirectories = async () => {
  const dirs = [uploadsDir, tempDir];
  if (isProduction) {
    dirs.push(path.dirname(dbPath));
  }
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create directory ${dir}:`, err);
    }
  }
};

// ===========================
// DATABASE SETUP
// ===========================
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Database connected');
});

// Promisify database methods for better async handling
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// ===========================
// SECURITY MIDDLEWARE
// ===========================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = isProduction
      ? ['https://tranch-platform.onrender.com', 'https://tranch.com.au', 'https://www.tranch.com.au']
      : ['http://localhost:3000', 'http://localhost:5173'];
    
    // Allow requests with no origin (like mobile apps)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting configurations
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Different rate limiters for different endpoints
const generalLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests');
const authLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts');
const uploadLimiter = createRateLimiter(60 * 60 * 1000, 20, 'Too many uploads');

// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);

// ===========================
// WEBHOOK HANDLERS (BEFORE BODY PARSING)
// ===========================

// Clerk Webhook Handler
app.post('/api/webhooks/clerk', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    
    try {
      const webhook = new Webhook(webhookSecret);
      const headers = {
        'svix-id': req.headers['svix-id'],
        'svix-timestamp': req.headers['svix-timestamp'],
        'svix-signature': req.headers['svix-signature'],
      };

      const evt = webhook.verify(req.body, headers);
      const { type, data } = evt;
      
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
      console.error('Clerk webhook error:', error);
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  }
);

// Stripe Webhook Handler
app.post('/api/webhooks/stripe', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event.data.object);
          break;
          
        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object);
          break;
          
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;
          
        default:
          console.log(`Unhandled Stripe event type ${event.type}`);
      }
      
      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// ===========================
// BODY PARSING MIDDLEWARE
// ===========================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================
// AUTHENTICATION MIDDLEWARE
// ===========================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      // Verify the token with Clerk
      const ticket = await clerkClient.verifyToken(token);
      const clerkUserId = ticket.sub;
      
      // Get or create user in database
      let user = await dbGet('SELECT * FROM users WHERE clerk_user_id = ?', [clerkUserId]);
      
      if (!user) {
        // Fetch user from Clerk and create in database
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        user = await createUserFromClerk(clerkUser);
      }
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      req.user = user;
      req.db = { run: dbRun, get: dbGet, all: dbAll };
      next();
    } catch (verifyError) {
      console.error('Token verification error:', verifyError);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Role-based access control middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// ===========================
// FILE UPLOAD CONFIGURATION
// ===========================
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(uploadsDir, req.user.id.toString());
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedName}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only documents, spreadsheets, and images are allowed.'));
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  }
});

// ===========================
// HELPER FUNCTIONS
// ===========================

// Clerk user sync helpers
async function syncClerkUser(clerkUser) {
  try {
    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      console.error('No email found for Clerk user:', clerkUser.id);
      return;
    }
    
    const name = clerkUser.firstName 
      ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
      : email.split('@')[0];
    
    // Check if user exists
    const existingUser = await dbGet('SELECT * FROM users WHERE clerk_user_id = ? OR email = ?', [clerkUser.id, email]);
    
    if (existingUser) {
      // Update existing user
      await dbRun(
        'UPDATE users SET clerk_user_id = ?, name = ?, email = ? WHERE id = ?',
        [clerkUser.id, name, email, existingUser.id]
      );
    } else {
      // Create new user
      await dbRun(
        'INSERT INTO users (clerk_user_id, name, email, role, approved, verification_status) VALUES (?, ?, ?, ?, ?, ?)',
        [clerkUser.id, name, email, 'borrower', 0, 'pending']
      );
    }
  } catch (error) {
    console.error('Error syncing Clerk user:', error);
  }
}

async function deleteClerkUser(clerkUserId) {
  try {
    await dbRun('DELETE FROM users WHERE clerk_user_id = ?', [clerkUserId]);
  } catch (error) {
    console.error('Error deleting user:', error);
  }
}

async function createUserFromClerk(clerkUser) {
  const email = clerkUser.emailAddresses?.[0]?.emailAddress;
  if (!email) return null;
  
  const name = clerkUser.firstName 
    ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
    : email.split('@')[0];
  
  try {
    const result = await dbRun(
      'INSERT INTO users (clerk_user_id, name, email, role, approved, verification_status) VALUES (?, ?, ?, ?, ?, ?)',
      [clerkUser.id, name, email, 'borrower', 0, 'pending']
    );
    
    return await dbGet('SELECT * FROM users WHERE id = ?', [result.lastID]);
  } catch (error) {
    console.error('Error creating user from Clerk:', error);
    return null;
  }
}

// Stripe webhook handlers
async function handlePaymentIntentSucceeded(paymentIntent) {
  if (paymentIntent.metadata.payment_type === 'project_listing') {
    await dbRun(
      'UPDATE projects SET payment_status = ?, visible = 1, stripe_payment_intent_id = ? WHERE id = ?',
      ['paid', paymentIntent.id, paymentIntent.metadata.project_id]
    );
    
    await dbRun(
      'UPDATE payments SET status = ? WHERE stripe_payment_intent_id = ?',
      ['completed', paymentIntent.id]
    );
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  if (invoice.subscription) {
    const user = await dbGet('SELECT * FROM users WHERE stripe_customer_id = ?', [invoice.customer]);
    if (user) {
      await dbRun('UPDATE users SET subscription_status = ? WHERE id = ?', ['active', user.id]);
    }
  }
}

async function handleSubscriptionDeleted(subscription) {
  const user = await dbGet('SELECT * FROM users WHERE stripe_customer_id = ?', [subscription.customer]);
  if (user) {
    await dbRun('UPDATE users SET subscription_status = ? WHERE id = ?', ['cancelled', user.id]);
  }
}

// Document completeness checker
async function checkDocumentCompleteness(projectId) {
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
  
  const docs = await dbAll('SELECT DISTINCT document_type FROM documents WHERE project_id = ?', [projectId]);
  const uploadedTypes = docs.map(doc => doc.document_type);
  const hasAllRequired = REQUIRED_DOCUMENT_TYPES.every(type => uploadedTypes.includes(type));
  
  await dbRun('UPDATE projects SET documents_complete = ? WHERE id = ?', [hasAllRequired ? 1 : 0, projectId]);
  
  return hasAllRequired;
}

// ===========================
// STATIC FILE SERVING
// ===========================
app.get('/uploads/:userId/:filename', authenticateToken, async (req, res) => {
  try {
    const { userId, filename } = req.params;
    
    // Validate filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);
    if (sanitizedFilename !== filename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filepath = path.join(uploadsDir, userId, sanitizedFilename);
    
    // Check if file exists
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Verify access permissions
    const document = await dbGet(
      `SELECT d.*, p.borrower_id 
       FROM documents d 
       JOIN projects p ON d.project_id = p.id 
       WHERE d.file_path = ?`,
      [filepath]
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check permissions based on user role
    if (req.user.role === 'borrower' && document.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (req.user.role === 'funder') {
      const access = await dbGet(
        'SELECT * FROM access_requests WHERE project_id = ? AND funder_id = ? AND status = ?',
        [document.project_id, req.user.id, 'approved']
      );
      
      if (!access) {
        return res.status(403).json({ error: 'Access not granted' });
      }
    }
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    res.sendFile(filepath);
  } catch (error) {
    console.error('File serving error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// ===========================
// DATABASE INITIALIZATION
// ===========================
const initializeDatabase = async () => {
  try {
    // Users table
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT CHECK(role IN ('borrower', 'funder', 'admin')) NOT NULL,
      approved BOOLEAN DEFAULT 0,
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
    await dbRun(`CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT NOT NULL,
      suburb TEXT NOT NULL,
      state TEXT,
      postcode TEXT,
      
      -- Property details
      property_type TEXT,
      development_type TEXT,
      development_stage TEXT,
      
      -- Land & Development
      land_area_sqm REAL,
      land_value REAL,
      construction_cost REAL,
      total_units INTEGER,
      total_lots INTEGER,
      total_gfa REAL,
      
      -- Financial
      loan_amount INTEGER NOT NULL,
      interest_rate REAL,
      loan_term INTEGER,
      total_development_cost REAL,
      total_revenue REAL,
      development_profit REAL,
      profit_margin REAL,
      return_on_cost REAL,
      construction_duration INTEGER,
      presales_achieved INTEGER,
      
      -- Additional fields
      equity_contribution INTEGER,
      expected_gdc INTEGER,
      expected_profit INTEGER,
      lvr REAL,
      icr REAL,
      project_size_sqm INTEGER,
      number_of_units INTEGER,
      number_of_levels INTEGER,
      car_spaces INTEGER,
      zoning TEXT,
      planning_permit_status TEXT,
      expected_start_date DATE,
      expected_completion_date DATE,
      
      -- Risk ratings
      market_risk_rating TEXT DEFAULT 'medium',
      construction_risk_rating TEXT DEFAULT 'medium',
      location_risk_rating TEXT DEFAULT 'medium',
      
      -- Status fields
      payment_status TEXT DEFAULT 'unpaid',
      stripe_payment_intent_id TEXT,
      visible BOOLEAN DEFAULT 0,
      submission_status TEXT DEFAULT 'draft',
      documents_complete BOOLEAN DEFAULT 0,
      ai_analyzed BOOLEAN DEFAULT 0,
      builder_name TEXT,
      architect_name TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (borrower_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Documents table
    await dbRun(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      status TEXT DEFAULT 'uploaded',
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    )`);

    // Access requests table
    await dbRun(`CREATE TABLE IF NOT EXISTS access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      funder_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      initial_message TEXT,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      declined_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (funder_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(project_id, funder_id)
    )`);

    // Messages table
    await dbRun(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_request_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      read_at DATETIME,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (access_request_id) REFERENCES access_requests (id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Payments table
    await dbRun(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      stripe_payment_intent_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'aud',
      payment_type TEXT CHECK(payment_type IN ('project_listing', 'subscription')) NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
    )`);

    // Deals table
    await dbRun(`CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      access_request_id INTEGER NOT NULL,
      borrower_id INTEGER NOT NULL,
      funder_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (access_request_id) REFERENCES access_requests (id) ON DELETE CASCADE,
      FOREIGN KEY (borrower_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (funder_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(project_id, funder_id)
    )`);

    // Deal documents table
    await dbRun(`CREATE TABLE IF NOT EXISTS deal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      uploader_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      request_id INTEGER,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE CASCADE,
      FOREIGN KEY (uploader_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Document requests table
    await dbRun(`CREATE TABLE IF NOT EXISTS document_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      document_name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fulfilled_at DATETIME,
      FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE CASCADE,
      FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Deal comments table
    await dbRun(`CREATE TABLE IF NOT EXISTS deal_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Indicative quotes table
    await dbRun(`CREATE TABLE IF NOT EXISTS indicative_quotes (
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
      FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE CASCADE,
      FOREIGN KEY (funder_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Notifications table
    await dbRun(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      related_id INTEGER,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Project unit mix table
    await dbRun(`CREATE TABLE IF NOT EXISTS project_unit_mix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      unit_type TEXT NOT NULL,
      unit_count INTEGER NOT NULL,
      unit_size REAL,
      unit_price REAL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    )`);

    // AI chat sessions table
    await dbRun(`CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      session_title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
    )`);

    // AI chat messages table
    await dbRun(`CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      sender TEXT CHECK(sender IN ('user', 'ai')) NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES ai_chat_sessions (id) ON DELETE CASCADE
    )`);

    // System settings table
    await dbRun(`CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert default settings
    await dbRun(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES 
      ('project_listing_fee', '49900'),
      ('monthly_subscription_fee', '29900'),
      ('max_file_upload_size', '52428800'),
      ('ai_chat_enabled', 'true')`);

    // Create indexes for better performance
    await dbRun('CREATE INDEX IF NOT EXISTS idx_projects_borrower ON projects(borrower_id)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_access_requests_project ON access_requests(project_id)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_access_requests_funder ON access_requests(funder_id)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(access_request_id)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_deals_project ON deals(project_id)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)');

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

// ===========================
// API ROUTES - AUTH
// ===========================

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      approved: req.user.approved,
      verification_status: req.user.verification_status,
      subscription_status: req.user.subscription_status,
      company_name: req.user.company_name,
      company_type: req.user.company_type
    }
  });
});

// Update user role
app.post('/api/auth/set-role', authenticateToken, authLimiter, async (req, res) => {
  const { role } = req.body;
  
  if (!['borrower', 'funder'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    await req.db.run(
      `UPDATE users SET role = ?, approved = ?, verification_status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        role,
        role === 'borrower' ? 1 : 0,
        role === 'borrower' ? 'verified' : 'pending',
        req.user.id
      ]
    );

    // Update Clerk metadata
    try {
      await clerkClient.users.updateUserMetadata(req.user.clerk_user_id, {
        publicMetadata: { role }
      });
    } catch (clerkError) {
      console.error('Failed to update Clerk metadata:', clerkError);
    }

    res.json({ message: 'Role updated successfully', role });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Complete funder profile
app.post('/api/auth/complete-profile', authenticateToken, async (req, res) => {
  const { 
    company_name, company_type, investment_focus,
    typical_deal_size_min, typical_deal_size_max,
    years_experience, aum, phone, linkedin, bio, abn
  } = req.body;

  if (req.user.role !== 'funder') {
    return res.status(400).json({ error: 'Profile completion only for funders' });
  }

  // Validate required fields
  if (!company_name || !company_type || !investment_focus || !typical_deal_size_min || 
      !typical_deal_size_max || !years_experience || !phone || !abn) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await req.db.run(
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
      ]
    );

    res.json({ message: 'Profile completed successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===========================
// API ROUTES - USER PROFILE
// ===========================

app.get('/api/users/:id/profile', authenticateToken, async (req, res) => {
  const userId = parseInt(req.params.id);

  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const user = await req.db.get(
      `SELECT id, name, email, role, approved, verification_status, created_at,
       company_name, company_type, investment_focus,
       typical_deal_size_min, typical_deal_size_max,
       years_experience, aum, phone, linkedin, bio
       FROM users WHERE id = ?`, 
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/users/:id/profile', authenticateToken, async (req, res) => {
  const userId = parseInt(req.params.id);

  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { 
    name, company_name, company_type, investment_focus,
    typical_deal_size_min, typical_deal_size_max,
    years_experience, aum, phone, linkedin, bio
  } = req.body;

  try {
    await req.db.run(
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
      ]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===========================
// API ROUTES - PROJECTS
// ===========================

// Create project
app.post('/api/projects', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const projectData = {
    ...req.body,
    borrower_id: req.user.id,
    payment_status: 'unpaid',
    visible: 0,
    ai_analyzed: req.body.ai_analyzed || 0
  };

  // Validate required fields
  if (!projectData.title || !projectData.location || !projectData.suburb || !projectData.loan_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const transaction = await new Promise((resolve) => {
    db.serialize(() => {
      resolve(db);
    });
  });

  try {
    await dbRun('BEGIN TRANSACTION');

    // Insert project
    const result = await dbRun(
      `INSERT INTO projects (
        borrower_id, title, description, location, suburb, state, postcode,
        property_type, development_type, development_stage,
        land_area_sqm, land_value, construction_cost,
        total_units, total_lots, total_gfa,
        loan_amount, loan_term, interest_rate,
        total_development_cost, total_revenue, development_profit,
        profit_margin, return_on_cost, lvr,
        equity_contribution, expected_gdc, expected_profit,
        project_size_sqm, number_of_units, number_of_levels,
        car_spaces, zoning, planning_permit_status,
        expected_start_date, expected_completion_date,
        market_risk_rating, construction_risk_rating, location_risk_rating,
        ai_analyzed, builder_name, architect_name,
        payment_status, visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectData.borrower_id,
        projectData.title,
        projectData.description,
        projectData.location,
        projectData.suburb,
        projectData.state,
        projectData.postcode,
        projectData.property_type,
        projectData.development_type,
        projectData.development_stage,
        projectData.land_area_sqm,
        projectData.land_value,
        projectData.construction_cost,
        projectData.total_units,
        projectData.total_lots,
        projectData.total_gfa,
        projectData.loan_amount,
        projectData.loan_term,
        projectData.interest_rate,
        projectData.total_development_cost,
        projectData.total_revenue,
        projectData.development_profit,
        projectData.profit_margin,
        projectData.return_on_cost,
        projectData.lvr,
        projectData.equity_contribution,
        projectData.expected_gdc,
        projectData.expected_profit,
        projectData.project_size_sqm,
        projectData.number_of_units,
        projectData.number_of_levels,
        projectData.car_spaces,
        projectData.zoning,
        projectData.planning_permit_status,
        projectData.expected_start_date,
        projectData.expected_completion_date,
        projectData.market_risk_rating,
        projectData.construction_risk_rating,
        projectData.location_risk_rating,
        projectData.ai_analyzed,
        projectData.builder_name,
        projectData.architect_name,
        projectData.payment_status,
        projectData.visible
      ]
    );

    const projectId = result.lastID;

    // Insert unit mix if provided
    if (req.body.unit_mix && Array.isArray(req.body.unit_mix)) {
      for (const unit of req.body.unit_mix) {
        await dbRun(
          `INSERT INTO project_unit_mix (project_id, unit_type, unit_count, unit_size, unit_price) 
           VALUES (?, ?, ?, ?, ?)`,
          [projectId, unit.type, unit.count, unit.size, unit.price]
        );
      }
    }

    await dbRun('COMMIT');

    res.status(201).json({ 
      id: projectId, 
      message: 'Project created successfully' 
    });
  } catch (error) {
    await dbRun('ROLLBACK');
    console.error('Project creation error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get projects
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    let projects;
    
    if (req.user.role === 'borrower') {
      projects = await req.db.all(
        `SELECT p.*, 
                u.name as borrower_name,
                COUNT(DISTINCT d.id) as deal_count
         FROM projects p
         LEFT JOIN users u ON p.borrower_id = u.id
         LEFT JOIN deals d ON p.id = d.project_id AND d.status = 'active'
         WHERE p.borrower_id = ?
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'funder') {
      projects = await req.db.all(
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
        [req.user.id, req.user.id]
      );
    } else if (req.user.role === 'admin') {
      projects = await req.db.all(
        `SELECT p.*, u.name as borrower_name
         FROM projects p
         LEFT JOIN users u ON p.borrower_id = u.id
         ORDER BY p.created_at DESC`
      );
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }
    
    res.json(projects);
  } catch (error) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  const projectId = parseInt(req.params.id);
  
  try {
    let project;
    
    if (req.user.role === 'borrower') {
      project = await req.db.get(
        `SELECT p.*, 
                u.name as borrower_name,
                COUNT(DISTINCT d.id) as deal_count
         FROM projects p
         LEFT JOIN users u ON p.borrower_id = u.id
         LEFT JOIN deals d ON p.id = d.project_id AND d.status = 'active'
         WHERE p.id = ? AND p.borrower_id = ?
         GROUP BY p.id`,
        [projectId, req.user.id]
      );
    } else if (req.user.role === 'funder') {
      project = await req.db.get(
        `SELECT p.*, 
                u.name as borrower_name,
                ar.status as access_status,
                ar.id as access_request_id,
                d.id as deal_id
         FROM projects p
         LEFT JOIN users u ON p.borrower_id = u.id
         LEFT JOIN access_requests ar ON p.id = ar.project_id AND ar.funder_id = ?
         LEFT JOIN deals d ON p.id = d.project_id AND d.funder_id = ? AND d.status = 'active'
         WHERE p.id = ?`,
        [req.user.id, req.user.id, projectId]
      );
      
      // Check access permissions
      if (project && project.payment_status !== 'paid' && !project.access_status) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'admin') {
      project = await req.db.get(
        `SELECT p.*, u.name as borrower_name
         FROM projects p
         LEFT JOIN users u ON p.borrower_id = u.id
         WHERE p.id = ?`,
        [projectId]
      );
    }
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Project fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Update project
app.put('/api/projects/:id', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const projectId = parseInt(req.params.id);
  const updateFields = { ...req.body };
  
  // Remove fields that shouldn't be updated
  delete updateFields.id;
  delete updateFields.borrower_id;
  delete updateFields.created_at;
  delete updateFields.payment_status;
  delete updateFields.stripe_payment_intent_id;
  
  updateFields.updated_at = new Date().toISOString();

  const fields = Object.keys(updateFields);
  const values = Object.values(updateFields);
  const placeholders = fields.map(field => `${field} = ?`).join(', ');

  try {
    const result = await req.db.run(
      `UPDATE projects SET ${placeholders} WHERE id = ? AND borrower_id = ?`,
      [...values, projectId, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    res.json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error('Project update error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Get project deals
app.get('/api/projects/:projectId/deals', authenticateToken, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  
  try {
    const deals = await req.db.all(
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
      [projectId, req.user.id, req.user.id]
    );
    
    res.json(deals);
  } catch (error) {
    console.error('Deals fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// ===========================
// API ROUTES - DOCUMENTS
// ===========================

// Upload documents
app.post('/api/projects/:id/documents', 
  authenticateToken, 
  requireRole(['borrower']), 
  uploadLimiter,
  upload.array('documents', 10), 
  async (req, res) => {
    const projectId = parseInt(req.params.id);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    try {
      // Verify project ownership
      const project = await req.db.get(
        'SELECT * FROM projects WHERE id = ? AND borrower_id = ?',
        [projectId, req.user.id]
      );
      
      if (!project) {
        // Clean up uploaded files
        for (const file of req.files) {
          await fs.unlink(file.path).catch(() => {});
        }
        return res.status(404).json({ error: 'Project not found' });
      }

      const documentTypes = req.body.document_types ? JSON.parse(req.body.document_types) : [];
      const uploadedDocs = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const docType = documentTypes[i] || 'other';
        
        const result = await req.db.run(
          'INSERT INTO documents (project_id, document_type, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
          [projectId, docType, file.originalname, file.path, file.size, file.mimetype]
        );
        
        uploadedDocs.push({
          id: result.lastID,
          document_type: docType,
          file_name: file.originalname
        });
      }

      // Check document completeness
      await checkDocumentCompleteness(projectId);

      res.status(201).json({
        message: 'Documents uploaded successfully',
        documents: uploadedDocs
      });
    } catch (error) {
      // Clean up files on error
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
      
      console.error('Document upload error:', error);
      res.status(500).json({ error: 'Failed to upload documents' });
    }
  }
);

// Get project documents
app.get('/api/projects/:id/documents', authenticateToken, async (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    // Check access permissions
    let hasAccess = false;
    
    if (req.user.role === 'borrower') {
      const project = await req.db.get(
        'SELECT id FROM projects WHERE id = ? AND borrower_id = ?',
        [projectId, req.user.id]
      );
      hasAccess = !!project;
    } else if (req.user.role === 'funder') {
      const access = await req.db.get(
        'SELECT status FROM access_requests WHERE project_id = ? AND funder_id = ? AND status = ?',
        [projectId, req.user.id, 'approved']
      );
      hasAccess = !!access;
    } else if (req.user.role === 'admin') {
      hasAccess = true;
    }
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const documents = await req.db.all(
      'SELECT * FROM documents WHERE project_id = ? ORDER BY uploaded_at DESC',
      [projectId]
    );
    
    res.json(documents);
  } catch (error) {
    console.error('Documents fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get project documents for deal room
app.get('/api/projects/:projectId/documents/deal', authenticateToken, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  
  try {
    // Verify user has access via a deal
    const deal = await req.db.get(
      `SELECT d.* FROM deals d 
       WHERE d.project_id = ? 
       AND (d.borrower_id = ? OR d.funder_id = ?)
       AND d.status = 'active'
       LIMIT 1`,
      [projectId, req.user.id, req.user.id]
    );
    
    if (!deal) {
      return res.status(403).json({ error: 'Access denied - no active deal found' });
    }

    // Get project documents with uploader name
    const documents = await req.db.all(
      `SELECT d.*, p.borrower_id, u.name as uploader_name
       FROM documents d
       JOIN projects p ON d.project_id = p.id
       JOIN users u ON p.borrower_id = u.id
       WHERE d.project_id = ?
       ORDER BY d.uploaded_at DESC`,
      [projectId]
    );
    
    res.json(documents || []);
  } catch (error) {
    console.error('Documents fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Delete document
app.delete('/api/documents/:id', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const documentId = parseInt(req.params.id);

  try {
    const document = await req.db.get(
      'SELECT d.*, p.borrower_id FROM documents d JOIN projects p ON d.project_id = p.id WHERE d.id = ?',
      [documentId]
    );

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete file from filesystem
    await fs.unlink(document.file_path).catch(() => {});

    // Delete from database
    await req.db.run('DELETE FROM documents WHERE id = ?', [documentId]);
    
    // Check document completeness
    await checkDocumentCompleteness(document.project_id);
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Document deletion error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get required documents
app.get('/api/required-documents', authenticateToken, (req, res) => {
  res.json({
    required_documents: [
      'development_application',
      'feasibility_study',
      'site_survey',
      'planning_permit',
      'financial_statements',
      'construction_contract',
      'insurance_documents',
      'environmental_report'
    ],
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

// ===========================
// API ROUTES - ACCESS REQUESTS
// ===========================

// Create access request
app.post('/api/access-requests', authenticateToken, requireRole(['funder']), async (req, res) => {
  const { project_id, initial_message } = req.body;

  if (!req.user.approved) {
    return res.status(403).json({ error: 'Account pending approval' });
  }

  if (!project_id) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    // Check if request already exists
    const existing = await req.db.get(
      'SELECT * FROM access_requests WHERE project_id = ? AND funder_id = ?',
      [project_id, req.user.id]
    );

    if (existing) {
      return res.status(400).json({ error: 'Access request already exists' });
    }

    const result = await req.db.run(
      'INSERT INTO access_requests (project_id, funder_id, initial_message) VALUES (?, ?, ?)',
      [project_id, req.user.id, initial_message]
    );

    // Create notification for borrower
    const project = await req.db.get('SELECT borrower_id, title FROM projects WHERE id = ?', [project_id]);
    if (project) {
      await req.db.run(
        'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
        [project.borrower_id, 'access_request', `${req.user.name} requested access to ${project.title}`, result.lastID]
      );
    }

    res.status(201).json({ 
      message: 'Access request submitted',
      request_id: result.lastID
    });
  } catch (error) {
    console.error('Access request creation error:', error);
    res.status(500).json({ error: 'Failed to create access request' });
  }
});

// Get access requests
app.get('/api/access-requests', authenticateToken, async (req, res) => {
  try {
    let requests;

    if (req.user.role === 'borrower') {
      requests = await req.db.all(
        `SELECT ar.*, p.title as project_title, p.loan_amount,
                u.name as funder_name, u.email as funder_email,
                u.company_name, u.company_type, u.investment_focus,
                u.years_experience, u.bio, u.verification_status
         FROM access_requests ar 
         JOIN projects p ON ar.project_id = p.id 
         JOIN users u ON ar.funder_id = u.id 
         WHERE p.borrower_id = ?
         ORDER BY ar.requested_at DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'funder') {
      requests = await req.db.all(
        `SELECT ar.*, p.title as project_title, p.suburb, p.loan_amount,
                u.name as borrower_name, u.email as borrower_email
         FROM access_requests ar 
         JOIN projects p ON ar.project_id = p.id 
         JOIN users u ON p.borrower_id = u.id 
         WHERE ar.funder_id = ?
         ORDER BY ar.requested_at DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'admin') {
      requests = await req.db.all(
        `SELECT ar.*, p.title as project_title,
                u.name as funder_name, u.email as funder_email,
                b.name as borrower_name, b.email as borrower_email
         FROM access_requests ar 
         JOIN projects p ON ar.project_id = p.id 
         JOIN users u ON ar.funder_id = u.id 
         JOIN users b ON p.borrower_id = b.id
         ORDER BY ar.requested_at DESC`
      );
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(requests);
  } catch (error) {
    console.error('Access requests fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch access requests' });
  }
});

// Approve access request
app.put('/api/access-requests/:id/approve', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const requestId = parseInt(req.params.id);

  try {
    const request = await req.db.get(
      `SELECT ar.*, p.borrower_id 
       FROM access_requests ar 
       JOIN projects p ON ar.project_id = p.id 
       WHERE ar.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    if (request.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await req.db.run(
      'UPDATE access_requests SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['approved', requestId]
    );

    // Create notification for funder
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [request.funder_id, 'access_approved', 'Your access request has been approved', requestId]
    );

    res.json({ message: 'Access request approved' });
  } catch (error) {
    console.error('Access request approval error:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Decline access request
app.put('/api/access-requests/:id/decline', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const requestId = parseInt(req.params.id);

  try {
    const request = await req.db.get(
      `SELECT ar.*, p.borrower_id 
       FROM access_requests ar 
       JOIN projects p ON ar.project_id = p.id 
       WHERE ar.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    if (request.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await req.db.run(
      'UPDATE access_requests SET status = ?, declined_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['declined', requestId]
    );

    // Create notification for funder
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [request.funder_id, 'access_declined', 'Your access request has been declined', requestId]
    );

    res.json({ message: 'Access request declined' });
  } catch (error) {
    console.error('Access request decline error:', error);
    res.status(500).json({ error: 'Failed to decline request' });
  }
});

// ===========================
// API ROUTES - MESSAGING
// ===========================

// Get messages
app.get('/api/access-requests/:id/messages', authenticateToken, async (req, res) => {
  const requestId = parseInt(req.params.id);

  try {
    const request = await req.db.get(
      `SELECT ar.*, p.borrower_id 
       FROM access_requests ar 
       JOIN projects p ON ar.project_id = p.id 
       WHERE ar.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    // Check access permissions
    if (req.user.role === 'borrower' && request.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'funder' && request.funder_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await req.db.all(
      `SELECT m.*, u.name as sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.access_request_id = ? 
       ORDER BY m.sent_at ASC`,
      [requestId]
    );

    res.json(messages);
  } catch (error) {
    console.error('Messages fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message
app.post('/api/access-requests/:id/messages', authenticateToken, async (req, res) => {
  const requestId = parseInt(req.params.id);
  const { message, message_type = 'text' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (message.length > 10000) {
    return res.status(400).json({ error: 'Message too long (max 10000 characters)' });
  }

  try {
    const request = await req.db.get(
      `SELECT ar.*, p.borrower_id 
       FROM access_requests ar 
       JOIN projects p ON ar.project_id = p.id 
       WHERE ar.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    // Check access permissions
    if (req.user.role === 'borrower' && request.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'funder' && request.funder_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await req.db.run(
      'INSERT INTO messages (access_request_id, sender_id, sender_role, message, message_type) VALUES (?, ?, ?, ?, ?)',
      [requestId, req.user.id, req.user.role, message.trim(), message_type]
    );

    // Create notification for recipient
    const recipientId = req.user.role === 'borrower' ? request.funder_id : request.borrower_id;
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [recipientId, 'new_message', 'You have a new message', requestId]
    );

    res.status(201).json({ 
      message: 'Message sent successfully',
      message_id: result.lastID 
    });
  } catch (error) {
    console.error('Message creation error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark message as read
app.put('/api/messages/:id/read', authenticateToken, async (req, res) => {
  const messageId = parseInt(req.params.id);

  try {
    await req.db.run(
      'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND sender_id != ?',
      [messageId, req.user.id]
    );

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Message read update error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// ===========================
// API ROUTES - PAYMENTS
// ===========================

// Create project payment
app.post('/api/payments/create-project-payment', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const { project_id } = req.body;
  
  if (!project_id) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    // Verify project ownership
    const project = await req.db.get(
      'SELECT * FROM projects WHERE id = ? AND borrower_id = ?',
      [project_id, req.user.id]
    );
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (project.payment_status === 'paid') {
      return res.status(400).json({ error: 'Project already paid' });
    }

    const amount = 49900; // $499 in cents

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud',
      metadata: {
        project_id: project_id.toString(),
        user_id: req.user.id.toString(),
        payment_type: 'project_listing'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    await req.db.run(
      'INSERT INTO payments (user_id, project_id, stripe_payment_intent_id, amount, payment_type) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, project_id, paymentIntent.id, amount, 'project_listing']
    );

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: amount
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Payment creation failed' });
  }
});

// Create subscription
app.post('/api/payments/create-subscription', authenticateToken, requireRole(['funder']), async (req, res) => {
  const { payment_method_id } = req.body;
  
  if (!payment_method_id) {
    return res.status(400).json({ error: 'Payment method is required' });
  }

  try {
    let customerId = req.user.stripe_customer_id;
    
    // Create or retrieve customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        payment_method: payment_method_id,
        invoice_settings: {
          default_payment_method: payment_method_id,
        },
        metadata: { 
          user_id: String(req.user.id),
          role: req.user.role
        }
      });
      customerId = customer.id;
      
      await req.db.run(
        'UPDATE users SET stripe_customer_id = ? WHERE id = ?', 
        [customerId, req.user.id]
      );
    } else {
      // Attach payment method to existing customer
      await stripe.paymentMethods.attach(payment_method_id, {
        customer: customerId,
      });
      
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: payment_method_id,
        },
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_FUNDER_MONTHLY_PRICE_ID }],
      payment_behavior: 'default_incomplete',
      payment_settings: { 
        save_default_payment_method: 'on_subscription' 
      },
      expand: ['latest_invoice.payment_intent'],
    });

    // Update user subscription status if active
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      await req.db.run(
        'UPDATE users SET subscription_status = ? WHERE id = ?', 
        ['active', req.user.id]
      );
    }

    const response = {
      subscription_id: subscription.id,
      status: subscription.status
    };

    if (subscription.latest_invoice?.payment_intent?.client_secret) {
      response.client_secret = subscription.latest_invoice.payment_intent.client_secret;
    }

    res.json(response);
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({ 
      error: error.message || 'Subscription creation failed' 
    });
  }
});

// Cancel subscription
app.post('/api/payments/cancel-subscription', authenticateToken, requireRole(['funder']), async (req, res) => {
  if (!req.user.stripe_customer_id) {
    return res.status(400).json({ error: 'No active subscription found' });
  }

  try {
    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: req.user.stripe_customer_id,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    // Cancel subscription at period end
    const subscription = await stripe.subscriptions.update(
      subscriptions.data[0].id,
      { cancel_at_period_end: true }
    );

    res.json({ 
      message: 'Subscription will be cancelled at the end of the current billing period',
      cancel_at: subscription.current_period_end 
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Simulate payment success (development only)
app.post('/api/payments/simulate-success', authenticateToken, requireRole(['borrower']), async (req, res) => {
  if (isProduction) {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { project_id, payment_intent_id } = req.body;

  if (!project_id) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  try {
    await req.db.run('BEGIN TRANSACTION');
    
    const result = await req.db.run(
      'UPDATE projects SET payment_status = ?, visible = 1, stripe_payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND borrower_id = ?',
      ['paid', payment_intent_id || 'pi_demo_' + Date.now(), project_id, req.user.id]
    );

    if (result.changes === 0) {
      await req.db.run('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    await req.db.run(
      'INSERT INTO payments (user_id, project_id, stripe_payment_intent_id, amount, payment_type, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, project_id, payment_intent_id || 'pi_demo_' + Date.now(), 49900, 'project_listing', 'completed']
    );

    await req.db.run('COMMIT');
    
    res.json({ 
      message: 'Project published successfully',
      project_id: project_id,
      status: 'paid'
    });
  } catch (error) {
    await req.db.run('ROLLBACK');
    console.error('Payment simulation error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Simulate subscription (development only)
app.post('/api/payments/simulate-subscription', authenticateToken, requireRole(['funder']), async (req, res) => {
  if (isProduction) {
    return res.status(403).json({ error: 'Not available in production' });
  }

  try {
    await req.db.run(
      'UPDATE users SET subscription_status = ? WHERE id = ?',
      ['active', req.user.id]
    );

    res.json({ 
      message: 'Subscription activated successfully',
      status: 'active'
    });
  } catch (error) {
    console.error('Subscription simulation error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// ===========================
// API ROUTES - DEALS
// ===========================

// Create deal
app.post('/api/deals', authenticateToken, async (req, res) => {
  const { project_id, access_request_id } = req.body;

  if (!project_id || !access_request_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Verify the access request is approved
    const accessRequest = await req.db.get(
      `SELECT ar.*, p.borrower_id, p.title as project_title
       FROM access_requests ar
       JOIN projects p ON ar.project_id = p.id
       WHERE ar.id = ? 
       AND ar.status = 'approved' 
       AND (ar.funder_id = ? OR p.borrower_id = ?)`,
      [access_request_id, req.user.id, req.user.id]
    );

    if (!accessRequest) {
      return res.status(404).json({ error: 'Access request not found or not approved' });
    }

    // Check if deal already exists
    const existingDeal = await req.db.get(
      'SELECT id FROM deals WHERE project_id = ? AND funder_id = ? AND status = "active"',
      [project_id, accessRequest.funder_id]
    );

    if (existingDeal) {
      return res.json({ deal_id: existingDeal.id });
    }

    // Create new deal
    const result = await req.db.run(
      `INSERT INTO deals (project_id, access_request_id, borrower_id, funder_id, status) 
       VALUES (?, ?, ?, ?, 'active')`,
      [project_id, access_request_id, accessRequest.borrower_id, accessRequest.funder_id]
    );

    // Send notification
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [accessRequest.borrower_id, 'deal_created', `${req.user.name} has engaged with your project: ${accessRequest.project_title}`, result.lastID]
    );

    res.status(201).json({ 
      message: 'Deal created successfully',
      deal_id: result.lastID 
    });
  } catch (error) {
    console.error('Deal creation error:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// Get deal by ID
app.get('/api/deals/:id', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);

  try {
    const deal = await req.db.get(
      `SELECT d.*, 
       p.title as project_title, p.description as project_description,
       p.loan_amount as requested_amount, p.property_type, p.suburb,
       ub.name as borrower_name, ub.email as borrower_email,
       uf.name as funder_name, uf.email as funder_email
       FROM deals d
       JOIN projects p ON d.project_id = p.id
       JOIN users ub ON d.borrower_id = ub.id
       JOIN users uf ON d.funder_id = uf.id
       WHERE d.id = ? AND (d.borrower_id = ? OR d.funder_id = ? OR ? = 'admin')`,
      [dealId, req.user.id, req.user.id, req.user.role]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(deal);
  } catch (error) {
    console.error('Deal fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// Complete deal
app.put('/api/deals/:id/complete', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);

  try {
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    await req.db.run(
      'UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', dealId]
    );

    // Update project status
    await req.db.run(
      'UPDATE projects SET submission_status = ? WHERE id = ?',
      ['closed', deal.project_id]
    );

    res.json({ message: 'Deal completed successfully' });
  } catch (error) {
    console.error('Deal update error:', error);
    res.status(500).json({ error: 'Failed to complete deal' });
  }
});

// Get deal documents
app.get('/api/deals/:id/documents', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);

  try {
    // Verify user has access to this deal
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Get documents
    const documents = await req.db.all(
      `SELECT dd.*, u.name as uploader_name 
       FROM deal_documents dd 
       JOIN users u ON dd.uploader_id = u.id 
       WHERE dd.deal_id = ? 
       ORDER BY dd.uploaded_at DESC`,
      [dealId]
    );

    res.json(documents);
  } catch (error) {
    console.error('Documents fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Upload deal documents
app.post('/api/deals/:id/documents', 
  authenticateToken, 
  uploadLimiter,
  upload.array('documents', 10), 
  async (req, res) => {
    const dealId = parseInt(req.params.id);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    try {
      // Verify user has access to this deal
      const deal = await req.db.get(
        'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
        [dealId, req.user.id, req.user.id]
      );

      if (!deal) {
        // Clean up uploaded files
        for (const file of req.files) {
          await fs.unlink(file.path).catch(() => {});
        }
        return res.status(404).json({ error: 'Deal not found' });
      }

      const uploadedDocs = [];

      for (const file of req.files) {
        const result = await req.db.run(
          'INSERT INTO deal_documents (deal_id, uploader_id, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
          [dealId, req.user.id, file.originalname, file.path, file.size, file.mimetype]
        );

        uploadedDocs.push({
          id: result.lastID,
          file_name: file.originalname
        });
      }

      res.status(201).json({
        message: 'Documents uploaded successfully',
        documents: uploadedDocs
      });
    } catch (error) {
      // Clean up files on error
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
      
      console.error('Document upload error:', error);
      res.status(500).json({ error: 'Failed to upload documents' });
    }
  }
);

// Get document requests
app.get('/api/deals/:id/document-requests', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);

  try {
    // Verify user has access
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const requests = await req.db.all(
      `SELECT dr.*, u.name as requester_name 
       FROM document_requests dr 
       JOIN users u ON dr.requester_id = u.id 
       WHERE dr.deal_id = ? 
       ORDER BY dr.created_at DESC`,
      [dealId]
    );

    res.json(requests);
  } catch (error) {
    console.error('Document requests fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch document requests' });
  }
});

// Create document request
app.post('/api/deals/:id/document-requests', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);
  const { document_name, description } = req.body;

  if (!document_name || !document_name.trim()) {
    return res.status(400).json({ error: 'Document name is required' });
  }

  try {
    // Verify user has access
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const result = await req.db.run(
      'INSERT INTO document_requests (deal_id, requester_id, document_name, description) VALUES (?, ?, ?, ?)',
      [dealId, req.user.id, document_name.trim(), description]
    );

    // Notify the other party
    const recipientId = req.user.id === deal.borrower_id ? deal.funder_id : deal.borrower_id;
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [recipientId, 'document_request', `New document request: ${document_name}`, dealId]
    );

    res.status(201).json({
      message: 'Document request created successfully',
      request_id: result.lastID
    });
  } catch (error) {
    console.error('Document request creation error:', error);
    res.status(500).json({ error: 'Failed to create document request' });
  }
});

// Fulfill document request
app.put('/api/document-requests/:id/fulfill', authenticateToken, async (req, res) => {
  const requestId = parseInt(req.params.id);

  try {
    const result = await req.db.run(
      'UPDATE document_requests SET status = ?, fulfilled_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['fulfilled', requestId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ message: 'Request fulfilled' });
  } catch (error) {
    console.error('Request update error:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Get deal comments
app.get('/api/deals/:id/comments', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);

  try {
    // Verify user has access
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const comments = await req.db.all(
      `SELECT dc.*, u.name as user_name 
       FROM deal_comments dc 
       JOIN users u ON dc.user_id = u.id 
       WHERE dc.deal_id = ? 
       ORDER BY dc.created_at ASC`,
      [dealId]
    );

    res.json(comments);
  } catch (error) {
    console.error('Comments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add deal comment
app.post('/api/deals/:id/comments', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);
  const { comment } = req.body;

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  if (comment.length > 5000) {
    return res.status(400).json({ error: 'Comment too long (max 5000 characters)' });
  }

  try {
    // Verify user has access
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const result = await req.db.run(
      'INSERT INTO deal_comments (deal_id, user_id, comment) VALUES (?, ?, ?)',
      [dealId, req.user.id, comment.trim()]
    );

    // Notify the other party
    const recipientId = req.user.id === deal.borrower_id ? deal.funder_id : deal.borrower_id;
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [recipientId, 'comment', 'New comment in deal room', dealId]
    );

    res.status(201).json({
      message: 'Comment added successfully',
      comment_id: result.lastID
    });
  } catch (error) {
    console.error('Comment creation error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Get deal proposal
app.get('/api/deals/:id/proposal', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);

  try {
    // Verify user has access
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const proposal = await req.db.get(
      `SELECT iq.*, u.name as funder_name 
       FROM indicative_quotes iq
       JOIN users u ON iq.funder_id = u.id
       WHERE iq.deal_id = ? 
       ORDER BY iq.created_at DESC 
       LIMIT 1`,
      [dealId]
    );

    res.json(proposal);
  } catch (error) {
    console.error('Proposal fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

// Create proposal
app.post('/api/deals/:id/proposals', authenticateToken, requireRole(['funder']), async (req, res) => {
  const dealId = parseInt(req.params.id);
  const { loan_amount, interest_rate, loan_term, establishment_fee, other_fees, conditions } = req.body;

  // Validate required fields
  if (!loan_amount || !interest_rate || !loan_term) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Verify user owns this deal
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND funder_id = ?',
      [dealId, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14); // Valid for 14 days

    const result = await req.db.run(
      `INSERT INTO indicative_quotes 
       (deal_id, funder_id, loan_amount, interest_rate, loan_term, establishment_fee, other_fees, conditions, valid_until) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dealId, req.user.id, loan_amount, interest_rate, loan_term, establishment_fee || 0, other_fees, conditions, validUntil.toISOString()]
    );

    // Notify borrower
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [deal.borrower_id, 'offer', 'You have received a funding offer', dealId]
    );

    res.status(201).json({
      message: 'Proposal submitted successfully',
      proposal_id: result.lastID
    });
  } catch (error) {
    console.error('Proposal creation error:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// Respond to proposal
app.put('/api/proposals/:id/respond', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const proposalId = parseInt(req.params.id);
  const { response } = req.body;

  if (!['accept', 'decline', 'counter'].includes(response)) {
    return res.status(400).json({ error: 'Invalid response type' });
  }

  try {
    const proposal = await req.db.get(
      `SELECT iq.*, d.borrower_id, d.funder_id, d.id as deal_id
       FROM indicative_quotes iq
       JOIN deals d ON iq.deal_id = d.id
       WHERE iq.id = ? AND d.borrower_id = ?`,
      [proposalId, req.user.id]
    );

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const status = response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'countered';

    await req.db.run(
      'UPDATE indicative_quotes SET status = ? WHERE id = ?',
      [status, proposalId]
    );

    // Update deal status if accepted
    if (status === 'accepted') {
      await req.db.run(
        'UPDATE deals SET status = ? WHERE id = ?',
        ['accepted', proposal.deal_id]
      );
    }

    // Notify funder
    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [proposal.funder_id, 'offer_response', `Your offer has been ${status}`, proposal.deal_id]
    );

    res.json({ message: `Proposal ${status} successfully` });
  } catch (error) {
    console.error('Proposal response error:', error);
    res.status(500).json({ error: 'Failed to respond to proposal' });
  }
});

// ===========================
// API ROUTES - NOTIFICATIONS
// ===========================

// Get notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await req.db.all(
      `SELECT * FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );

    res.json(notifications);
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  const notificationId = parseInt(req.params.id);

  try {
    await req.db.run(
      'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, req.user.id]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Notification update error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Create notification (internal)
app.post('/api/deals/:id/notifications', authenticateToken, async (req, res) => {
  const dealId = parseInt(req.params.id);
  const { type, message } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: 'Type and message are required' });
  }

  try {
    const deal = await req.db.get(
      'SELECT * FROM deals WHERE id = ? AND (borrower_id = ? OR funder_id = ?)',
      [dealId, req.user.id, req.user.id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const recipientId = req.user.id === deal.borrower_id ? deal.funder_id : deal.borrower_id;

    await req.db.run(
      'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
      [recipientId, type, message, dealId]
    );

    res.json({ message: 'Notification sent' });
  } catch (error) {
    console.error('Notification creation error:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// Get notification preferences
app.get('/api/notifications/preferences', authenticateToken, async (req, res) => {
  // In a real implementation, this would fetch from a preferences table
  res.json({
    email_messages: true,
    email_access_requests: true,
    email_project_updates: true,
    email_newsletter: false
  });
});

// Update notification preferences
app.put('/api/notifications/preferences', authenticateToken, async (req, res) => {
  // In a real implementation, this would update a preferences table
  res.json({ message: 'Preferences updated successfully' });
});

// ===========================
// API ROUTES - AI CHAT
// ===========================

// Create AI chat session
app.post('/api/ai-chat/sessions', authenticateToken, async (req, res) => {
  const { project_id, session_title } = req.body;

  try {
    const result = await req.db.run(
      'INSERT INTO ai_chat_sessions (user_id, project_id, session_title) VALUES (?, ?, ?)',
      [req.user.id, project_id, session_title || `Chat ${new Date().toLocaleDateString()}`]
    );

    res.json({ 
      session_id: result.lastID,
      message: 'Chat session created successfully' 
    });
  } catch (error) {
    console.error('AI chat session creation error:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

// Get AI chat sessions
app.get('/api/ai-chat/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await req.db.all(
      'SELECT * FROM ai_chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json(sessions);
  } catch (error) {
    console.error('AI chat sessions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chat sessions' });
  }
});

// Get AI chat messages
app.get('/api/ai-chat/sessions/:id/messages', authenticateToken, async (req, res) => {
  const sessionId = parseInt(req.params.id);

  try {
    // Verify session ownership
    const session = await req.db.get(
      'SELECT * FROM ai_chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await req.db.all(
      'SELECT * FROM ai_chat_messages WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );

    res.json(messages);
  } catch (error) {
    console.error('AI chat messages fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send AI chat message
app.post('/api/ai-chat/sessions/:id/messages', authenticateToken, async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Verify session ownership
    const session = await req.db.get(
      'SELECT * FROM ai_chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Save user message
    const userMsgResult = await req.db.run(
      'INSERT INTO ai_chat_messages (session_id, message, sender) VALUES (?, ?, ?)',
      [sessionId, message.trim(), 'user']
    );

    // Generate AI response (placeholder - integrate with actual AI service)
    const aiResponse = await generateAIResponse(message, req.user.role);

    // Save AI response
    const aiMsgResult = await req.db.run(
      'INSERT INTO ai_chat_messages (session_id, message, sender) VALUES (?, ?, ?)',
      [sessionId, aiResponse, 'ai']
    );

    res.json({
      user_message_id: userMsgResult.lastID,
      ai_message_id: aiMsgResult.lastID,
      ai_response: aiResponse
    });
  } catch (error) {
    console.error('AI chat message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// AI response generator (placeholder)
async function generateAIResponse(message, userRole) {
  // In production, this would call OpenAI or another AI service
  const responses = {
    borrower: "I understand you're looking for guidance on your property development project. Based on your message, I can help you with feasibility analysis, funding strategies, and connecting with the right lenders. What specific aspect would you like to explore?",
    funder: "I can assist you in evaluating this investment opportunity. Let me help you analyze the project metrics, risk factors, and potential returns. What specific information are you looking for?",
    default: "I'm here to help with your property finance questions. Could you provide more details about what you'd like to know?"
  };

  return responses[userRole] || responses.default;
}

// ===========================
// API ROUTES - ADMIN
// ===========================

// Get all users
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const users = await req.db.all(
      `SELECT id, name, email, role, approved, verification_status, 
       subscription_status, company_name, company_type, created_at 
       FROM users ORDER BY created_at DESC`
    );

    res.json(users);
  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Approve user
app.put('/api/admin/users/:id/approve', authenticateToken, requireRole(['admin']), async (req, res) => {
  const userId = parseInt(req.params.id);

  try {
    await req.db.run(
      'UPDATE users SET approved = 1, verification_status = ? WHERE id = ?',
      ['verified', userId]
    );

    res.json({ message: 'User approved successfully' });
  } catch (error) {
    console.error('User approval error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Get admin stats
app.get('/api/admin/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const stats = {};
    
    // Get various statistics
    const queries = [
      { key: 'total_users', query: 'SELECT COUNT(*) as count FROM users' },
      { key: 'total_projects', query: 'SELECT COUNT(*) as count FROM projects' },
      { key: 'active_projects', query: 'SELECT COUNT(*) as count FROM projects WHERE payment_status = "paid"' },
      { key: 'pending_requests', query: 'SELECT COUNT(*) as count FROM access_requests WHERE status = "pending"' },
      { key: 'total_revenue', query: 'SELECT SUM(amount) as total FROM payments WHERE status = "completed"' }
    ];

    for (const { key, query } of queries) {
      const result = await req.db.get(query);
      stats[key] = result.count || result.total || 0;
    }

    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get system settings
app.get('/api/admin/system-settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const settings = await req.db.all(
      'SELECT * FROM system_settings ORDER BY setting_key'
    );

    res.json(settings);
  } catch (error) {
    console.error('System settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update system setting
app.put('/api/admin/system-settings/:key', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!value) {
    return res.status(400).json({ error: 'Value is required' });
  }

  try {
    const result = await req.db.run(
      'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      [value, key]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('System setting update error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ===========================
// API ROUTES - DATA EXPORT
// ===========================

// Export user data
app.get('/api/export/user-data', authenticateToken, async (req, res) => {
  try {
    const userData = await req.db.get(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );

    delete userData.stripe_customer_id; // Remove sensitive data
    
    res.json(userData);
  } catch (error) {
    console.error('User data export error:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

// Export projects
app.get('/api/export/projects', authenticateToken, async (req, res) => {
  try {
    let projects;
    
    if (req.user.role === 'borrower') {
      projects = await req.db.all(
        'SELECT * FROM projects WHERE borrower_id = ?',
        [req.user.id]
      );
    } else {
      return res.status(403).json({ error: 'Export not available for this role' });
    }

    res.json(projects);
  } catch (error) {
    console.error('Projects export error:', error);
    res.status(500).json({ error: 'Failed to export projects' });
  }
});

// ===========================
// API ROUTES - ACCOUNT MANAGEMENT
// ===========================

// Delete account
app.delete('/api/account/delete', authenticateToken, authLimiter, async (req, res) => {
  const { confirmation } = req.body;

  if (confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'Invalid confirmation' });
  }

  try {
    await req.db.run('BEGIN TRANSACTION');

    // Delete user data in correct order (respecting foreign keys)
    await req.db.run('DELETE FROM ai_chat_messages WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE user_id = ?)', [req.user.id]);
    await req.db.run('DELETE FROM ai_chat_sessions WHERE user_id = ?', [req.user.id]);
    await req.db.run('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
    await req.db.run('DELETE FROM deal_comments WHERE user_id = ?', [req.user.id]);
    await req.db.run('DELETE FROM deal_documents WHERE uploader_id = ?', [req.user.id]);
    await req.db.run('DELETE FROM document_requests WHERE requester_id = ?', [req.user.id]);
    await req.db.run('DELETE FROM messages WHERE sender_id = ?', [req.user.id]);
    await req.db.run('DELETE FROM payments WHERE user_id = ?', [req.user.id]);
    
    // Delete user's projects and related data
    if (req.user.role === 'borrower') {
      const projects = await req.db.all('SELECT id FROM projects WHERE borrower_id = ?', [req.user.id]);
      for (const project of projects) {
        await req.db.run('DELETE FROM documents WHERE project_id = ?', [project.id]);
        await req.db.run('DELETE FROM project_unit_mix WHERE project_id = ?', [project.id]);
      }
      await req.db.run('DELETE FROM projects WHERE borrower_id = ?', [req.user.id]);
    }
    
    // Delete the user
    await req.db.run('DELETE FROM users WHERE id = ?', [req.user.id]);
    
    // Delete from Clerk
    try {
      await clerkClient.users.deleteUser(req.user.clerk_user_id);
    } catch (clerkError) {
      console.error('Failed to delete from Clerk:', clerkError);
    }

    await req.db.run('COMMIT');
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    await req.db.run('ROLLBACK');
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ===========================
// UTILITY ROUTES
// ===========================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    environment: process.env.NODE_ENV
  });
});

// ===========================
// ERROR HANDLING
// ===========================

// Multer error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 10 files per upload.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  
  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({ error: error.message });
  }
  
  console.error('Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ===========================
// SERVER STARTUP
// ===========================
const startServer = async () => {
  try {
    // Ensure directories exist
    await ensureDirectories();
    
    // Initialize database
    await initializeDatabase();
    
    // Start server
    app.listen(PORT, () => {
      console.log('===================================');
      console.log('🚀 Tranch Backend Server v3.0.0');
      console.log('===================================');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🔐 Auth: Clerk`);
      console.log(`💾 Database: SQLite (${dbPath})`);
      console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅ Connected' : '❌ Not configured'}`);
      console.log(`🤖 AI Chat: ${process.env.OPENAI_API_KEY ? '✅ Connected' : '⚠️  Using mock responses'}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('===================================');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  db.close(() => {
    console.log('Database connection closed.');
    process.exit(0);
  });
});

// Start the server
startServer();

module.exports = app;