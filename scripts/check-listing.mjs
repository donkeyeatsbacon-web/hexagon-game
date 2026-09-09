/*
 * Verifies every field in STORE-LISTING.md fits its store's character limit.
 * Both stores reject on submit rather than truncating, so it is worth catching here.
 *
 *   node scripts/check-listing.mjs
 */
import { readFileSync } from 'node:fs';

const md = readFileSync(new URL('../STORE-LISTING.md', import.meta.url), 'utf8');

// Pull the fenced block that follows a given bold label.
function block(label) {
  const re = new RegExp('\\*\\*' + label + '\\*\\*[^\\n]*\\n+```\\n([\\s\\S]*?)\\n```');
  const m = md.match(re);
  return m ? m[1] : null;
}

const CHECKS = [
  ['App name',          30],
  ['Short description', 80],
  ['Full description',  4000],
  ['Name',              30],
  ['Subtitle',          30],
  ['Promotional text',  170],
  ['Keywords',          100],
];

let failed = 0;
for (const [label, limit] of CHECKS) {
  const text = block(label);
  if (text === null) { console.log(`?  ${label.padEnd(18)} not found in STORE-LISTING.md`); failed++; continue; }
  const n = text.length;
  const ok = n <= limit;
  if (!ok) failed++;
  const bar = ok ? 'ok  ' : 'OVER';
  console.log(`${bar} ${label.padEnd(18)} ${String(n).padStart(4)} / ${limit}${ok ? '' : `  (${n - limit} over)`}`);
}

// Apple counts each keyword list entry; spaces after commas are wasted characters.
const kw = block('Keywords');
if (kw) {
  console.log(`\nkeywords: ${kw.split(',').length} terms` + (/,\s/.test(kw) ? '  WARNING: spaces after commas waste characters' : ''));
}

process.exit(failed ? 1 : 0);
