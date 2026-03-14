// ============================================================
//  goLogic.js — Logique pure du jeu de Go (sans canvas)
//  Utilisé côté serveur (require) ET côté client (script src)
// ============================================================

class GoLogic {
  constructor(size) {
    this.SIZE = size;
    this.reset();
  }

  reset() {
    this.board         = Array.from({ length: this.SIZE }, () => Array(this.SIZE).fill(0));
    this.currentPlayer = 1;      // 1 = Noir, 2 = Blanc
    this.captures      = [0, 0]; // [captures de noir, captures de blanc]
    this.lastBoard     = null;
    this.passConsecutifs = 0;
  }

  // Retourne l'état complet (pour l'envoyer via socket)
  getState() {
    return {
      board          : this.board.map(r => [...r]),
      currentPlayer  : this.currentPlayer,
      captures       : [...this.captures],
      passConsecutifs: this.passConsecutifs,
    };
  }

  // Charge un état reçu depuis le serveur
  loadState({ board, currentPlayer, captures, passConsecutifs }) {
    this.board           = board.map(r => [...r]);
    this.currentPlayer   = currentPlayer;
    this.captures        = [...captures];
    this.passConsecutifs = passConsecutifs || 0;
  }

  // Pose une pierre — retourne { ok, state, reason }
  play(row, col) {
    if (row < 0 || row >= this.SIZE || col < 0 || col >= this.SIZE)
      return { ok: false, reason: 'Hors du plateau.' };
    if (this.board[row][col] !== 0)
      return { ok: false, reason: 'Case déjà occupée.' };

    const prev     = this.board.map(r => [...r]);
    const opponent = this.currentPlayer === 1 ? 2 : 1;

    this.board[row][col] = this.currentPlayer;

    const captured = this._removeCaptures(opponent);

    // Coup suicidaire
    const { liberties } = this._getGroup(row, col, this.currentPlayer);
    if (liberties.size === 0 && captured === 0) {
      this.board = prev;
      return { ok: false, reason: 'Coup suicidaire.' };
    }

    // Règle du Ko
    if (this.lastBoard && JSON.stringify(this.board) === JSON.stringify(this.lastBoard)) {
      this.board = prev;
      return { ok: false, reason: 'Règle du Ko.' };
    }

    this.lastBoard = prev;
    this.captures[this.currentPlayer - 1] += captured;
    this.currentPlayer   = opponent;
    this.passConsecutifs = 0;

    return { ok: true, state: this.getState() };
  }

  // Passe le tour — retourne { ok, state, fini }
  pass() {
    this.lastBoard = this.board.map(r => [...r]);
    this.currentPlayer   = this.currentPlayer === 1 ? 2 : 1;
    this.passConsecutifs = (this.passConsecutifs || 0) + 1;

    const fini = this.passConsecutifs >= 2;
    return { ok: true, fini, state: this.getState() };
  }

  // ----------------------------------------------------------
  //  Logique interne
  // ----------------------------------------------------------

  _getGroup(r, c, color, visited = new Set()) {
    const key = `${r},${c}`;
    if (visited.has(key)) return { stones: new Set(), liberties: new Set() };
    visited.add(key);

    const stones    = new Set([key]);
    const liberties = new Set();

    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= this.SIZE || nc < 0 || nc >= this.SIZE) continue;
      const nk = `${nr},${nc}`;
      if (this.board[nr][nc] === 0) {
        liberties.add(nk);
      } else if (this.board[nr][nc] === color && !visited.has(nk)) {
        const sub = this._getGroup(nr, nc, color, visited);
        sub.stones.forEach(s    => stones.add(s));
        sub.liberties.forEach(l => liberties.add(l));
      }
    }

    return { stones, liberties };
  }

  _removeCaptures(opponent) {
    let removed = 0;
    const checked = new Set();

    for (let r = 0; r < this.SIZE; r++) {
      for (let c = 0; c < this.SIZE; c++) {
        if (this.board[r][c] !== opponent) continue;
        const key = `${r},${c}`;
        if (checked.has(key)) continue;

        const { stones, liberties } = this._getGroup(r, c, opponent);
        stones.forEach(s => checked.add(s));

        if (liberties.size === 0) {
          stones.forEach(s => {
            const [sr, sc] = s.split(',').map(Number);
            this.board[sr][sc] = 0;
            removed++;
          });
        }
      }
    }

    return removed;
  }
}

// Compatible Node.js (require) et navigateur (script src)
if (typeof module !== 'undefined') module.exports = GoLogic;
