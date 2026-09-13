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

    // 3.5) De-dupe: if this exact solution already has an OPEN (pending) submission, don't open
    //      another — a name is already awaiting review for it. We list ALL open issues (that
    //      listing is fresher than the label-filtered one, which lags for just-created issues)
    //      and match on both the solution id in the body and the submission label. Fails open:
    //      if the lookup errors, fall through and create the submission rather than lose it.
    //      (Rejected/closed issues don't block a fresh attempt, since state=open.)
    try {
      const listUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/issues?state=open&per_page=100`;
      const lr = await fetch(listUrl, { headers: ghHeaders });
      if (lr.ok) {
        const open = await lr.json();
        const needle = `"id":"${v.id}"`;   // the compact JSON block the Worker writes contains this
        const dup = Array.isArray(open) && open.find(it =>
          typeof it.body === 'string' && it.body.includes(needle) &&
          Array.isArray(it.labels) && it.labels.some(l => (l && l.name || l) === label));
        if (dup) return json({ ok: true, duplicate: true, issue: dup.number,
          message: 'This solution already has a name awaiting review — thanks!' }, 200, cors);
      }
    } catch { /* lookup failed → fail open and create the submission below */ }

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
function solutionCode(id) {
  const s = String(id).toUpperCase().padStart(11, '0');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

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
  for (const p of layout) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.cells)) return { ok: false, error: 'Malformed layout.' };
    for (const c of p.cells) {
      if (!Array.isArray(c) || c.length !== 2) return { ok: false, error: 'Malformed cell.' };
      const k = c[0] + ',' + c[1];
      if (!boardSet.has(k)) return { ok: false, error: 'A piece hangs off the board.' };
      if (occ.has(k)) return { ok: false, error: 'Pieces overlap.' };
      occ.set(k, p.id);
    }
  }
  if (occ.size !== cells.length) return { ok: false, error: 'The board is not completely filled.' };

  // rebuild the exact key string the client hashes (board cells in q-asc, r-asc order)
  const key = cells.map(([q, r]) => occ.get(q + ',' + r)).join('|');
  const h = cyrb53(key);
  const id = h.toString(36);
  const code = solutionCode(id);
  if (typeof data.id === 'string' && data.id !== id) return { ok: false, error: 'Solution signature mismatch.' };
  return { ok: true, id, code };
}
