/*
 * Counts, exactly, how many ways the piece set tiles the board.
 *
 *   node scripts/count-solutions.mjs            # raw tiling count
 *   node scripts/count-solutions.mjs --orbits   # also count solutions up to board symmetry
 *
 * The 14 pieces cover exactly as many cells as the board has, so this is an exact cover
 * problem; it is solved with Knuth's Algorithm X over dancing links.
 *
 * PIECE_DATA and BOARD_RADIUS are parsed out of index.html rather than duplicated here, so
 * this can never quietly disagree with the game about what is being counted.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const PIECE_DATA = JSON.parse(html.match(/const PIECE_DATA = (\[.*?\]);/s)[1]);
const BOARD_RADIUS = Number(html.match(/const BOARD_RADIUS = (\d+);/)[1]);

/* ---------- hex transforms: identical to the game's ---------- */
const rot60 = c => { const x = c[0], z = c[1], y = -x - z; return [-z, -y]; };
const reflect = c => [c[1], c[0]];
function transformCells(base, rot, flip) {
  return base.map(c => {
    let cell = flip ? reflect(c) : [c[0], c[1]];
    for (let i = 0; i < rot; i++) cell = rot60(cell);
    return cell;
  });
}

/* ---------- board ---------- */
const boardCells = [];
for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++)
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++)
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= BOARD_RADIUS) boardCells.push([q, r]);

const cellIndex = new Map(boardCells.map((c, i) => [c.join(','), i]));
const N_CELLS = boardCells.length;
const N_PIECES = PIECE_DATA.length;
const totalPieceCells = PIECE_DATA.reduce((n, p) => n + p.solution.length, 0);

console.log(`board: ${N_CELLS} cells (radius ${BOARD_RADIUS})`);
console.log(`pieces: ${N_PIECES}, covering ${totalPieceCells} cells`);
if (totalPieceCells !== N_CELLS) {
  console.error(`MISMATCH: pieces cover ${totalPieceCells} cells but the board has ${N_CELLS}`);
  process.exit(1);
}

/* ---------- rows: every legal placement of every piece ---------- */
// Columns 0..N_CELLS-1 are board cells; the next N_PIECES are "this piece is used once".
const rows = [];        // each row is an array of column indices
const rowMeta = [];     // { piece, cells }
for (let p = 0; p < N_PIECES; p++) {
  const base = PIECE_DATA[p].solution;
  const seen = new Set();                       // dedupe symmetric orientations
  // --no-flip models one-sided pieces (rotate only, never turn over). The game exposes a Flip
  // button, so reflections are legal in-game -- but if the physical pieces were printed on one
  // side, the real puzzle's solution count would be this smaller number.
  const flipLimit = process.argv.includes('--no-flip') ? 1 : 2;
  for (let flip = 0; flip < flipLimit; flip++) {
    for (let rot = 0; rot < 6; rot++) {
      const t = transformCells(base, rot, !!flip);
      const o = t[0];
      const norm = t.map(c => [c[0] - o[0], c[1] - o[1]]);
      for (const [aq, ar] of boardCells) {
        const placed = norm.map(c => [c[0] + aq, c[1] + ar]);
        const idx = [];
        let ok = true;
        for (const c of placed) {
          const i = cellIndex.get(c.join(','));
          if (i === undefined) { ok = false; break; }
          idx.push(i);
        }
        if (!ok) continue;
        idx.sort((a, b) => a - b);
        // A symmetric piece yields the same cell set from several (rot, flip) pairs. Counting
        // that placement more than once would multiply the solution total.
        const key = p + ':' + idx.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push([...idx, N_CELLS + p]);
        rowMeta.push({ piece: p, cells: idx });
      }
    }
  }
}
console.log(`placements: ${rows.length}`);

// --pin-p0 restricts piece 0 to the single placement it occupies in PIECE_DATA's own
// reference solution. That shrinks the problem to something a second, independent solver can
// count too, which is how this implementation gets validated rather than trusted.
const pinArg = process.argv.find(a => a.startsWith('--pin='));
if (pinArg) {
  const K = Number(pinArg.slice(6));
  for (let p = 0; p < K; p++) {
    const ref = PIECE_DATA[p].solution.map(c => cellIndex.get(c.join(','))).sort((a, b) => a - b).join(',');
    let kept = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rowMeta[i].piece !== p) continue;
      if (rowMeta[i].cells.join(',') === ref) { kept++; continue; }
      rows.splice(i, 1); rowMeta.splice(i, 1);
    }
    if (kept !== 1) { console.error(`pin failed for piece ${p}: matched ${kept}`); process.exit(1); }
  }
  console.log(`pinned first ${K} piece(s) -> ${rows.length} placements remain`);
}

/* ---------- dancing links ---------- */
const N_COLS = N_CELLS + N_PIECES;
const nodeCount = 1 + N_COLS + rows.reduce((n, r) => n + r.length, 0);
const L = new Int32Array(nodeCount), R = new Int32Array(nodeCount);
const U = new Int32Array(nodeCount), D = new Int32Array(nodeCount);
const COL = new Int32Array(nodeCount), ROW = new Int32Array(nodeCount);
const SIZE = new Int32Array(N_COLS + 1);

const root = 0;
for (let c = 1; c <= N_COLS; c++) {
  L[c] = c - 1; R[c] = (c === N_COLS) ? root : c + 1;
  U[c] = D[c] = c; COL[c] = c; ROW[c] = -1;
}
L[root] = N_COLS; R[root] = 1;

let next = N_COLS + 1;
for (let r = 0; r < rows.length; r++) {
  let first = -1;
  for (const c0 of rows[r]) {
    const c = c0 + 1, n = next++;
    COL[n] = c; ROW[n] = r;
    U[n] = U[c]; D[n] = c; D[U[c]] = n; U[c] = n;
    SIZE[c]++;
    if (first < 0) { L[n] = R[n] = n; first = n; }
    else { L[n] = L[first]; R[n] = first; R[L[first]] = n; L[first] = n; }
  }
}

function cover(c) {
  R[L[c]] = R[c]; L[R[c]] = L[c];
  for (let i = D[c]; i !== c; i = D[i])
    for (let j = R[i]; j !== i; j = R[j]) { U[D[j]] = U[j]; D[U[j]] = D[j]; SIZE[COL[j]]--; }
}
function uncover(c) {
  for (let i = U[c]; i !== c; i = U[i])
    for (let j = L[i]; j !== i; j = L[j]) { SIZE[COL[j]]++; U[D[j]] = j; D[U[j]] = j; }
  R[L[c]] = c; L[R[c]] = c;
}

const wantOrbits = process.argv.includes('--orbits');
const stack = new Int32Array(N_PIECES);
let count = 0;
const canonical = wantOrbits ? new Set() : null;

// Precompute the 12 board symmetries as cell-index permutations, for orbit counting.
let symPerms = null;
if (wantOrbits) {
  symPerms = [];
  for (let flip = 0; flip < 2; flip++)
    for (let rot = 0; rot < 6; rot++) {
      const perm = new Int32Array(N_CELLS);
      for (let i = 0; i < N_CELLS; i++) {
        const mapped = transformCells([boardCells[i]], rot, !!flip)[0];
        perm[i] = cellIndex.get(mapped.join(','));
      }
      symPerms.push(perm);
    }
}

const t0 = process.hrtime.bigint();
let nextReport = 100000;
function recordSolution(depth) {
  count++;
  if (count >= nextReport) {
    const s = Number(process.hrtime.bigint() - t0) / 1e9;
    process.stdout.write(`  ${count.toLocaleString()} solutions  ${s.toFixed(0)}s  (${Math.round(count / s).toLocaleString()}/s)\n`);
    nextReport += 100000;
  }
  if (!wantOrbits) return;
  const assign = new Int32Array(N_CELLS);
  for (let d = 0; d < depth; d++) {
    const m = rowMeta[stack[d]];
    for (const c of m.cells) assign[c] = m.piece;
  }
  // Canonical form = lexicographically smallest relabelling under the 12 symmetries.
  let best = null;
  for (const perm of symPerms) {
    const s = new Array(N_CELLS);
    for (let i = 0; i < N_CELLS; i++) s[perm[i]] = assign[i];
    const str = s.join(',');
    if (best === null || str < best) best = str;
  }
  canonical.add(best);
}

function search(depth) {
  if (R[root] === root) { recordSolution(depth); return; }
  let best = -1, bestSize = Infinity;
  for (let c = R[root]; c !== root; c = R[c]) {
    if (SIZE[c] < bestSize) { bestSize = SIZE[c]; best = c; if (bestSize <= 1) break; }
  }
  if (bestSize === 0) return;
  cover(best);
  for (let i = D[best]; i !== best; i = D[i]) {
    stack[depth] = ROW[i];
    for (let j = R[i]; j !== i; j = R[j]) cover(COL[j]);
    search(depth + 1);
    for (let j = L[i]; j !== i; j = L[j]) uncover(COL[j]);
  }
  uncover(best);
}

search(0);
const secs = Number(process.hrtime.bigint() - t0) / 1e9;

console.log(`\nraw tilings: ${count.toLocaleString()}`);
if (wantOrbits) console.log(`up to the 12 board symmetries: ${canonical.size.toLocaleString()}`);
console.log(`(${secs.toFixed(1)}s)`);

const claimed = Number(html.match(/const TOTAL_SOLUTIONS = (\d+);/)[1]);
console.log(`\nindex.html claims TOTAL_SOLUTIONS = ${claimed.toLocaleString()}`);
console.log(count === claimed ? 'MATCHES the raw count' :
  (wantOrbits && canonical.size === claimed ? 'MATCHES the symmetry-reduced count' : 'DOES NOT MATCH either count'));
