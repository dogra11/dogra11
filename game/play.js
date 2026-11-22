/**
 * game/play.js - Run by the GitHub Action for every "ttt|..." issue.
 * Inputs come from environment variables (never from the shell command line), and the issue
 * title is parsed with a strict pattern, so nothing a visitor types can run as code.
 *
 *   ISSUE_TITLE  e.g. "ttt|move|4" or "ttt|new"
 *   ISSUE_USER   GitHub login of the visitor
 *   REPO         owner/name, e.g. dogra11/dogra11
 *
 * Writes README.md and game/state.json, and the comment for the issue to game/comment.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { play, newState, renderBoard, renderTextBoard, updateReadme } from './ttt.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const statePath = join(here, 'state.json');
const readmePath = join(root, 'README.md');

const title = String(process.env.ISSUE_TITLE || '').trim();
const user = String(process.env.ISSUE_USER || 'someone').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39) || 'someone';
const repo = String(process.env.REPO || 'dogra11/dogra11');

let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : newState();
let message;

const move = /^ttt\|move\|([0-8])$/.exec(title);
if (/^ttt\|new$/.test(title)) {
  if (state.status === 'playing' && state.moves.length) {
    message = 'A game is already in progress - jump in and make the next move!';
  } else {
    state = { ...state, board: Array(9).fill(''), status: 'playing', moves: [], players: [] };
    message = 'New game started - click a square on the profile to make the first move!';
  }
} else if (move) {
  ({ state, message } = play(state, Number(move[1]), user));
} else {
  message = 'I did not understand that move. Use the squares on the profile page to play.';
}

const board = renderBoard(state, repo);
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
writeFileSync(readmePath, updateReadme(readFileSync(readmePath, 'utf8'), board));
writeFileSync(join(here, 'comment.md'), `@${user} ${message}\n\n${renderTextBoard(state)}\n\n[**Back to the profile**](https://github.com/${repo.split('/')[0]}) to keep playing.\n`);
console.log(message);
