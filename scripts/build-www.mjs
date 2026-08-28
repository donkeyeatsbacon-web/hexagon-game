/*
 * Assembles the packaged-app web bundle in www/.
 *
 * The repo root doubles as the GitHub Pages site and also holds development tools
 * (admin.html, piece-editor.html, flip-axis-tool.html) plus reference data that must never
 * ship inside the app. So this copies an explicit ALLOWLIST rather than the directory —
 * a new dev tool dropped in the root can't accidentally end up in a store build.
 *
 * approved-names.json is deliberately NOT bundled: in a packaged app index.html detects the
 * native shell and fetches the live copy from the published site, so a bundled one would
 * only ever be stale. Offline, the names simply don't render.
 */
import { rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const www = new URL('../www/', import.meta.url);

const ALLOWLIST = ['index.html'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const name of ALLOWLIST) {
  const src = new URL(name, root);
  if (!existsSync(src)) {
    console.error(`build-www: missing required file "${name}"`);
    process.exit(1);
  }
  copyFileSync(src, new URL(name, www));
  console.log('  + ' + name);
}
console.log(`build-www: ${ALLOWLIST.length} file(s) -> ${fileURLToPath(www)}`);
