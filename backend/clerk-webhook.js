const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database configuration
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/var/data/tranch.db'
  : './tranch.db';

const db = new sqlite3.Database(dbPath);

// Sync Clerk user with our database
async function syncClerkUser(clerkUser) {
  return new Promise((resolve, reject) => {
    const { id, email_addresses, first_name, last_name, public_metadata } = clerkUser;
    
    // Get primary email
    const email = email_addresses.find(e => e.id === clerkUser.primary_email_address_id)?.email_address;
    if (!email) {
      return reject(new Error('No email found'));
    }

    // Combine first and last name
    const name = `${first_name || ''} ${last_name || ''}`.trim() || email.split('@')[0];
    
    // Get role from metadata or default to 'borrower'
    const role = public_metadata?.role || 'borrower';
    
    // Check if user exists
    db.get('SELECT id, role FROM users WHERE email = ?', [email], (err, existingUser) => {
      if (err) {
        return reject(err);
      }

      if (existingUser) {
        // Update existing user
        db.run(
          `UPDATE users SET 
            name = ?, 
            clerk_user_id = ?,
            updated_at = CURRENT_TIMESTAMP 
          WHERE email = ?`,
          [name, id, email],
          (err) => {
            if (err) reject(err);
            else resolve({ id: existingUser.id, email, role: existingUser.role });
          }
        );
      } else {
        // Create new user
        db.run(
          `INSERT INTO users (
            clerk_user_id, name, email, role, approved, 
            verification_status, subscription_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            id,
            name,
            email,
            role,
            role === 'borrower' ? 1 : 0, // Auto-approve borrowers
            role === 'borrower' ? 'verified' : 'pending',
            'inactive'
          ],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, email, role });
          }
        );
      }
    });
  });
}

// Delete user from our database
async function deleteClerkUser(clerkUserId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE clerk_user_id = ?', [clerkUserId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Update user metadata from our database to Clerk (for role changes, etc.)
async function updateClerkMetadata(userId, metadata) {
  const { clerkClient } = require('@clerk/clerk-sdk-node');
  
  try {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: metadata
    });
  } catch (error) {
    console.error('Failed to update Clerk metadata:', error);
  }
}

module.exports = {
  syncClerkUser,
  deleteClerkUser,
  updateClerkMetadata
};