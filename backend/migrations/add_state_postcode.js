const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = process.env.DATABASE_URL || path.join(__dirname, '..', 'tranch.db');

console.log('Starting migration: Adding state and postcode columns to projects table');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

// Check if columns already exist
db.all("PRAGMA table_info(projects)", (err, columns) => {
  if (err) {
    console.error('Error checking table info:', err);
    db.close();
    process.exit(1);
  }

  const hasCity = columns.some(col => col.name === 'city');
  const hasState = columns.some(col => col.name === 'state');
  const hasPostcode = columns.some(col => col.name === 'postcode');

  if (hasCity && hasState && hasPostcode) {
    console.log('Columns already exist, skipping migration');
    db.close();
    process.exit(0);
  }

  // Add columns if they don't exist
  const migrations = [];
  
  if (!hasCity) {
    migrations.push(new Promise((resolve, reject) => {
      db.run('ALTER TABLE projects ADD COLUMN city TEXT', (err) => {
        if (err) reject(err);
        else {
          console.log('Added city column');
          resolve();
        }
      });
    }));
  }
  
  if (!hasState) {
    migrations.push(new Promise((resolve, reject) => {
      db.run('ALTER TABLE projects ADD COLUMN state TEXT', (err) => {
        if (err) reject(err);
        else {
          console.log('Added state column');
          resolve();
        }
      });
    }));
  }

  if (!hasPostcode) {
    migrations.push(new Promise((resolve, reject) => {
      db.run('ALTER TABLE projects ADD COLUMN postcode TEXT', (err) => {
        if (err) reject(err);
        else {
          console.log('Added postcode column');
          resolve();
        }
      });
    }));
  }

  Promise.all(migrations)
    .then(() => {
      console.log('Migration completed successfully');
      db.close();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      db.close();
      process.exit(1);
    });
});