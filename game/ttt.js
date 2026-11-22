/**
 * game/ttt.js - Tic-tac-toe played from the GitHub profile README.
 *
 * A visitor clicks an empty square -> GitHub opens a new issue titled "ttt|move|<0-8>" ->
 * the workflow (.github/workflows/tictactoe.yml) runs `node game/play.js`, which:
 *   1. applies the visitor's move (they are X),
 *   2. lets the bot answer (it is O),
 *   3. redraws the board inside README.md and saves game/state.json,
 *   4. comments on the issue and closes it.
 *
 * The bot plays the best move most of the time (minimax) but not always, so it can be beaten.
 */

export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columns
  [0, 4, 8], [2, 4, 6],              // diagonals
];

export const emptyBoard = () => Array(9).fill('');

export function winner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

export const freeCells = (board) => board.map((v, i) => (v ? null : i)).filter((i) => i !== null);

/** Minimax score from O's point of view: +10 O wins, -10 X wins, 0 draw (faster wins score higher). */
function minimax(board, turn, depth) {
  const w = winner(board);
  if (w === 'O') return 10 - depth;
  if (w === 'X') return depth - 10;
  if (w === 'draw') return 0;
  const scores = freeCells(board).map((i) => {
    board[i] = turn;
    const s = minimax(board, turn === 'O' ? 'X' : 'O', depth + 1);
    board[i] = '';
    return s;
  });
  return turn === 'O' ? Math.max(...scores) : Math.min(...scores);
}

export function bestMove(board) {
  let best = -Infinity;
  let moves = [];
  for (const i of freeCells(board)) {
    board[i] = 'O';
    const s = minimax(board, 'X', 1);
    board[i] = '';
    if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i);
  }
  return moves[Math.floor(Math.random() * moves.length)];
}

/** The bot: best move with probability `skill`, otherwise a random free square. */
export function botMove(board, { skill = 0.75, random = Math.random } = {}) {
  const free = freeCells(board);
  if (!free.length) return null;
  // always take a win, always block a loss: missing those looks silly, not "beatable"
  for (const mark of ['O', 'X']) {
    for (const i of free) {
      board[i] = mark;
      const w = winner(board) === mark;
      board[i] = '';
      if (w) return i;
    }
  }
  return random() < skill ? bestMove(board) : free[Math.floor(random() * free.length)];
}

export function newState() {
  return { board: emptyBoard(), status: 'playing', moves: [], players: [], stats: { visitors: 0, bot: 0, draws: 0 }, history: [] };
}

/**
 * Applies one visitor move and the bot's answer. Returns { state, message } (state is a new object).
 * A move on a finished game starts a new one first.
 */
export function play(prev, cell, user, opts = {}) {
  const state = structuredClone(prev);
  if (state.status !== 'playing') Object.assign(state, { board: emptyBoard(), status: 'playing', moves: [], players: [] });
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { state: prev, message: 'That is not a square on the board.' };
  if (state.board[cell]) return { state: prev, message: 'That square is already taken - pick an empty one.' };

  state.board[cell] = 'X';
  state.moves.push({ by: user, cell });
  if (!state.players.includes(user)) state.players.push(user);

  let result = winner(state.board);
  if (!result) {
    const reply = botMove(state.board, opts);
    state.board[reply] = 'O';
    state.moves.push({ by: 'bot', cell: reply });
    result = winner(state.board);
  }

  let message = 'Your move is in! The bot answered - your turn again.';
  if (result) {
    state.status = result === 'X' ? 'visitors' : result === 'O' ? 'bot' : 'draw';
    if (result === 'X') { state.stats.visitors += 1; message = 'You beat the bot! 🎉'; }
    if (result === 'O') { state.stats.bot += 1; message = 'The bot won this one. 🤖 Try again!'; }
    if (result === 'draw') { state.stats.draws += 1; message = "It's a draw. 🤝"; }
    state.history.unshift({ result: state.status, players: [...state.players], date: new Date().toISOString().slice(0, 10) });
    state.history = state.history.slice(0, 5);
  }
  return { state, message };
}

// ---------------- README rendering ----------------
const MARK = { X: '❌', O: '⭕' };
const TILE = { X: 'x', O: 'o' };

const issueUrl = (repo, title) => `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent('Just click **Create** below - the bot will play its move in a few seconds and update the board. 🎮')}`;

/** Board for the README: drawn tiles (assets/ttt/*.svg); empty tiles are links that play that square. */
export function renderBoard(state, repo) {
  const playing = state.status === 'playing';
  const tile = (i) => {
    const v = state.board[i];
    if (v) return `<img src="assets/ttt/${TILE[v]}.svg" width="96" alt="${v}">`;
    if (!playing) return '<img src="assets/ttt/blank.svg" width="96" alt="empty">';
    return `<a href="${issueUrl(repo, `ttt|move|${i}`)}"><img src="assets/ttt/empty.svg" width="96" alt="play square ${i + 1}"></a>`;
  };
  const grid = [0, 3, 6].map((r) => `${tile(r)}${tile(r + 1)}${tile(r + 2)}`).join('<br>\n');

  let status;
  if (playing) status = state.moves.length ? '<b>Your turn!</b> Click an empty tile.' : '<b>Start a game:</b> click any tile.';
  else {
    const who = state.status === 'visitors' ? 'Visitors won the last game! 🎉' : state.status === 'bot' ? 'The bot won the last game. 🤖' : 'The last game was a draw. 🤝';
    status = `${who} <a href="${issueUrl(repo, 'ttt|new')}"><b>Start a new game</b></a> or just click a tile.`;
  }
  const s = state.stats;
  const recent = state.history.length
    ? state.history.slice(0, 3).map((h) => `${h.result === 'visitors' ? '🏆' : h.result === 'bot' ? '🤖' : '🤝'} ${h.players.map((p) => `@${p}`).join(', ')} ${h.result === 'visitors' ? 'won' : h.result === 'bot' ? 'lost' : 'drew'}`).join(' · ')
    : 'no finished games yet - be the first!';

  return [
    '<p align="center">',
    grid,
    '</p>',
    '',
    `<p align="center">${status}<br><sub>🏆 Visitors ${s.visitors} · 🤖 Bot ${s.bot} · 🤝 Draws ${s.draws} &nbsp;|&nbsp; recent: ${recent}</sub></p>`,
  ].join('\n');
}

/** Small emoji board for the reply comment on the issue. */
export function renderTextBoard(state) {
  const c = (i) => MARK[state.board[i]] || '⬜';
  return [0, 3, 6].map((r) => `${c(r)}${c(r + 1)}${c(r + 2)}`).join('<br>');
}

export function updateReadme(readme, boardMarkdown) {
  const start = '<!-- TTT:START -->';
  const end = '<!-- TTT:END -->';
  const a = readme.indexOf(start);
  const b = readme.indexOf(end);
  if (a === -1 || b === -1 || b < a) throw new Error('README is missing the TTT:START / TTT:END markers');
  return `${readme.slice(0, a + start.length)}\n${boardMarkdown}\n${readme.slice(b)}`;
}
