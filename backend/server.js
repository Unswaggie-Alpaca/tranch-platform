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
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tranch-platform.onrender.com', 'https://tranch.com.au', 'https://www.tranch.com.au']
    : 'http://localhost:3000',
  credentials: true
}));

app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});
app.use('/api/', limiter);

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
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// ===========================
// FILE UPLOAD CONFIGURATION
// ===========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${file.fieldname}-${uniqueSuffix}-${sanitizedName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx|csv|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype.includes('document') || 
                     file.mimetype.includes('spreadsheet');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only documents, images, and spreadsheets are allowed'));
    }
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
          
          await executeDbOperation(async () => {
            return new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Update project to payment_pending state (NOT visible)
                db.run(
                  'UPDATE projects SET payment_status = ?, visible = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status != ?',
                  ['payment_pending', projectId, 'payment_pending'],
                  function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    db.run(
                      'UPDATE payments SET status = ? WHERE stripe_payment_intent_id = ?',
                      ['completed', paymentIntent.id],
                      function(err2) {
                        if (err2) {
                          db.run('ROLLBACK');
                          reject(err2);
                          return;
                        }
                        
                        db.run('COMMIT');
                        console.log('Transaction committed successfully');
                        
                        // Get project and admin details for notification
                        db.get(
                          `SELECT p.*, u.name as borrower_name, u.email as borrower_email 
                           FROM projects p 
                           JOIN users u ON p.borrower_id = u.id 
                           WHERE p.id = ?`,
                          [projectId],
                          (err, project) => {
                            if (!err && project) {
                              // Send notifications to all admin users
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
app.post('/api/auth/set-role', authenticateToken, async (req, res) => {
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

  if (req.user.role !== 'funder') {
    return res.status(400).json({ error: 'Profile completion only for funders' });
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
    title, description, location, suburb, loan_amount, interest_rate, loan_term, 
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
      borrower_id, title, description, location, suburb, loan_amount, 
      interest_rate, loan_term, property_type, development_stage,
      total_project_cost, equity_contribution, land_value, construction_cost,
      expected_gdc, expected_profit, lvr, icr,
      project_size_sqm, number_of_units, number_of_levels, car_spaces,
      zoning, planning_permit_status, expected_start_date, expected_completion_date,
      market_risk_rating, construction_risk_rating, location_risk_rating
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id, title, description, location, suburb, loan_amount,
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
        return res.status(500).json({ error: 'Failed to create project' });
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
      res.json(projects);
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
        res.json(projects);
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
  const placeholders = fields.map(field => `${field} = ?`).join(', ');

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
app.post('/api/projects/:id/documents', authenticateToken, requireRole(['borrower']), upload.array('documents', 10), (req, res) => {
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
    'SELECT * FROM access_requests WHERE project_id = ? AND funder_id = ?', 
    [project_id, req.user.id], 
    (err, existing) => {
      if (existing) {
        return res.status(400).json({ error: 'Access request already exists' });
      }

      db.run(
        'INSERT INTO access_requests (project_id, funder_id, initial_message) VALUES (?, ?, ?)',
        [project_id, req.user.id, initial_message],
        function(err) {
          if (err) {
            console.error('Access request creation error:', err);
            return res.status(500).json({ error: 'Failed to create access request' });
          }
          res.status(201).json({ 
            message: 'Access request submitted',
            request_id: this.lastID
          });
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
        'UPDATE access_requests SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['approved', requestId],
        (err) => {
          if (err) {
            console.error('Access request approval error:', err);
            return res.status(500).json({ error: 'Failed to approve request' });
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

app.post('/api/payments/create-project-payment', authenticateToken, requireRole(['borrower']), async (req, res) => {
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

app.post('/api/payments/create-subscription', authenticateToken, requireRole(['funder']), async (req, res) => {
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

  db.run(
    'UPDATE users SET approved = TRUE, verification_status = ? WHERE id = ?', 
    ['verified', userId], 
    (err) => {
      if (err) {
        console.error('User approval error:', err);
        return res.status(500).json({ error: 'Failed to approve user' });
      }
      res.json({ message: 'User approved successfully' });
    }
  );
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
      res.json(projects);
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
    console.error('Email notification error:', error);
    res.status(500).json({ error: 'Failed to send email notification' });
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
      `SELECT ar.*, p.borrower_id, p.title as project_title, u.name as funder_name
       FROM access_requests ar
       JOIN projects p ON ar.project_id = p.id
       JOIN users u ON ar.funder_id = u.id
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

        // Check if deal already exists for this funder and project
        db.get(
          'SELECT id FROM deals WHERE project_id = ? AND funder_id = ? AND status != "declined"',
          [project_id, accessRequest.funder_id],
          (err, existingDeal) => {
            if (err) {
              console.error('Deal check error:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Database error' });
            }

            // Create the deal - each funder gets their own deal room
            const dealId = generateId();
            db.run(
              `INSERT INTO deals (
                id, project_id, borrower_id, funder_id, 
                access_request_id, status, created_at
              ) VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`,
              [dealId, project_id, accessRequest.borrower_id, accessRequest.funder_id, access_request_id],
              function(err) {
                if (err) {
                  console.error('Deal creation error:', err);
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Failed to create deal' });
                }

                // Create notification for borrower
                db.run(
                  'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
                  [
                    accessRequest.borrower_id, 
                    'deal_created', 
                    `${accessRequest.funder_name} has created a deal room for: ${accessRequest.project_title}`, 
                    dealId
                  ],
                  (notifErr) => {
                    if (notifErr) console.error('Notification error:', notifErr);
                  }
                );
                
                db.run('COMMIT');
                res.status(201).json({ 
                  message: 'Deal created successfully',
                  deal_id: dealId 
                });
              }
            );
          }
        );
      }
    );
  });
});

// Add this new endpoint to get all deals for a project (for borrowers):
app.get('/api/projects/:projectId/deals', authenticateToken, (req, res) => {
  const { projectId } = req.params;
  
  // First verify the user has access to this project
  db.get(
    'SELECT * FROM projects WHERE id = ? AND (borrower_id = ? OR id IN (SELECT project_id FROM deals WHERE funder_id = ?))',
    [projectId, req.user.id, req.user.id],
    (err, project) => {
      if (err || !project) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }
      
      // Get all deals for this project
      db.all(
        `SELECT d.*, 
         ub.name as borrower_name, ub.company_name as borrower_company,
         uf.name as funder_name, uf.company_name as funder_company
         FROM deals d
         JOIN users ub ON d.borrower_id = ub.id
         JOIN users uf ON d.funder_id = uf.id
         WHERE d.project_id = ? 
         AND (d.borrower_id = ? OR d.funder_id = ?)
         ORDER BY d.created_at DESC`,
        [projectId, req.user.id, req.user.id],
        (err, deals) => {
          if (err) {
            console.error('Deals fetch error:', err);
            return res.status(500).json({ error: 'Failed to fetch deals' });
          }
          res.json(deals || []);
        }
      );
    }
  );
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
            'INSERT INTO deal_documents (deal_id, uploader_id, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
            [dealId, req.user.id, file.originalname, file.path, file.size, file.mimetype],
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

          res.status(201).json({
            message: 'Quote submitted successfully',
            quote_id: this.lastID
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
            'UPDATE projects SET status = ? WHERE id = ?',
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
    return res.status(400).json({ error: 'Missing required fields' });
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
          db.run(
            'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
            [deal.borrower_id, 'offer', 'You have received a funding offer', dealId]
          );

          res.status(201).json({
            message: 'Proposal submitted successfully',
            proposal_id: this.lastID
          });
        }
      );
    }
  );
});

// Respond to proposal
app.put('/api/proposals/:id/respond', authenticateToken, requireRole(['borrower']), (req, res) => {
  const proposalId = req.params.id;
  const { response } = req.body;

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

          // Create notification for funder
          db.run(
            'INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)',
            [proposal.funder_id, 'offer_response', `Your offer has been ${status}`, proposal.deal_id]
          );

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

// Get notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
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


module.exports = app;