// ============================================================
//  gotable.js — Plateau de Go 19x19
//  Usage : <canvas id="goCanvas"></canvas>
//          <script src="gotable.js"></script>
//          const go = new GoTable('goCanvas');
// ============================================================

class GoTable {
  constructor(canvasId) {
    this.SIZE    = 19;
    this.CELL    = 30;
    this.PAD     = 30;

    this.canvas  = document.getElementById(canvasId);
    this.ctx     = this.canvas.getContext('2d');

    const dim = this.PAD * 2 + this.CELL * (this.SIZE - 1);
    this.canvas.width  = dim;
    this.canvas.height = dim;

    // Points de repère (hoshi) : [ligne, colonne]
    this.HOSHI = [
      [3,3],[3,9],[3,15],
      [9,3],[9,9],[9,15],
      [15,3],[15,9],[15,15]
    ];

    this.reset();

    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }

  // ----------------------------------------------------------
  //  API publique
  // ----------------------------------------------------------

  /** Remet le plateau à zéro */
  reset() {
    this.board         = Array.from({ length: this.SIZE }, () => Array(this.SIZE).fill(0));
    this.currentPlayer = 1;       // 1 = Noir, 2 = Blanc
    this.captures      = [0, 0];  // [noir, blanc]
    this.lastBoard     = null;
    this._draw();
    this._emitChange();
  }

  /** Passe le tour sans poser de pierre */
  pass() {
    this.lastBoard     = this.board.map(r => [...r]);
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    this._emitChange();
  }

  /**
   * Pose une pierre à (row, col).
   * @returns {boolean} true si le coup est valide et joué
   */
  play(row, col) {
    if (row < 0 || row >= this.SIZE || col < 0 || col >= this.SIZE) return false;
    if (this.board[row][col] !== 0) return false;

    const prev = this.board.map(r => [...r]);
    this.board[row][col] = this.currentPlayer;

    const opponent  = this.currentPlayer === 1 ? 2 : 1;
    const captured  = this._removeCaptures(opponent);

    // Coup suicidaire ?
    const { liberties } = this._getGroup(row, col, this.currentPlayer);
    if (liberties.size === 0 && captured === 0) {
      this.board = prev;
      return false;
    }

    // Règle du Ko
    if (this.lastBoard && JSON.stringify(this.board) === JSON.stringify(this.lastBoard)) {
      this.board = prev;
      return false;
    }

    this.lastBoard = prev;
    this.captures[this.currentPlayer - 1] += captured;
    this.currentPlayer = opponent;

    this._draw();
    this._emitChange();
    return true;
  }

  /**
   * Callback appelé à chaque changement d'état.
   * Surcharge-le depuis l'extérieur :
   *   go.onChange = (state) => { ... }
   * state = { currentPlayer, captures, board }
   */
  onChange = null;

  // ----------------------------------------------------------
  //  Dessin
  // ----------------------------------------------------------

  _draw() {
    const { ctx, canvas, SIZE, CELL, PAD, HOSHI } = this;
    const isDark   = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const woodColor = isDark ? '#7a5c2e' : '#dcb468';
    const lineColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.75)';

    // Fond bois
    ctx.fillStyle = woodColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lignes de la grille
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1;
    for (let i = 0; i < SIZE; i++) {
      const x = PAD + i * CELL;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + (SIZE - 1) * CELL); ctx.stroke();
      const y = PAD + i * CELL;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + (SIZE - 1) * CELL, y); ctx.stroke();
    }

    // Points hoshi
    ctx.fillStyle = lineColor;
    for (const [r, c] of HOSHI) {
      ctx.beginPath();
      ctx.arc(PAD + c * CELL, PAD + r * CELL, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pierres
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.board[r][c]) this._drawStone(r, c, this.board[r][c]);
      }
    }
  }

  _drawStone(r, c, player) {
    const { ctx, PAD, CELL } = this;
    const x   = PAD + c * CELL;
    const y   = PAD + r * CELL;
    const rad = CELL / 2 - 2;

    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);

    if (player === 1) {
      ctx.fillStyle   = '#111';
      ctx.strokeStyle = '#444';
    } else {
      ctx.fillStyle   = '#f5f5f0';
      ctx.strokeStyle = '#999';
    }

    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // ----------------------------------------------------------
  //  Logique de jeu
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

  // ----------------------------------------------------------
  //  Événements
  // ----------------------------------------------------------

  _onClick(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx     = (e.clientX - rect.left) * scaleX;
    const my     = (e.clientY - rect.top)  * scaleY;
    const col    = Math.round((mx - this.PAD) / this.CELL);
    const row    = Math.round((my - this.PAD) / this.CELL);
    this.play(row, col);
  }

  _emitChange() {
    if (typeof this.onChange === 'function') {
      this.onChange({
        currentPlayer : this.currentPlayer,
        captures      : [...this.captures],
        board         : this.board.map(r => [...r])
      });
    }
  }
}