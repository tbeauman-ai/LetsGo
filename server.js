const express  = require('express');
const path     = require('path');
const bcrypt   = require('bcrypt');
const db       = require('./database'); 

const app  = express();
const SALT = 12; // plus le chiffre est élevé, plus c'est sécurisé (mais lent)

const fetch = require('node-fetch'); // npm install node-fetch@2

// Dans /api/register, avant d'insérer en base :
const captchaRes  = await fetch('https://hcaptcha.com/siteverify', {
  method  : 'POST',
  headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
  body    : `=&response=${captchaToken}`
});
const captchaData = await captchaRes.json();
if (!captchaData.success) {
  return res.json({ success: false, message: 'Captcha invalide.' });
}

app.use(express.static('public'));
app.use(express.json()); // pour lire le JSON des requêtes POST

// ── Pages ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'game.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

// ── API : inscription ─────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: 'Champs manquants.' });
  }
  if (username.length < 3) {
    return res.json({ success: false, message: 'Pseudo trop court (3 caractères min).' });
  }
  if (password.length < 6) {
    return res.json({ success: false, message: 'Mot de passe trop court (6 caractères min).' });
  }

  // Vérifie si le pseudo existe déjà
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.json({ success: false, message: 'Ce pseudo est déjà pris.' });
  }

  const hashed = await bcrypt.hash(password, SALT);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);

  res.json({ success: true });
});

// ── API : connexion ───────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: 'Champs manquants.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.json({ success: false, message: 'Pseudo ou mot de passe incorrect.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.json({ success: false, message: 'Pseudo ou mot de passe incorrect.' });
  }

  res.json({ success: true, username: user.username });
});

// ── Démarrage ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur http://localhost:${PORT}`));
