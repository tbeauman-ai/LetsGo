require('dotenv').config();
const express    = require('express');
const path       = require('path');
const bcrypt     = require('bcrypt');
const http       = require('http');
const { Server } = require('socket.io');
const db         = require('./database');
const GoLogic    = require('./goLogic');
const tablesize       = 13;
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const SALT  = 12;
const rooms = {}; // { code: { joueur1, joueur2, logic: GoLogic } }

app.use(express.static('public'));
app.use(express.json());

// ── Pages ─────────────────────────────────────────────────────
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/game',     (req, res) => res.sendFile(path.join(__dirname, 'views', 'game.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));

// ── API : inscription ──────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password, captchaToken } = req.body;

  if (!username || !password) return res.json({ success: false, message: 'Champs manquants.' });
  if (username.length < 3)    return res.json({ success: false, message: 'Pseudo trop court (3 caractères min).' });
  if (password.length < 6)    return res.json({ success: false, message: 'Mot de passe trop court (6 caractères min).' });

  const captchaRes  = await fetch('https://hcaptcha.com/siteverify', {
    method  : 'POST',
    headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
    body    : `secret=${process.env.HCAPTCHA_SECRET}&response=${captchaToken}`
  });
  const captchaData = await captchaRes.json();
  if (!captchaData.success) return res.json({ success: false, message: 'Captcha invalide.' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.json({ success: false, message: 'Ce pseudo est déjà pris.' });

  const hashed = await bcrypt.hash(password, SALT);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
  res.json({ success: true });
});

// ── API : connexion ────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.json({ success: false, message: 'Champs manquants.' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user)  return res.json({ success: false, message: 'Pseudo ou mot de passe incorrect.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success: false, message: 'Pseudo ou mot de passe incorrect.' });

  res.json({ success: true, username: user.username });
});

// ── Socket.io ──────────────────────────────────────────────────
function genererCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {

  // Joueur 1 crée une partie
  socket.on('creer-partie', (username) => {
    let code = genererCode();
    while (rooms[code]) code = genererCode();

    rooms[code] = {
      joueur1 : { id: socket.id, username },
      joueur2 : null,
      logic   : new GoLogic(tablesize), // le serveur est la source de vérité
    };

    socket.join(code);
    socket.emit('partie-creee', { code });
    console.log(`Partie créée : ${code} par ${username}`);
  });

  // Joueur 2 rejoint une partie
  socket.on('rejoindre-partie', ({ code, username }) => {
    const room = rooms[code];
    if (!room)        return socket.emit('erreur-rejoindre', 'Code invalide.');
    if (room.joueur2) return socket.emit('erreur-rejoindre', 'La partie est déjà pleine.');

    room.joueur2 = { id: socket.id, username };
    socket.join(code);

    io.to(code).emit('partie-commence', {
      joueur1 : room.joueur1.username,
      joueur2 : room.joueur2.username,
      code,
    });
    console.log(`Partie ${code} : ${room.joueur1.username} vs ${room.joueur2.username}`);
  });

  // Un joueur demande l'état actuel (rechargement de page)
  socket.on('demander-etat', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    socket.join(code);
    socket.emit('etat-partie', room.logic.getState());
  });

  // Un joueur pose une pierre — le serveur valide
  socket.on('jouer-coup', ({ code, row, col }) => {
    const room = rooms[code];
    if (!room) return;

    // Vérifie que c'est bien le tour de ce joueur
    const { logic, joueur1, joueur2 } = room;
    const isJoueur1 = socket.id === joueur1.id;
    const isJoueur2 = joueur2 && socket.id === joueur2.id;

    if ((logic.currentPlayer === 1 && !isJoueur1) ||
        (logic.currentPlayer === 2 && !isJoueur2)) {
      return socket.emit('coup-invalide', { reason: "Ce n'est pas ton tour." });
    }

    const result = logic.play(row, col);

    if (!result.ok) {
      return socket.emit('coup-invalide', { reason: result.reason });
    }

    // Broadcast le nouvel état aux deux joueurs
    io.to(code).emit('etat-mise-a-jour', result.state);
    console.log(`Coup joué room=${code} row=${row} col=${col}`);
  });

  // Un joueur passe son tour
  socket.on('passer', ({ code }) => {
    const room = rooms[code];
    if (!room) return;

    const { logic, joueur1, joueur2 } = room;
    const isJoueur1 = socket.id === joueur1.id;
    const isJoueur2 = joueur2 && socket.id === joueur2.id;

    if ((logic.currentPlayer === 1 && !isJoueur1) ||
        (logic.currentPlayer === 2 && !isJoueur2)) {
      return socket.emit('coup-invalide', { reason: "Ce n'est pas ton tour." });
    }

    const result = logic.pass();

    // Prévient l'adversaire
    socket.to(code).emit('adversaire-passe');

    if (result.fini) {
      io.to(code).emit('partie-terminee');
      delete rooms[code];
    } else {
      io.to(code).emit('etat-mise-a-jour', result.state);
    }
  });

  // Nettoyage à la déconnexion
// Dans server.js — remplace le handler disconnect
socket.on('disconnect', () => {
  for (const code in rooms) {
    const room = rooms[code];
    const estJoueur1 = room.joueur1?.id === socket.id;
    const estJoueur2 = room.joueur2?.id === socket.id;

    if (estJoueur1 || estJoueur2) {
      console.log(`Joueur déconnecté de la partie ${code} — attente reconnexion...`);

      // Donne 10 secondes au joueur pour se reconnecter
      room.timeoutSuppr = setTimeout(() => {
        if (rooms[code]) {
          io.to(code).emit('adversaire-deconnecte');
          delete rooms[code];
          console.log(`Partie ${code} supprimée (timeout reconnexion)`);
        }
      }, 1000000000);
    }
  }
});

// Dans server.js — demander-etat complet
socket.on('demander-etat', ({ code, username }) => {
  const room = rooms[code];
  if (!room) return;

  // Annule le timeout de suppression
  if (room.timeoutSuppr) {
    clearTimeout(room.timeoutSuppr);
    room.timeoutSuppr = null;
    console.log(`Joueur reconnecté à la partie ${code}`);
  }

  // Met à jour le socket id du joueur reconnecté
  if (room.joueur1?.username === username) room.joueur1.id = socket.id;
  if (room.joueur2?.username === username) room.joueur2.id = socket.id;

  socket.join(code);
  socket.emit('etat-partie', room.logic.getState());
});


});

server.listen(process.env.PORT || 3000, () =>
  console.log(`Serveur sur http://localhost:${process.env.PORT || 3000}`)
);
