const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

console.log('Creating AI chat tables...');

db.serialize(() => {
  // Create ai_chat_sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      session_title VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `, (err) => {
    if (err) console.error('Error creating ai_chat_sessions:', err);
    else console.log('✓ Created ai_chat_sessions table');
  });

  // Create ai_chat_messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'ai')),
      message TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id)
    )
  `, (err) => {
    if (err) console.error('Error creating ai_chat_messages:', err);
    else console.log('✓ Created ai_chat_messages table');
  });
});

// Close the database connection
setTimeout(() => {
  db.close((err) => {
    if (err) console.error(err);
    else console.log('✓ Database migration complete!');
  });
}, 1000);