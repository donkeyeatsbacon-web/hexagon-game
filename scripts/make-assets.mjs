/*
 * Generates the source app icon and splash art as SVG, using the same pointy-top hex
 * geometry and palette as the game itself, so the icon is literally a solved board.
 *
 * A radius-2 board (19 cells) is used rather than the game's radius-4: at 48px on a home
 * screen the real board turns into grey mush, whereas five chunky pieces stay legible.
 *
 *   node scripts/make-assets.mjs      -> resources/*.svg
 * then rasterise with rsvg-convert (see resources/README.md).
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const SQRT3 = Math.sqrt(3);
const BG = '#1b1d24';                       // matches --bg in index.html
const EMPTY = '#20232b', EMPTY_EDGE = '#333846';

// A genuine tiling of the radius-2 hexagon: 4+4+4+4+3 = 19 cells, no gaps, no overlaps.
// The shapes deliberately hook into one another rather than running along rows — a
// row-aligned tiling shrinks down to something that reads as colour stripes, not a puzzle.
const PIECES = [
  { color: '#F20C0C', cells: [[0,-2],[1,-2],[1,-1],[0,-1]] },
  { color: '#0CC4F2', cells: [[2,-2],[2,-1],[2,0],[1,0]] },
  { color: '#FFD632', cells: [[-1,-1],[-2,0],[-1,0],[0,0]] },
  { color: '#E500FF', cells: [[1,1],[0,1],[0,2],[-1,2]] },
  { color: '#0CF2AD', cells: [[-2,1],[-1,1],[-2,2]] },
];
const RADIUS = 2;

const axial = (q, r, s) => ({ x: s * SQRT3 * (q + r / 2), y: s * 1.5 * r });

function shade(hex, amt) {                  // amt <0 darken, >0 lighten (same as the game)
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 0 : 255, t = Math.abs(amt);
  r = Math.round(r + (f - r) * t); g = Math.round(g + (f - g) * t); b = Math.round(b + (f - b) * t);
  return `rgb(${r},${g},${b})`;
}

function hexPath(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (30 + 60 * i);
    pts.push(`${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function boardCells() {
  const out = [];
  for (let q = -RADIUS; q <= RADIUS; q++)
    for (let r = -RADIUS; r <= RADIUS; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= RADIUS) out.push([q, r]);
  return out;
}

// Render the board centred in a `box`-sized square, occupying `fill` of its width.
function render(box, fill, { background = true } = {}) {
  const cells = boardCells();
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const [q, r] of cells) {
    const p = axial(q, r, 1);
    minx = Math.min(minx, p.x - SQRT3 / 2); maxx = Math.max(maxx, p.x + SQRT3 / 2);
    miny = Math.min(miny, p.y - 1);         maxy = Math.max(maxy, p.y + 1);
  }
  const s = (box * fill) / (maxx - minx);
  const ox = box / 2 - ((minx + maxx) / 2) * s;
  const oy = box / 2 - ((miny + maxy) / 2) * s;
  const lift = s * 0.07;                    // the game lifts piece faces off their shadow

  const owner = new Map();
  for (const pc of PIECES) for (const c of pc.cells) owner.set(c.join(','), pc.color);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">`;
  if (background) svg += `<rect width="${box}" height="${box}" fill="${BG}"/>`;

  for (const [q, r] of cells) {             // empty wells first
    const p = axial(q, r, s);
    svg += `<polygon points="${hexPath(ox + p.x, oy + p.y, s * 0.96)}" fill="${EMPTY}" stroke="${EMPTY_EDGE}" stroke-width="${(s * 0.04).toFixed(2)}"/>`;
  }
  for (const [q, r] of cells) {             // drop shadows
    const c = owner.get(`${q},${r}`); if (!c) continue;
    const p = axial(q, r, s);
    svg += `<polygon points="${hexPath(ox + p.x, oy + p.y, s * 0.96)}" fill="${shade(c, -0.28)}"/>`;
  }
  for (const [q, r] of cells) {             // piece faces
    const c = owner.get(`${q},${r}`); if (!c) continue;
    const p = axial(q, r, s);
    svg += `<polygon points="${hexPath(ox + p.x, oy + p.y - lift, s * 0.96)}" fill="${c}" stroke="${shade(c, 0.3)}" stroke-width="${(s * 0.05).toFixed(2)}" stroke-linejoin="round"/>`;
  }
  return svg + '</svg>';
}

// Guard the hand-written tiling above: every board cell covered exactly once, and every
// piece a single connected group. Cheap insurance against a future colour/shape tweak.
function validateTiling() {
  const board = new Set(boardCells().map(c => c.join(',')));
  const seen = new Map();
  for (const pc of PIECES) for (const c of pc.cells) {
    const k = c.join(',');
    if (!board.has(k)) throw new Error(`cell ${k} is off the radius-${RADIUS} board`);
    if (seen.has(k)) throw new Error(`cell ${k} is covered twice`);
    seen.set(k, pc.color);
  }
  if (seen.size !== board.size) throw new Error(`${board.size - seen.size} board cell(s) left uncovered`);
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  for (const pc of PIECES) {
    const want = new Set(pc.cells.map(c => c.join(',')));
    const queue = [pc.cells[0]], reached = new Set([pc.cells[0].join(',')]);
    while (queue.length) {
      const [q, r] = queue.pop();
      for (const [dq, dr] of DIRS) {
        const k = `${q + dq},${r + dr}`;
        if (want.has(k) && !reached.has(k)) { reached.add(k); queue.push([q + dq, r + dr]); }
      }
    }
    if (reached.size !== want.size) throw new Error(`piece ${pc.color} is not connected`);
  }
  console.log(`tiling ok: ${PIECES.length} connected pieces cover all ${board.size} cells`);
}
validateTiling();

mkdirSync(new URL('../resources/', import.meta.url), { recursive: true });
const out = (name, svg) => {
  writeFileSync(new URL(`../resources/${name}`, import.meta.url), svg);
  console.log('wrote resources/' + name);
};

// Play Store feature graphic: fixed 1024x500, board offset left with room for wordmark.
function featureGraphic() {
  const W = 1024, H = 500;
  const inner = render(H, 0.78, { background: false })
    .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="#22252e"/><stop offset="100%" stop-color="#15171d"/>` +
    `</linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
    `<g transform="translate(60,0)">${inner}</g>` +
    `<text x="620" y="228" font-family="Helvetica,Arial,sans-serif" font-size="76" font-weight="700" fill="#eef1f6">Hexagon</text>` +
    `<text x="622" y="286" font-family="Helvetica,Arial,sans-serif" font-size="29" fill="#9aa3b2">Fit every piece.</text>` +
    `<text x="622" y="328" font-family="Helvetica,Arial,sans-serif" font-size="29" fill="#f0a020">Find one nobody has found.</text>` +
    `</svg>`;
}

out('icon.svg', render(1024, 0.72));
out('feature-graphic.svg', featureGraphic());
// Android adaptive icons crop to a circle, so the art must sit inside a safe centre zone.
out('icon-foreground.svg', render(1024, 0.46));
out('icon-background.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`);
// Splash is one square reused at every aspect ratio, so keep the art small and centred.
out('splash.svg', render(2732, 0.26));
out('splash-dark.svg', render(2732, 0.26));
