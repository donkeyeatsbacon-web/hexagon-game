/*
 * Cloudflare Worker — relays "name this solution" submissions from the Hexagon game
 * (hosted on GitHub Pages) into a GitHub issue, WITHOUT the player needing a GitHub login.
 *
 * The GitHub token lives only here as a secret (never in the client). The Worker also
 * validates that the submission is a real, complete solution and that its signature
 * matches, so garbage/spoofed submissions are rejected before an issue is ever created.
 *
 * Secrets / vars (see wrangler.toml + `wrangler secret put GITHUB_TOKEN`):
 *   GITHUB_TOKEN       (secret) fine-grained PAT with Issues: Read & Write on the repo
 *   GH_OWNER, GH_REPO  the target repo
 *   SUBMISSION_LABEL   label applied to the issue (default: name-submission)
 *   ALLOWED_ORIGINS    comma-separated list of allowed browser origins (your GitHub Pages URL)
 *   (the solution code shown in issue titles is derived from the id; no total is involved)
 *   RL                 (binding) Cloudflare Rate Limiting — hard per-IP cap (optional)
 */

const BOARD_RADIUS = 4;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin') || '', env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // 0) Hard per-IP rate limit (Cloudflare Rate Limiting binding "RL" — see wrangler.toml).
    //    Counts every attempt, so spamming invalid submissions gets throttled too.
    //    Fail-open: if the limiter is unavailable, don't block legitimate players.
    if (env.RL) {
      const ip = request.headers.get('CF-Connecting-IP') || 'anon';
      try {
        const { success } = await env.RL.limit({ key: ip });
        if (!success) return json({ error: 'Too many submissions — please wait a minute and try again.' }, 429, cors);
      } catch { /* limiter outage → allow through */ }
    }

    let data;
    try { data = await request.json(); } catch { return json({ error: 'Bad request.' }, 400, cors); }

    // 1) Honeypot: real users leave this blank; bots fill it. Pretend success and drop it.
    if (data.website) return json({ ok: true, dropped: true }, 200, cors);

    // 2) Name sanity
    const name = String(data.name || '').trim();
    if (name.length < 1 || name.length > 40) return json({ error: 'Name must be 1–40 characters.' }, 400, cors);
    for (let i = 0; i < name.length; i++) { const cc = name.charCodeAt(i); if (cc < 0x20 || cc === 0x7f) return json({ error: 'Name has invalid characters.' }, 400, cors); }

    // 3) Prove it's a real, complete tiling whose signature matches the claimed id
    const v = validateSolution(data, env);
    if (!v.ok) return json({ error: v.error }, 400, cors);

    const label = env.SUBMISSION_LABEL || 'name-submission';
    const ghHeaders = {
      'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hexagon-name-worker',
    };

    // List open issues once — used by both de-dupe checks below. This plain listing is fresher
    // than the label-filtered one (which lags for just-created issues). If it errors, both
    // checks fail open so a legitimate submission is never lost.
    let openIssues = null;
    try {
      const lr = await fetch(`https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/issues?state=open&per_page=100`, { headers: ghHeaders });
      if (lr.ok) openIssues = await lr.json();
    } catch { /* leave null */ }
    const isSubmission = it => Array.isArray(it.labels) && it.labels.some(l => (l && l.name || l) === label);

    // 3.5) Same solution already has an OPEN (pending) submission → don't open another; a name
    //      is already awaiting review for it. (Rejected/closed issues don't block a fresh try.)
    if (Array.isArray(openIssues)) {
      const dup = openIssues.find(it => typeof it.body === 'string' && it.body.includes(`"id":"${v.id}"`) && isSubmission(it));
      if (dup) return json({ ok: true, duplicate: true, issue: dup.number,
        message: 'This solution already has a name awaiting review — thanks!' }, 200, cors);
    }

    // 3.6) Names are unique. Reject if this exact name (trimmed, case-insensitive) is already used
    //      by ANOTHER solution — approved, or pending in another open submission. Fails open.
    try {
      const wanted = normName(name);
      const taken = new Set();
      if (Array.isArray(openIssues)) {
        for (const it of openIssues) {
          if (!isSubmission(it) || typeof it.body !== 'string') continue;
          if (it.body.includes(`"id":"${v.id}"`)) continue;      // this solution (ruled out above)
          const pn = payloadName(it.body);
          if (pn) taken.add(normName(pn));
        }
      }
      // approved names live in the public approved-names.json (no token needed to read it)
      const ar = await fetch(`https://raw.githubusercontent.com/${env.GH_OWNER}/${env.GH_REPO}/main/approved-names.json`, { cf: { cacheTtl: 30 } });
      if (ar.ok) {
        const approved = await ar.json().catch(() => ({}));
        for (const [sid, rec] of Object.entries(approved || {})) {
          if (sid !== v.id && rec && typeof rec.name === 'string') taken.add(normName(rec.name));
        }
      }
      if (taken.has(wanted)) return json({ error: 'That name is already taken — please choose another.', nameTaken: true }, 409, cors);
    } catch { /* uniqueness lookup failed → allow the submission */ }

    // 4) Create the GitHub issue server-side (token stays secret)
    const submission = { id: v.id, code: v.code, name, layout: data.layout };
    const title = `Name ${v.code}: ${name}`;
    const body =
      'A player proposed a name for a hexagon solution — approve it in the admin page.\n\n' +
      `**Name:** ${name}\n` +
      `**Solution:** ${v.code} (\`${v.id}\`)\n\n` +
      '```json\n' + JSON.stringify(submission) + '\n```\n';

    let gh;
    try {
      gh = await fetch(`https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/issues`, {
        method: 'POST',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels: [label] }),
      });
    } catch { return json({ error: 'Submission service is unreachable. Try later.' }, 502, cors); }

    if (!gh.ok) return json({ error: 'Could not submit right now. Please try later.' }, 502, cors);
    const issue = await gh.json().catch(() => ({}));
    return json({ ok: true, issue: issue.number || null }, 200, cors);
  }
};

/* ---------- helpers ---------- */

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// name comparison key: trimmed, case-insensitive, inner whitespace collapsed
function normName(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }
// pull the proposed name out of an issue body's ```json {...}``` block
function payloadName(body) {
  const m = body.match(/```json\s*([\s\S]*?)```/);
  if (m) { try { const p = JSON.parse(m[1].trim()); if (p && typeof p.name === 'string') return p.name; } catch {} }
  return null;
}

// same 53-bit hash the game uses — keep byte-for-byte identical
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Must match solutionCode() in index.html so an issue title matches what the player saw.
// The 12 board symmetries, as permutations of the boardCells order.
function symmetries(cells) {
  const pos = new Map(cells.map(([q, r], i) => [q + ',' + r, i]));
  const rot60 = c => { const x = c[0], z = c[1], y = -x - z; return [-z, -y]; };
  const reflect = c => [c[1], c[0]];
  const out = [];
  for (let flip = 0; flip < 2; flip++) for (let rot = 0; rot < 6; rot++) {
    const perm = new Array(cells.length);
    cells.forEach(([q, r], i) => {
      let c = flip ? reflect([q, r]) : [q, r];
      for (let k = 0; k < rot; k++) c = rot60(c);
      perm[i] = pos.get(c[0] + ',' + c[1]);
    });
    out.push(perm);
  }
  return out;
}
function canonicalKey(cells, occ) {
  const assign = cells.map(([q, r]) => occ.get(q + ',' + r) || '_');
  let best = null;
  for (const perm of symmetries(cells)) {
    const out = new Array(assign.length);
    for (let i = 0; i < assign.length; i++) out[perm[i]] = assign[i];
    const k = out.join('|');
    if (best === null || k < best) best = k;
  }
  return best;
}

function solutionCode(id) {
  const s = String(id).toUpperCase().padStart(11, '0');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

// The 14 pieces, one reference placement each, copied from PIECE_DATA in index.html.
// scripts/check-worker-pieces.mjs asserts this copy still matches the game.
const PIECE_SHAPES = {
  P0: [[2,0],[3,-1],[3,0],[3,1],[4,0]],
  P1: [[0,-4],[0,-3],[1,-4],[1,-3],[1,-2]],
  P2: [[2,-1],[3,-2],[4,-2],[4,-1]],
  P3: [[-4,0],[-4,1],[-4,2],[-4,3]],
  P4: [[-2,-2],[-2,-1],[-2,0],[-1,0],[0,-1]],
  P5: [[0,1],[0,2],[1,0],[1,1],[1,2]],
  P6: [[-4,4],[-3,3],[-3,4]],
  P7: [[-3,-1],[-3,0],[-3,1],[-2,1]],
  P8: [[-3,2],[-2,2],[-2,3],[-1,1]],
  P9: [[0,4],[1,3],[2,1],[2,2]],
  P10: [[3,-4],[3,-3],[4,-4],[4,-3]],
  P11: [[-2,4],[-1,2],[-1,3],[-1,4],[0,3]],
  P12: [[0,0],[1,-1],[2,-4],[2,-3],[2,-2]],
  P13: [[-1,-3],[-1,-2],[-1,-1],[0,-2]],
};

// Every orientation of every piece, normalised by translation so a submitted piece can be
// compared against them regardless of where it sits on the board. Any single mirror works
// here: combined with the six rotations it generates the same twelve orientations as the
// game's per-piece flip axes.
function normShape(cells) {
  const s = cells.map(c => [c[0], c[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const o = s[0];
  return s.map(c => (c[0] - o[0]) + ',' + (c[1] - o[1])).join(' ');
}
const PIECE_ORIENTATIONS = (() => {
  const rot60 = c => { const x = c[0], z = c[1], y = -x - z; return [-z, -y]; };
  const mirror = c => [c[1], c[0]];
  const out = {};
  for (const [id, base] of Object.entries(PIECE_SHAPES)) {
    const set = new Set();
    for (let f = 0; f < 2; f++) for (let r = 0; r < 6; r++) {
      let t = base.map(c => (f ? mirror(c) : [c[0], c[1]]));
      for (let k = 0; k < r; k++) t = t.map(rot60);
      set.add(normShape(t));
    }
    out[id] = set;
  }
  return out;
})();

function boardCells() {
  const cells = [];
  for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++)
    for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= BOARD_RADIUS) cells.push([q, r]);
  return cells;
}

// Verify layout is a complete, non-overlapping, on-board tiling and its signature matches `id`.
function validateSolution(data, env) {
  const layout = data.layout;
  if (!Array.isArray(layout) || layout.length < 1) return { ok: false, error: 'Missing layout.' };

  const cells = boardCells();
  const boardSet = new Set(cells.map(([q, r]) => q + ',' + r));
  const occ = new Map();                                  // "q,r" -> piece id
  const used = new Set();
  for (const p of layout) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.cells)) return { ok: false, error: 'Malformed layout.' };
    // Covering the board without overlaps is not enough on its own: without these three
    // checks any partition of the 61 cells into groups labelled P0..P13 would validate, and
    // a crafted request could mint an id for a board the game cannot actually produce.
    if (!PIECE_ORIENTATIONS[p.id]) return { ok: false, error: 'Unknown piece.' };
    if (used.has(p.id)) return { ok: false, error: 'A piece is used more than once.' };
    used.add(p.id);
    if (!PIECE_ORIENTATIONS[p.id].has(normShape(p.cells))) return { ok: false, error: 'A piece is the wrong shape.' };
    for (const c of p.cells) {
      if (!Array.isArray(c) || c.length !== 2) return { ok: false, error: 'Malformed cell.' };
      const k = c[0] + ',' + c[1];
      if (!boardSet.has(k)) return { ok: false, error: 'A piece hangs off the board.' };
      if (occ.has(k)) return { ok: false, error: 'Pieces overlap.' };
      occ.set(k, p.id);
    }
  }
  if (used.size !== Object.keys(PIECE_SHAPES).length) return { ok: false, error: 'Not every piece was used.' };
  if (occ.size !== cells.length) return { ok: false, error: 'The board is not completely filled.' };

  // Rebuild the canonical key the client hashes: the lexicographically smallest of the
  // filling's 12 orientations, so a pattern and its rotations share one id. This must match
  // solutionKey() in index.html exactly or every submission fails the signature check.
  const key = canonicalKey(cells, occ);
  const h = cyrb53(key);
  const id = h.toString(36);
  const code = solutionCode(id);

  // Accept the pre-canonicalisation id as well. Players hold cached copies of the page long
  // after a deploy, and an old client sends the id of the orientation it happens to be in.
  // The submission is still a valid, verified tiling -- only its labelling is stale -- so it
  // is accepted and recorded under the canonical id. Without this, every cached client's
  // submissions would fail, and the worker could not be deployed before the site.
  const legacyId = cyrb53(cells.map(([q, r]) => occ.get(q + ',' + r)).join('|')).toString(36);
  if (typeof data.id === 'string' && data.id !== id && data.id !== legacyId) {
    return { ok: false, error: 'Solution signature mismatch.' };
  }
  return { ok: true, id, code };
}
