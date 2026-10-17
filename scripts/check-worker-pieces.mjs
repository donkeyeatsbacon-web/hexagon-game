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

const gamePieces = JSON.parse(html.match(/const ALL_PIECES = (\[.*?\]);/s)[1]);
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
// Board catalogues must agree too — a board the Worker does not know rejects every
// submission from it, and a radius mismatch rejects them just as silently.
const gameBoards = new Function('return ' + html.match(/const BOARDS = (\{[\s\S]*?\n\});/)[1])();
const workerBoards = new Function('return ' + worker.match(/const BOARDS = (\{[\s\S]*?\n\};)/)[1].replace(/;$/,''))();
for (const id of new Set([...Object.keys(gameBoards), ...Object.keys(workerBoards)])) {
  const g = gameBoards[id], w = workerBoards[id];
  if (!g || !w) { console.error(`board "${id}" is known to only one side`); bad++; continue; }
  if (g.radius !== w.radius) { console.error(`board "${id}": radius ${g.radius} vs ${w.radius}`); bad++; }
  if (g.pieces.join() !== w.pieces.join()) { console.error(`board "${id}": piece list differs`); bad++; }
}
const BOARD_RADIUS = gameBoards.classic.radius;
const cells = [];
for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++)
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++)
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= BOARD_RADIUS) cells.push([q, r]);

const workerCtx = new Function(worker.replace(/export default \{[\s\S]*?\n\};/, '') +
  '; return { canonicalKey, cyrb53, solutionCode, validateSolution, boardCells };')();
const cyrb53Game = new Function(html.match(/function cyrb53\(str, seed\)\{[\s\S]*?\n\}/)[0] + '; return cyrb53;')();

const rot60 = c => { const x = c[0], z = c[1], y = -x - z; return [-z, -y]; };
const mirror = c => [c[1], c[0]];

// Derive a canonical id the way index.html does, so the two implementations can be compared
// per board. They canonicalise separately; a mismatch rejects every submission from a board.
function gameSideId(boardId, boardCellList, occ) {
  const pos = new Map(boardCellList.map(([q, r], i) => [q + ',' + r, i]));
  const assign = boardCellList.map(([q, r]) => occ.get(q + ',' + r));
  let best = null;
  for (let f = 0; f < 2; f++) for (let rot = 0; rot < 6; rot++) {
    const out = new Array(boardCellList.length);
    boardCellList.forEach(([q, r], i) => {
      let c = f ? mirror([q, r]) : [q, r];
      for (let k = 0; k < rot; k++) c = rot60(c);
      out[pos.get(c[0] + ',' + c[1])] = assign[i];
    });
    const body = out.join('|');
    const k = boardId === 'classic' ? body : boardId + '#' + body;
    if (best === null || k < best) best = k;
  }
  return cyrb53Game(best).toString(36);
}

// For each board, lay its pieces out in *some* valid tiling and check both sides agree.
const shapeOf = Object.fromEntries(gamePieces.map(p => [p.id, p.solution]));
const results = [];
for (const [id, def] of Object.entries(gameBoards)) {
  const cs = workerCtx.boardCells(def.radius);
  const tiling = findTiling(cs, def.pieces.map(pid => ({ id: pid, base: shapeOf[pid] })));
  if (!tiling) { console.error(`board "${id}": no tiling found — the piece set cannot fill it`); bad++; continue; }
  const occ = new Map();
  for (const t of tiling) for (const c of t.cells) occ.set(c.join(','), t.id);
  const g = gameSideId(id, cs, occ);
  const w = workerCtx.cyrb53(workerCtx.canonicalKey(cs, occ, id)).toString(36);
  if (g !== w) { console.error(`board "${id}": canonical id differs — game ${g} vs worker ${w}`); bad++; }
  // and the Worker must accept that very layout
  const layout = tiling.map(t => ({ id: t.id, cells: t.cells }));
  const v = workerCtx.validateSolution({ board: id, layout, id: g }, {});
  if (!v.ok) { console.error(`board "${id}": Worker rejects a genuine solution — ${v.error}`); bad++; }
  results.push(`${id}: ${def.pieces.length} pieces, ${cs.length} cells, id ${g}`);
}

function findTiling(cs, defs) {
  const idx = new Map(cs.map((c, i) => [c.join(','), i])), N = cs.length;
  const tf = (base, rot, flip) => base.map(c => {
    let x = flip ? mirror(c) : [c[0], c[1]];
    for (let i = 0; i < rot; i++) x = rot60(x);
    return x;
  });
  const opts = defs.map(d => {
    const seen = new Map();
    for (let f = 0; f < 2; f++) for (let r = 0; r < 6; r++) {
      const t = tf(d.base, r, !!f), o = t[0];
      const n = t.map(c => [c[0] - o[0], c[1] - o[1]]);
      for (const [aq, ar] of cs) {
        const ii = []; let ok = true;
        for (const c of n) { const k = idx.get((c[0] + aq) + ',' + (c[1] + ar)); if (k === undefined) { ok = false; break; } ii.push(k); }
        if (ok) { ii.sort((a, b) => a - b); seen.set(ii.join(','), ii); }
      }
    }
    return [...seen.values()];
  });
  const byLow = Array.from({ length: N }, () => []);
  opts.forEach((l, pi) => l.forEach(pl => byLow[pl[0]].push({ pi, pl })));
  const occ = new Uint8Array(N), used = new Uint8Array(defs.length);
  let found = null; const pick = [];
  (function go(d) {
    if (found) return;
    if (d === defs.length) { found = pick.map(x => ({ id: defs[x.pi].id, cells: x.pl.map(i => cs[i]) })); return; }
    let low = 0; while (low < N && occ[low]) low++;
    if (low === N) return;
    for (const { pi, pl } of byLow[low]) {
      if (used[pi]) continue;
      let ok = true; for (const c of pl) if (occ[c]) { ok = false; break; }
      if (!ok) continue;
      for (const c of pl) occ[c] = 1; used[pi] = 1; pick.push({ pi, pl });
      go(d + 1); if (found) return;
      pick.pop(); used[pi] = 0; for (const c of pl) occ[c] = 0;
    }
  })(0);
  return found;
}

console.log(bad
  ? `${bad} problem(s) — the Worker would reject genuine submissions`
  : `ok: ${gameIds.length} pieces match; both sides agree per board:\n  ` + results.join('\n  '));
process.exit(bad ? 1 : 0);