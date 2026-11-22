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

export function renderBoard(state, repo) {
  const issueUrl = (title) => `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent('Just click **Create** below - the bot will play its move in a few seconds and update the board. 🎮')}`;
  const playing = state.status === 'playing';
  const cell = (i) => {
    const v = state.board[i];
    if (v) return MARK[v];
    return playing ? `[⬜](${issueUrl(`ttt|move|${i}`)})` : '⬜';
  };
  const rows = [0, 3, 6].map((r) => `| ${cell(r)} | ${cell(r + 1)} | ${cell(r + 2)} |`).join('\n');

  let status;
  if (state.status === 'playing') status = state.moves.length ? '**Your turn!** Click an empty square. You are ❌, the bot is ⭕.' : '**Start a game:** click any square. You are ❌, the bot is ⭕.';
  else {
    const who = state.status === 'visitors' ? 'Visitors won the last game! 🎉' : state.status === 'bot' ? 'The bot won the last game. 🤖' : 'The last game was a draw. 🤝';
    status = `${who} [**Start a new game**](${issueUrl('ttt|new')}) or just click a square.`;
  }
  const s = state.stats;
  const recent = state.history.length
    ? state.history.map((h) => `${h.result === 'visitors' ? '🏆' : h.result === 'bot' ? '🤖' : '🤝'} ${h.players.map((p) => `@${p}`).join(', ')} - ${h.result === 'visitors' ? 'won' : h.result === 'bot' ? 'lost' : 'draw'} (${h.date})`).join('<br>')
    : 'No finished games yet - be the first!';

  return [
    status,
    '',
    '|   |   |   |',
    '|:-:|:-:|:-:|',
    rows,
    '',
    `**Scoreboard:** 🏆 Visitors ${s.visitors} · 🤖 Bot ${s.bot} · 🤝 Draws ${s.draws}`,
    '',
    `<sub>Recent games:<br>${recent}</sub>`,
  ].join('\n');
}

export function updateReadme(readme, boardMarkdown) {
  const start = '<!-- TTT:START -->';
  const end = '<!-- TTT:END -->';
  const a = readme.indexOf(start);
  const b = readme.indexOf(end);
  if (a === -1 || b === -1 || b < a) throw new Error('README is missing the TTT:START / TTT:END markers');
  return `${readme.slice(0, a + start.length)}\n${boardMarkdown}\n${readme.slice(b)}`;
}
