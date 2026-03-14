const Database = require('better-sqlite3');
const db = new Database('go.db');

// Crée la table users si elle n'existe pas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT    UNIQUE NOT NULL,
    password TEXT    NOT NULL,
    created_at TEXT  DEFAULT (datetime('now'))
  )
`);

module.exports = db;