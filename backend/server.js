require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_51RU7lrQupq5Lj3mgc39e2tMWCF1fsxJqfWlbo87bY1wEVd4r6IK9fAoVb1V62eibynYwtBak7HQPwu447pGxZH0J00APK2xLBk');
const rateLimit = require('express-rate-limit'); 
const aiChatRoutes = require('./routes/ai-chat');

// Clerk imports
const { clerkClient , verifyToken } = require('@clerk/clerk-sdk-node');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const { syncClerkUser, deleteClerkUser } = require('./clerk-webhook');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

const dbPath = process.env.NODE_ENV === 'production' 
  ? '/var/data/tranch.db'
  : './tranch.db';   

// Middleware
const helmet = require('helmet');
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tranch-platform.onrender.com', 'https://tranch.com.au', 'https://www.tranch.com.au']
    : 'http://localhost:3000',
  credentials: true
}));

  app.options('*', cors());


app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // More lenient in dev
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Database setup
const db = new sqlite3.Database(dbPath);

// Ensure the data directory exists (for production)
if (process.env.NODE_ENV === 'production') {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Initialize database tables (keeping existing schema)
db.serialize(() => {
  // Enhanced Users table with funder profile fields and Clerk ID
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
    verification_status TEXT DEFAULT 'pending',
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Keep all other table definitions exactly the same
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

  db.run(`CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default system settings
  db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES 
    ('project_listing_fee', '49900'),
    ('monthly_subscription_fee', '29900'),
    ('max_file_upload_size', '10485760'),
    ('ai_chat_enabled', 'true')`);
});

// File upload configuration (unchanged)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
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
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx|csv|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.includes('document') || file.mimetype.includes('spreadsheet');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only documents, images, and spreadsheets are allowed'));
    }
  }
});

// Replace your current authenticateToken with this:
const authenticateToken = async (req, res, next) => {
  try {
    // Get the token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // ClerkExpressRequireAuth expects the request to have specific properties
    // Let's use the Clerk SDK's verifyToken instead
    const { verifyToken } = require('@clerk/clerk-sdk-node');
    const token = authHeader.split(' ')[1];
    
    try {
      // Verify the token
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });
      
      const userId = payload.sub; // This is the Clerk user ID
      
      // Get user from database using Clerk ID
      db.get('SELECT * FROM users WHERE clerk_user_id = ?', [userId], async (err, user) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
          try {
            // User doesn't exist in our DB, sync from Clerk
            const clerkUser = await clerkClient.users.getUser(userId);
            
            // Create user in database
            db.run(
              'INSERT INTO users (clerk_user_id, name, email, role) VALUES (?, ?, ?, ?)',
              [clerkUser.id, clerkUser.fullName || clerkUser.firstName || 'User', 
               clerkUser.emailAddresses[0].emailAddress, 'pending'],
              function(err) {
                if (err) {
                  console.error('User creation error:', err);
                  return res.status(500).json({ error: 'Failed to create user' });
                }
                
                // Get the newly created user
                db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                  if (err || !newUser) {
                    return res.status(500).json({ error: 'Failed to retrieve user' });
                  }
                  req.user = newUser;
                  next();
                });
              }
            );
          } catch (syncError) {
            console.error('User sync error:', syncError);
            return res.status(500).json({ error: 'Failed to sync user' });
          }
        } else {
          req.user = user;
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

// Role-based access middleware (unchanged)
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Logging middleware (unchanged)
const logRequest = (req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - User: ${req.user?.id || 'Anonymous'}`);
  next();
};

// ================================
// CLERK WEBHOOK ENDPOINT
// ================================

// This must be before express.json() middleware
app.post('/api/webhooks/clerk', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify the webhook signature
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

    // Handle the webhook event
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

// ================================
// AUTH ROUTES (Modified for Clerk)
// ================================

// Get current user from Clerk session
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

// Update user role (for onboarding)
app.post('/api/auth/set-role', authenticateToken, async (req, res) => {
  const { role } = req.body;
  
  if (!['borrower', 'funder'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Update role in database
    db.run(
      'UPDATE users SET role = ?, approved = ?, verification_status = ? WHERE id = ?',
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

        res.json({ 
          message: 'Role updated successfully',
          role: role
        });
      }
    );
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Update user profile (for funder onboarding)
app.post('/api/auth/complete-profile', authenticateToken, async (req, res) => {
  const { 
    company_name, company_type, investment_focus,
    typical_deal_size_min, typical_deal_size_max,
    years_experience, aum, phone, linkedin, bio
  } = req.body;

  if (req.user.role !== 'funder') {
    return res.status(400).json({ error: 'Profile completion only for funders' });
  }

  db.run(
    `UPDATE users SET 
      company_name = ?, company_type = ?, investment_focus = ?,
      typical_deal_size_min = ?, typical_deal_size_max = ?,
      years_experience = ?, aum = ?, phone = ?, linkedin = ?, bio = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      company_name, company_type, investment_focus,
      typical_deal_size_min, typical_deal_size_max,
      years_experience, aum, phone, linkedin, bio,
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
// AI Chat Routes
// ================================
app.use('/api/ai-chat', aiChatRoutes);

// ================================
// USER PROFILE ROUTES (unchanged)
// ================================

app.get('/api/users/:id/profile', authenticateToken, (req, res) => {
  const userId = req.params.id;

  if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.get(`SELECT 
    id, name, email, role, approved, verification_status, created_at,
    company_name, company_type, investment_focus,
    typical_deal_size_min, typical_deal_size_max,
    years_experience, aum, phone, linkedin, bio
    FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
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

  try {
    const sql = `UPDATE users SET 
      name = ?, company_name = ?, company_type = ?, investment_focus = ?,
      typical_deal_size_min = ?, typical_deal_size_max = ?,
      years_experience = ?, aum = ?, phone = ?, linkedin = ?, bio = ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`;

    const params = [
      name, company_name, company_type, investment_focus,
      typical_deal_size_min, typical_deal_size_max,
      years_experience, aum, phone, linkedin, bio,
      userId
    ];

    db.run(sql, params, function(err) {
      if (err) {
        console.error('Profile update error:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      res.json({ message: 'Profile updated successfully' });
    });
  } catch (error) {
    console.error('Profile update server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================================
// ALL OTHER ROUTES REMAIN THE SAME
// ================================

// Project routes
app.post('/api/projects', authenticateToken, requireRole(['borrower']), (req, res) => {
  const {
    title, description, location, suburb, loan_amount, interest_rate, loan_term, 
    property_type, development_stage, total_project_cost, equity_contribution,
    land_value, construction_cost, expected_gdc, expected_profit,
    project_size_sqm, number_of_units, number_of_levels, car_spaces,
    zoning, planning_permit_status, expected_start_date, expected_completion_date
  } = req.body;

  if (!title || !location || !suburb || !loan_amount) {
    return res.status(400).json({ error: 'Required fields missing' });
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
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      req.user.id, title, description, location, suburb, loan_amount,
      interest_rate, loan_term, property_type, development_stage,
      total_project_cost, equity_contribution, land_value, construction_cost,
      expected_gdc, expected_profit, lvr, icr,
      project_size_sqm, number_of_units, number_of_levels, car_spaces,
      zoning, planning_permit_status, expected_start_date, expected_completion_date
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

app.get('/api/projects', authenticateToken, (req, res) => {
  let query;
  let params = [];

  if (req.user.role === 'admin') {
    query = `SELECT p.*, u.name as borrower_name, u.email as borrower_email 
             FROM projects p JOIN users u ON p.borrower_id = u.id
             ORDER BY p.created_at DESC`;
  } else if (req.user.role === 'borrower') {
    query = `SELECT * FROM projects WHERE borrower_id = ? ORDER BY created_at DESC`;
    params = [req.user.id];
  } else if (req.user.role === 'funder') {
    if (!req.user.approved) {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    
    db.get('SELECT subscription_status FROM users WHERE id = ?', [req.user.id], (err, userData) => {
      if (err || !userData || userData.subscription_status !== 'active') {
        return res.status(403).json({ error: 'Active subscription required' });
      }
      
      const query = `SELECT p.id, p.title, p.suburb, p.loan_amount, p.property_type, p.development_stage,
               p.visible, p.payment_status, p.created_at,
               CASE 
                 WHEN ar.status = 'approved' THEN p.description
                 ELSE NULL 
               END as description,
               CASE 
                 WHEN ar.status = 'approved' THEN p.location
                 ELSE NULL 
               END as location,
               CASE 
                 WHEN ar.status = 'approved' THEN p.interest_rate
                 ELSE NULL 
               END as interest_rate,
               ar.status as access_status
               FROM projects p 
               LEFT JOIN access_requests ar ON p.id = ar.project_id AND ar.funder_id = ?
               WHERE p.payment_status = 'paid' AND p.visible = TRUE
               ORDER BY p.created_at DESC`;
      
      db.all(query, [req.user.id], (err, projects) => {
        if (err) {
          console.error('Projects fetch error:', err);
          return res.status(500).json({ error: 'Failed to fetch projects' });
        }
        res.json(projects);
      });
    });
    
    return;
  }

  db.all(query, params, (err, projects) => {
    if (err) {
      console.error('Projects fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }
    res.json(projects);
  });
});

app.get('/api/projects/:id', authenticateToken, (req, res) => {
  const projectId = req.params.id;

  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (req.user.role === 'borrower' && project.borrower_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'funder') {
      if (!req.user.approved) {
        return res.status(403).json({ error: 'Account pending approval' });
      }
      
      db.get('SELECT status FROM access_requests WHERE project_id = ? AND funder_id = ?', 
        [projectId, req.user.id], (err, access) => {
          if (!access || access.status !== 'approved') {
            return res.status(403).json({ error: 'Access not granted' });
          }
          res.json(project);
        }
      );
      return;
    }

    res.json(project);
  });
});

app.put('/api/projects/:id', authenticateToken, requireRole(['borrower']), (req, res) => {
  const projectId = req.params.id;
  const updateFields = req.body;
  
  delete updateFields.id;
  delete updateFields.created_at;
  updateFields.updated_at = new Date().toISOString();

  const fields = Object.keys(updateFields);
  const values = Object.values(updateFields);
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

// Document Management Routes (unchanged)
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

app.post('/api/projects/:id/documents', authenticateToken, requireRole(['borrower']), upload.array('documents', 10), (req, res) => {
  const projectId = req.params.id;
  const { document_types } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  db.get('SELECT * FROM projects WHERE id = ? AND borrower_id = ?', [projectId, req.user.id], (err, project) => {
    if (err || !project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const documentPromises = req.files.map((file, index) => {
      return new Promise((resolve, reject) => {
        const documentType = document_types ? document_types[index] : 'other';
        
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
  });
});

app.get('/api/projects/:id/documents', authenticateToken, (req, res) => {
  const projectId = req.params.id;

  if (req.user.role === 'borrower') {
    db.get('SELECT id FROM projects WHERE id = ? AND borrower_id = ?', [projectId, req.user.id], (err, project) => {
      if (err || !project) {
        return res.status(403).json({ error: 'Access denied' });
      }
      fetchDocuments();
    });
  } else if (req.user.role === 'funder') {
    db.get('SELECT status FROM access_requests WHERE project_id = ? AND funder_id = ?', 
      [projectId, req.user.id], (err, access) => {
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
    db.all('SELECT * FROM documents WHERE project_id = ? ORDER BY uploaded_at DESC', [projectId], (err, documents) => {
      if (err) {
        console.error('Documents fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch documents' });
      }
      res.json(documents);
    });
  }
});

app.delete('/api/documents/:id', authenticateToken, requireRole(['borrower']), (req, res) => {
  const documentId = req.params.id;

  db.get('SELECT d.*, p.borrower_id FROM documents d JOIN projects p ON d.project_id = p.id WHERE d.id = ?', 
    [documentId], (err, document) => {
      if (err || !document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (document.borrower_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      fs.unlink(document.file_path, (fsErr) => {
        if (fsErr) {
          console.error('File deletion error:', fsErr);
        }
      });

      db.run('DELETE FROM documents WHERE id = ?', [documentId], (err) => {
        if (err) {
          console.error('Document deletion error:', err);
          return res.status(500).json({ error: 'Failed to delete document' });
        }

        checkDocumentCompleteness(document.project_id);
        
        res.json({ message: 'Document deleted successfully' });
      });
    });
});

function checkDocumentCompleteness(projectId) {
  db.all('SELECT DISTINCT document_type FROM documents WHERE project_id = ?', [projectId], (err, docs) => {
    if (err) return;
    
    const uploadedTypes = docs.map(doc => doc.document_type);
    const hasAllRequired = REQUIRED_DOCUMENT_TYPES.every(type => uploadedTypes.includes(type));
    
    db.run('UPDATE projects SET documents_complete = ? WHERE id = ?', [hasAllRequired, projectId]);
  });
}

// Access Request & Messaging Routes (unchanged)
app.post('/api/access-requests', authenticateToken, requireRole(['funder']), (req, res) => {
  const { project_id, initial_message } = req.body;

  if (!req.user.approved) {
    return res.status(403).json({ error: 'Account pending approval' });
  }

  db.get('SELECT * FROM access_requests WHERE project_id = ? AND funder_id = ?', 
    [project_id, req.user.id], (err, existing) => {
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
    });
});

app.get('/api/access-requests', authenticateToken, (req, res) => {
  let query, params;

  if (req.user.role === 'borrower') {
    query = `SELECT ar.*, p.title as project_title, 
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

// Messaging Routes (unchanged)
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

// AI Broker Chat Routes (unchanged)
app.post('/api/ai-chat/sessions', authenticateToken, (req, res) => {
  const { project_id, session_title } = req.body;

  db.run(
    'INSERT INTO ai_chat_sessions (user_id, project_id, session_title) VALUES (?, ?, ?)',
    [req.user.id, project_id || null, session_title || 'New Chat'],
    function(err) {
      if (err) {
        console.error('AI chat session creation error:', err);
        return res.status(500).json({ error: 'Failed to create chat session' });
      }
      res.status(201).json({
        session_id: this.lastID,
        message: 'Chat session created'
      });
    }
  );
});

app.get('/api/ai-chat/sessions', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM ai_chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, sessions) => {
      if (err) {
        console.error('AI chat sessions fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch chat sessions' });
      }
      res.json(sessions);
    }
  );
});

app.get('/api/ai-chat/sessions/:id/messages', authenticateToken, (req, res) => {
  const sessionId = req.params.id;

  db.get('SELECT user_id FROM ai_chat_sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.all(
      'SELECT * FROM ai_chat_messages WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId],
      (err, messages) => {
        if (err) {
          console.error('AI chat messages fetch error:', err);
          return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        res.json(messages);
      }
    );
  });
});

app.post('/api/ai-chat/sessions/:id/messages', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  db.get('SELECT user_id FROM ai_chat_sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.run(
      'INSERT INTO ai_chat_messages (session_id, message, sender) VALUES (?, ?, ?)',
      [sessionId, message.trim(), 'user'],
      function(err) {
        if (err) {
          console.error('AI chat message creation error:', err);
          return res.status(500).json({ error: 'Failed to save message' });
        }

        const aiResponse = generateBrokerAIResponse(message.trim(), req.user.role);

        db.run(
          'INSERT INTO ai_chat_messages (session_id, message, sender) VALUES (?, ?, ?)',
          [sessionId, aiResponse, 'ai'],
          function(err) {
            if (err) {
              console.error('AI response save error:', err);
              return res.status(500).json({ error: 'Failed to save AI response' });
            }

            res.json({
              user_message_id: this.lastID - 1,
              ai_message_id: this.lastID,
              ai_response: aiResponse
            });
          }
        );
      }
    );
  });
});

function generateBrokerAIResponse(message, userRole) {
  const responses = {
    borrower: [
      "For property development projects in Australia, typical interest rates range from 8-15% depending on the risk profile and LVR. What's your target LVR for this project?",
      "Development finance typically requires a feasibility study showing at least 20% profit margin. Have you completed your feasibility analysis?",
      "Most lenders require pre-sales of 60-80% for apartment developments. What's your pre-sales strategy?",
      "Construction loans usually require progress payments tied to building stages. Do you have a detailed construction timeline?",
      "For DA approval, expect 6-12 months depending on council and complexity. Have you engaged a town planner?"
    ],
    funder: [
      "When evaluating development projects, key metrics include LVR, ICR, developer experience, and market conditions. What's your investment criteria?",
      "Typical returns for development finance range from 12-18% depending on risk. What return profile are you targeting?",
      "Due diligence should include feasibility review, market analysis, developer track record, and legal structure. Do you have a DD checklist?",
      "Consider diversification across property types, locations, and development stages to manage portfolio risk.",
      "Exit strategies are crucial - will this be sell-down, refinance, or hold for rental yield?"
    ]
  };

  const userResponses = responses[userRole] || responses.borrower;
  return userResponses[Math.floor(Math.random() * userResponses.length)];
}

// Payment Routes (unchanged)
app.post('/api/payments/create-project-payment', authenticateToken, requireRole(['borrower']), async (req, res) => {
  try {
    const { project_id } = req.body;
    
    const amount = 49900; // $499 in cents

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud',
      metadata: {
        project_id,
        user_id: req.user.id,
        payment_type: 'project_listing'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    db.run(
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

app.post('/api/payments/simulate-subscription', authenticateToken, requireRole(['funder']), (req, res) => {
  db.run(
    'UPDATE users SET subscription_status = ? WHERE id = ?',
    ['active', req.user.id],
    function(err) {
      if (err) {
        console.error('Subscription update error:', err);
        return res.status(500).json({ error: 'Failed to update subscription' });
      }

      res.json({ 
        message: 'Subscription activated successfully',
        status: 'active'
      });
    }
  );
});

app.post('/api/payments/simulate-success', authenticateToken, requireRole(['borrower']), async (req, res) => {
  const { project_id, payment_intent_id } = req.body;

  console.log('Payment simulation started for project:', project_id);

  if (!project_id) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  try {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      db.run(
        'UPDATE projects SET payment_status = ?, visible = TRUE, stripe_payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND borrower_id = ?',
        ['paid', payment_intent_id || 'pi_demo_' + Date.now(), project_id, req.user.id],
        function(err) {
          if (err) {
            console.error('Project update error:', err);
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to update project' });
          }

          if (this.changes === 0) {
            db.run('ROLLBACK');
            return res.status(404).json({ error: 'Project not found' });
          }

          db.run(
            'INSERT INTO payments (user_id, project_id, stripe_payment_intent_id, amount, payment_type, status) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, project_id, payment_intent_id || 'pi_demo_' + Date.now(), 49900, 'project_listing', 'completed'],
            (paymentErr) => {
              if (paymentErr) {
                console.error('Payment record error:', paymentErr);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to create payment record' });
              }

              db.run('COMMIT');
              console.log('Payment simulation completed successfully');
              
              res.json({ 
                message: 'Project published successfully',
                project_id: project_id,
                status: 'paid'
              });
            }
          );
        }
      );
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

app.post('/api/payments/create-subscription', authenticateToken, requireRole(['funder']), async (req, res) => {
  try {
    const { payment_method_id } = req.body;
    
    let customerId = req.user.stripe_customer_id;
    
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
      
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', 
          [customerId, req.user.id], 
          (err) => err ? reject(err) : resolve()
        );
      });
    } else {
      await stripe.paymentMethods.attach(payment_method_id, {
        customer: customerId,
      });
      
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: payment_method_id,
        },
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: (process.env.STRIPE_FUNDER_MONTHLY_PRICE_ID || 'price_YOUR_ID').trim() }],
      payment_behavior: 'default_incomplete',
      payment_settings: { 
        save_default_payment_method: 'on_subscription' 
      },
      expand: ['latest_invoice.payment_intent'],
    });

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET subscription_status = ? WHERE id = ?', 
          ['active', req.user.id], 
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    const response = {
      subscription_id: subscription.id,
      status: subscription.status
    };

    if (subscription.latest_invoice && 
        subscription.latest_invoice.payment_intent && 
        subscription.latest_invoice.payment_intent.client_secret) {
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

// Admin Routes (unchanged)
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all(`SELECT id, name, email, role, approved, verification_status, 
          subscription_status, company_name, company_type, created_at 
          FROM users ORDER BY created_at DESC`, (err, users) => {
    if (err) {
      console.error('Admin users fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
    res.json(users);
  });
});

app.put('/api/admin/users/:id/approve', authenticateToken, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;

  db.run('UPDATE users SET approved = TRUE, verification_status = ? WHERE id = ?', 
    ['verified', userId], (err) => {
      if (err) {
        console.error('User approval error:', err);
        return res.status(500).json({ error: 'Failed to approve user' });
      }
      res.json({ message: 'User approved successfully' });
    });
});

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

app.get('/api/admin/system-settings', authenticateToken, requireRole(['admin']), (req, res) => {
  db.all('SELECT * FROM system_settings ORDER BY setting_key', (err, settings) => {
    if (err) {
      console.error('System settings fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
    res.json(settings);
  });
});

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

// Utility Routes (unchanged)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

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

// Stripe Webhooks (unchanged)
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      if (paymentIntent.metadata.payment_type === 'project_listing') {
        db.run(
          'UPDATE projects SET payment_status = ?, visible = TRUE, stripe_payment_intent_id = ? WHERE id = ?',
          ['paid', paymentIntent.id, paymentIntent.metadata.project_id]
        );
        
        db.run(
          'UPDATE payments SET status = ? WHERE stripe_payment_intent_id = ?',
          ['completed', paymentIntent.id]
        );
      }
      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      if (invoice.subscription) {
        db.get('SELECT * FROM users WHERE stripe_customer_id = ?', [invoice.customer], (err, user) => {
          if (user) {
            db.run('UPDATE users SET subscription_status = ? WHERE id = ?', ['active', user.id]);
          }
        });
      }
      break;

    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      db.get('SELECT * FROM users WHERE stripe_customer_id = ?', [subscription.customer], (err, user) => {
        if (user) {
          db.run('UPDATE users SET subscription_status = ? WHERE id = ?', ['cancelled', user.id]);
        }
      });
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Error Handling Middleware (unchanged)
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 10 files per upload.' });
    }
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Server Startup
app.listen(PORT, () => {
  console.log(`🚀 Tranch Backend Server v2.1 running on port ${PORT}`);
  console.log(`🔐 Authentication: Clerk (JWT removed)`);
  console.log(`📊 Database: SQLite (${dbPath})`);
  console.log(`💳 Stripe integration ready`);
  console.log(`📁 File uploads: ./uploads/ (max 50MB)`);
  console.log(`🤖 AI Chat: BrokerAI enabled`);
  console.log(`📈 Features: Enhanced projects, messaging, documents, admin panel`);
  console.log(`🛡️  Security: Clerk auth, role-based access, input validation`);
});

module.exports = app;