/*
 * The Worker holds its own copy of the piece shapes so it can verify that a submitted layout
 * is actually buildable from the real pieces. A copy can drift: if index.html's PIECE_DATA
 * ever changes and the Worker's does not, the Worker would start rejecting every genuine
 * submission — and that failure would only show up in production.
 *
 *   node scripts/check-worker-pieces.mjs
 *
 * Also confirms both sides derive identical solution ids, since they canonicalise separately.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/worker.js', import.meta.url), 'utf8');

const gamePieces = JSON.parse(html.match(/const PIECE_DATA = (\[.*?\]);/s)[1]);
const workerLiteral = worker.match(/const PIECE_SHAPES = \{[\s\S]*?\n\};/)[0];
const workerPieces = new Function(workerLiteral + '; return PIECE_SHAPES;')();

let bad = 0;
const norm = cells => cells.map(c => c.join(',')).sort().join(' ');

const gameIds = gamePieces.map(p => p.id).sort();
const workerIds = Object.keys(workerPieces).sort();
if (gameIds.join() !== workerIds.join()) {
  console.error(`piece sets differ:\n  game:   ${gameIds.join(' ')}\n  worker: ${workerIds.join(' ')}`);
  bad++;
} else {
  for (const p of gamePieces) {
    if (norm(p.solution) !== norm(workerPieces[p.id])) {
      console.error(`${p.id}: shape differs\n  game:   ${JSON.stringify(p.solution)}\n  worker: ${JSON.stringify(workerPieces[p.id])}`);
      bad++;
    }
  }
}

// Both sides canonicalise independently; a mismatch rejects every submission.
const BOARD_RADIUS = Number(html.match(/const BOARD_RADIUS = (\d+);/)[1]);
const cells = [];
for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++)
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++)
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= BOARD_RADIUS) cells.push([q, r]);

const workerCtx = new Function(worker.replace(/export default \{[\s\S]*?\n\};/, '') +
  '; return { canonicalKey, cyrb53, solutionCode, validateSolution };')();

const occ = new Map();
for (const p of gamePieces) for (const c of p.solution) occ.set(c.join(','), p.id);
const workerId = workerCtx.cyrb53(workerCtx.canonicalKey(cells, occ)).toString(36);

const rot60 = c => { const x = c[0], z = c[1], y = -x - z; return [-z, -y]; };
const mirror = c => [c[1], c[0]];
const pos = new Map(cells.map(([q, r], i) => [q + ',' + r, i]));
const assign = cells.map(([q, r]) => occ.get(q + ',' + r));
let best = null;
for (let f = 0; f < 2; f++) for (let rot = 0; rot < 6; rot++) {
  const out = new Array(cells.length);
  cells.forEach(([q, r], i) => {
    let c = f ? mirror([q, r]) : [q, r];
    for (let k = 0; k < rot; k++) c = rot60(c);
    out[pos.get(c[0] + ',' + c[1])] = assign[i];
  });
  const k = out.join('|');
  if (best === null || k < best) best = k;
}
const cyrb53Game = new Function(html.match(/function cyrb53\(str, seed\)\{[\s\S]*?\n\}/)[0] + '; return cyrb53;')();
const gameId = cyrb53Game(best).toString(36);

if (gameId !== workerId) { console.error(`canonical id differs: game ${gameId} vs worker ${workerId}`); bad++; }

console.log(bad
  ? `${bad} problem(s) — the Worker would reject genuine submissions`
  : `ok: ${gameIds.length} pieces match, and both sides derive id ${gameId} (${workerCtx.solutionCode(gameId)})`);
process.exit(bad ? 1 : 0);
