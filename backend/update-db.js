const sqlite3 = require('sqlite3').verbose();

// Open database
const db = new sqlite3.Database('./tranch.db');

console.log('Updating database schema for Clerk...');

db.serialize(() => {
  // First, let's check what columns already exist
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) {
      console.error('Error checking table:', err);
      return;
    }
    
    const columnNames = columns.map(col => col.name);
    console.log('Current columns:', columnNames);
    
    // Add clerk_user_id if it doesn't exist (without UNIQUE for now)
    if (!columnNames.includes('clerk_user_id')) {
      db.run(`ALTER TABLE users ADD COLUMN clerk_user_id TEXT`, (err) => {
        if (err) {
          console.error('Error adding clerk_user_id:', err);
        } else {
          console.log('✓ Added clerk_user_id column');
          
          // Now create an index to make it unique
          db.run(`CREATE UNIQUE INDEX idx_clerk_user_id ON users(clerk_user_id)`, (err) => {
            if (err && !err.message.includes('already exists')) {
              console.error('Error creating index:', err);
            } else {
              console.log('✓ Created unique index on clerk_user_id');
            }
          });
        }
      });
    } else {
      console.log('✓ clerk_user_id column already exists');
    }
    
    // Add updated_at if it doesn't exist
    if (!columnNames.includes('updated_at')) {
      db.run(`ALTER TABLE users ADD COLUMN updated_at DATETIME`, (err) => {
        if (err) {
          console.error('Error adding updated_at:', err);
        } else {
          console.log('✓ Added updated_at column');
        }
      });
    } else {
      console.log('✓ updated_at column already exists');
    }
  });
});

// Close database after a delay to ensure operations complete
setTimeout(() => {
  db.close(() => {
    console.log('Database update complete!');
  });
}, 2000);