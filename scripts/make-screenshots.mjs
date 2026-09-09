/*
 * Generates store screenshots at the exact pixel dimensions Apple and Google require.
 *
 *   npm install -D playwright && npx playwright install chromium
 *   npm run build && npx http-server www -p 8777   (or any static server on 8777)
 *   node scripts/make-screenshots.mjs
 *
 * Why a real browser rather than upscaled images: the stores want precise pixel sizes, and
 * the game renders to a canvas at devicePixelRatio. Setting deviceScaleFactor gives a CSS
 * layout the size of a real phone AND a crisp backing store, so 430x932 @3x lands exactly on
 * 1290x2796 with no resampling. Upscaling a 430px capture would look soft.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL_BASE = process.env.SHOT_URL || 'http://localhost:8777/index.html';
const OUT = new URL('../store-assets/screenshots/', import.meta.url);

// css width/height x scale = the exact pixel size each store asks for
const DEVICES = [
  { id: 'ios-6.7',     w: 430,  h: 932,  scale: 3, note: '1290x2796 iPhone 6.7in' },
  { id: 'ios-6.5',     w: 414,  h: 896,  scale: 3, note: '1242x2688 iPhone 6.5in' },
  { id: 'ios-ipad13',  w: 1024, h: 1366, scale: 2, note: '2048x2732 iPad 12.9in' },
  { id: 'play-phone',  w: 360,  h: 640,  scale: 3, note: '1080x1920 Play phone' },
  { id: 'play-tab10',  w: 800,  h: 1280, scale: 2, note: '1600x2560 Play 10in tablet' },
];

// Each scene runs inside the page after boot. Keep them deterministic — no Math.random.
const SCENES = {
  // Mid-game: a handful of pieces placed, the rest scattered.
  board: () => {
    localStorage.clear();
    makePieces(); newGame(true); resize();
    const place = [[0, 0, 0], [1, -3, 0], [2, 2, -3], [5, -1, 3]];
    for (const [i, q, r] of place) { pieces[i].rot = 0; pieces[i].flip = false; placeAt(i, q, r); }
    updateCount(); draw();
  },
  // The win card, showing the solution number and collection count.
  solved: () => {
    localStorage.clear();
    makePieces(); newGame(true); resize();
    startTime = Date.now() - 168000;          // a plausible 02:48
    solveAll(); checkWin();
  },
  // The collection gallery, populated with a few finds.
  collection: () => {
    localStorage.clear();
    makePieces(); newGame(true); resize();
    solveAll();
    const layout = currentLayout();
    const col = {};
    [[41207, 6], [318664, 21], [502931, 44], [709155, 73]].forEach(([num, daysAgo], i) => {
      col['demo' + i] = { num, date: 1757000000000 - daysAgo * 86400000, layout };
    });
    saveCollection(col);
    solvedFlag = false;
    closeOverlay('win');
    openCollection();
  },
  // The first-run tutorial.
  tutorial: () => {
    localStorage.clear();
    makePieces(); newGame(true); resize();
    showTutorial();
  },
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const d of DEVICES) {
  for (const [name, scene] of Object.entries(SCENES)) {
    const ctx = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      deviceScaleFactor: d.scale,
      isMobile: d.scale === 3,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(URL_BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.pieces !== 'undefined' && window.pieces.length > 0);
    await page.evaluate(scene);
    await page.waitForTimeout(350);           // let the overlap flash / layout settle
    const file = new URL(`${d.id}-${name}.png`, OUT);
    await page.screenshot({ path: file, scale: 'device' });
    const box = await page.evaluate(() => [innerWidth, innerHeight]);
    console.log(`${d.id.padEnd(12)} ${name.padEnd(11)} ${box[0]}x${box[1]} css -> ${d.note}`);
    await ctx.close();
  }
}

await browser.close();
console.log('\nwrote to store-assets/screenshots/');
