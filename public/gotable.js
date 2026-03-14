// ============================================================
//  gotable.js — Rendu Canvas uniquement
//  La logique de jeu est dans goLogic.js (côté serveur)
//  Usage :
//    const go = new GoTable('goCanvas');
//    go.loadState(state);   // charge un état reçu du serveur
//    go.onChange = (state) => { ... }
// ============================================================

class GoTable {
constructor(canvasId, size = 13) {
  this.SIZE = size;
  this.canvas = document.getElementById(canvasId);
  this.ctx    = this.canvas.getContext('2d');

  this.HOSHI = [
    [3,3],[3,9],[3,15],
    [9,3],[9,9],[9,15],
    [15,3],[15,9],[15,15]
  ];

  this.board         = Array.from({ length: this.SIZE }, () => Array(this.SIZE).fill(0));
  this.currentPlayer = 1;
  this.captures      = [0, 0];
  this.onChange      = null;

  this._resize();
  this._draw();

  // Redessine si la fenêtre change de taille
  window.addEventListener('resize', () => {
    this._resize();
    this._draw();
  });
}

_resize() {
  // Prend la largeur du conteneur parent (ou de la fenêtre)
  const maxSize  = Math.min(
    this.canvas.parentElement?.clientWidth || window.innerWidth,
    window.innerHeight
  ) - 32; // 32px de marge

  this.CELL = Math.floor(maxSize / (this.SIZE + 1));
  this.PAD  = this.CELL;

  const dim = this.PAD * 2 + this.CELL * (this.SIZE - 1);
  this.canvas.width  = dim;
  this.canvas.height = dim;

  // Force le canvas à prendre toute la largeur disponible en CSS
  this.canvas.style.width  = '100%';
  this.canvas.style.maxWidth = dim + 'px';
}

  // Charge un état complet reçu du serveur et redessine
  loadState({ board, currentPlayer, captures }) {
    this.board         = board.map(r => [...r]);
    this.currentPlayer = currentPlayer;
    this.captures      = [...captures];
    this._draw();
    this._emitChange();
  }

  // Retourne la case [row, col] cliquée depuis un MouseEvent
  getCellFromEvent(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx     = (e.clientX - rect.left) * scaleX;
    const my     = (e.clientY - rect.top)  * scaleY;
    const col    = Math.round((mx - this.PAD) / this.CELL);
    const row    = Math.round((my - this.PAD) / this.CELL);
    if (row < 0 || row >= this.SIZE || col < 0 || col >= this.SIZE) return null;
    return { row, col };
  }

  _draw() {
    const { ctx, canvas, SIZE, CELL, PAD, HOSHI } = this;
    const isDark    = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const woodColor = isDark ? '#7a5c2e' : '#dcb468';
    const lineColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.75)';

    ctx.fillStyle = woodColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1;
    for (let i = 0; i < SIZE; i++) {
      const x = PAD + i * CELL;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + (SIZE-1)*CELL); ctx.stroke();
      const y = PAD + i * CELL;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + (SIZE-1)*CELL, y); ctx.stroke();
    }

    ctx.fillStyle = lineColor;
    for (const [r, c] of HOSHI) {
      ctx.beginPath();
      ctx.arc(PAD + c*CELL, PAD + r*CELL, 3.5, 0, Math.PI*2);
      ctx.fill();
    }

    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.board[r][c]) this._drawStone(r, c, this.board[r][c]);
  }

  _drawStone(r, c, player) {
    const { ctx, PAD, CELL } = this;
    const x   = PAD + c * CELL;
    const y   = PAD + r * CELL;
    const rad = CELL / 2 - 2;

    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI*2);

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

  _emitChange() {
    if (typeof this.onChange === 'function') {
      this.onChange({
        currentPlayer : this.currentPlayer,
        captures      : [...this.captures],
        board         : this.board.map(r => [...r]),
      });
    }
  }
}
