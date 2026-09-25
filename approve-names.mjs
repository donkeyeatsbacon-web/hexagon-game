#!/usr/bin/env node
/*
 * hexnames — review "name this solution" submissions from the terminal.
 * Submissions arrive as GitHub issues labeled `name-submission` (opened by the Cloudflare
 * Worker). Approving writes the name into approved-names.json (a commit) and closes the
 * issue; rejecting just closes it. Uses your authenticated `gh` CLI — no extra token.
 *
 *   hexnames            # interactive review (approve / reject / skip each)
 *   hexnames list       # just show what's waiting
 *   hexnames approve 4  # approve issue #4
 *   hexnames reject 4   # reject issue #4
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

const OWNER = 'donkeyeatsbacon-web', REPO = 'hexagon-game';
const SUB_LABEL = 'name-submission', OK_LABEL = 'name-approved', NO_LABEL = 'name-rejected';
const FILE = 'approved-names.json';

const C = {
  b:  s => `\x1b[1m${s}\x1b[0m`,
  g:  s => `\x1b[32m${s}\x1b[0m`,
  r:  s => `\x1b[31m${s}\x1b[0m`,
  y:  s => `\x1b[33m${s}\x1b[0m`,
  dim:s => `\x1b[2m${s}\x1b[0m`,
};

function gh(args, input) {
  try { return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 10 * 1024 * 1024 }); }
  catch (e) { throw new Error(((e.stderr || e.message || '') + '').trim()); }
}
const ghJSON = args => JSON.parse(gh(args));

function checkGh() {
  try { gh(['auth', 'status']); }
  catch { console.error(C.r('GitHub CLI not ready — install `gh` and run `gh auth login`.')); process.exit(1); }
}

const getIssue = n => ghJSON(['api', `repos/${OWNER}/${REPO}/issues/${n}`,
  '--jq', '{number, title, body, user: .user.login, url: .html_url}']);

// List all open issues and filter to submissions client-side: the plain listing is fresher
// than the label-filtered one, which lags for just-created issues.
const listPending = () => ghJSON(['api',
  `repos/${OWNER}/${REPO}/issues?state=open&per_page=100`,
  '--jq', `[.[] | select(any(.labels[].name; . == "${SUB_LABEL}")) | {number, title, body, user: .user.login, url: .html_url}]`]);

function parsePayload(body) {
  const m = (body || '').match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
// solution code shown to the player. The Worker sends p.code (e.g. "ABCD-EFGH-IJK");
// very old issues sent p.num instead, so fall back to that.
const codeStr = p => p.code || (p.num != null ? '#' + p.num : '(unknown)');

function getApproved() {
  try {
    const j = ghJSON(['api', `repos/${OWNER}/${REPO}/contents/${FILE}?ref=main`]);
    const content = Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8');
    return { data: JSON.parse(content || '{}'), sha: j.sha };
  } catch (e) {
    if (/Not Found|404/.test(e.message)) return { data: {}, sha: null };
    throw e;
  }
}
function putApproved(data, sha, message) {
  const body = { message, content: b64(JSON.stringify(data, null, 2) + '\n'), branch: 'main' };
  if (sha) body.sha = sha;
  const tmp = join(tmpdir(), `hexnames-${process.pid}-${Math.round(process.hrtime()[1])}.json`);
  writeFileSync(tmp, JSON.stringify(body));
  try { gh(['api', '-X', 'PUT', `repos/${OWNER}/${REPO}/contents/${FILE}`, '--input', tmp]); }
  finally { try { unlinkSync(tmp); } catch {} }
}
function closeIssue(n, label) {
  gh(['api', '-X', 'PATCH', `repos/${OWNER}/${REPO}/issues/${n}`, '-f', 'state=closed']);
  gh(['api', '-X', 'POST', `repos/${OWNER}/${REPO}/issues/${n}/labels`, '-f', 'labels[]=' + label]);
}

function approve(issue) {
  const p = parsePayload(issue.body);
  if (!p || !p.id) { console.error(C.r(`  ✗ #${issue.number}: couldn't read submission data — skipped.`)); return false; }
  const { data, sha } = getApproved();
  const dup = data[p.id];
  data[p.id] = { name: p.name, code: p.code, approvedAt: new Date().toISOString(), issue: issue.number };
  putApproved(data, sha, `Approve name "${p.name}" for solution ${codeStr(p)}`);
  closeIssue(issue.number, OK_LABEL);
  console.log(C.g(`  ✓ approved “${p.name}” (solution ${codeStr(p)})${dup ? ' (replaced an existing name)' : ''} — published.`));
  return true;
}
function reject(issue) {
  closeIssue(issue.number, NO_LABEL);
  console.log(C.y(`  ✗ rejected #${issue.number}.`));
  return true;
}
function show(issue) {
  const p = parsePayload(issue.body) || {};
  console.log(C.b(`#${issue.number}  “${p.name ?? issue.title}”`));
  console.log(`   solution ${codeStr(p)}   ${C.dim('by ' + issue.user)}`);
  console.log(`   ${C.dim(issue.url)}`);
}

async function interactive() {
  const items = listPending();
  if (!items.length) { console.log(C.g('No submissions waiting. 🎉')); return; }
  console.log(C.b(`\n${items.length} submission(s) awaiting approval:\n`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));
  for (const issue of items) {
    show(issue);
    let done = false;
    while (!done) {
      const a = (await ask(C.b('   [a]pprove  [r]eject  [s]kip  [o]pen  [q]uit > '))).trim().toLowerCase();
      if (a === 'a')      { try { approve(issue); } catch (e) { console.error(C.r('   error: ' + e.message)); } done = true; }
      else if (a === 'r') { try { reject(issue);  } catch (e) { console.error(C.r('   error: ' + e.message)); } done = true; }
      else if (a === 's' || a === '') { console.log(C.dim('   skipped.')); done = true; }
      else if (a === 'o') { try { gh(['issue', 'view', String(issue.number), '-R', `${OWNER}/${REPO}`, '--web']); } catch {} }
      else if (a === 'q') { rl.close(); return; }
      else console.log(C.dim('   please type a, r, s, o, or q'));
    }
    console.log('');
  }
  rl.close();
  console.log(C.g('All done.'));
}

const [cmd, arg] = process.argv.slice(2);
checkGh();
try {
  if (!cmd || cmd === 'review') { await interactive(); }
  else if (cmd === 'list') {
    const items = listPending();
    if (!items.length) console.log(C.g('No submissions waiting.'));
    else { console.log(C.b(`${items.length} waiting:\n`)); items.forEach(i => { show(i); console.log(''); }); }
  }
  else if (cmd === 'approve' && arg) { approve(getIssue(arg)); }
  else if (cmd === 'reject'  && arg) { reject(getIssue(arg)); }
  else { console.log('Usage: hexnames [list | review | approve <#> | reject <#>]'); }
} catch (e) { console.error(C.r('Error: ' + e.message)); process.exit(1); }
