# Packaging Hexagon for the App Store and Play Store

The game itself is a single `index.html` that also serves as the GitHub Pages site.
Capacitor wraps that same file in a native shell — there is no separate app codebase.

| | |
|---|---|
| App ID | `com.donkeyeatsbacon.hexagonpuzzle` — **permanent**, cannot change after first release |
| App name | `Hexagon` (short enough to avoid truncation under the icon) |
| Orientation | Portrait and landscape, both platforms |
| Web bundle | `www/`, generated from an allowlist — dev tools never ship |

## One-time setup

Requires Node 18+. `android/` and `ios/` are generated, not committed (see `.gitignore`).

```bash
npm install                      # installs the deps listed below
npx cap add android              # needs JDK 17+ and the Android SDK
npx cap add ios                  # macOS + Xcode only
```

If `npm install` reports no dependencies, add them explicitly:

```bash
npm install @capacitor/core @capacitor/android @capacitor/ios \
            @capacitor/haptics @capacitor/splash-screen @capacitor/status-bar
npm install -D @capacitor/cli @capacitor/assets
```

`@capacitor/haptics` is not optional — `index.html` calls
`window.Capacitor.Plugins.Haptics` for the tap/place feedback, because iOS has no
`navigator.vibrate`. Without it, iOS silently loses haptics (Android still falls back).

## Everyday workflow

```bash
npm run build     # index.html -> www/
npm run sync      # build + npx cap sync   (run after every web change)
npm run android   # sync + open Android Studio
npm run ios       # sync + open Xcode
```

## Icons and splash screens

Sources live in `resources/` as SVG and are generated from the game's own hex geometry and
palette by `scripts/make-assets.mjs` — the icon is a real, validated tiling of a radius-2
board. The script asserts the tiling is complete, non-overlapping and connected, so a colour
or shape tweak can't quietly produce a broken board.

```bash
node scripts/make-assets.mjs                     # .svg sources
cd resources
for f in icon icon-foreground icon-background; do rsvg-convert -w 1024 -h 1024 $f.svg -o $f.png; done
for f in splash splash-dark; do rsvg-convert -w 2732 -h 2732 $f.svg -o $f.png; done
cd .. && npx capacitor-assets generate           # fans out to every platform size
```

`icon-foreground` is drawn smaller than `icon` on purpose: Android adaptive icons crop to a
circle, so the art has to sit inside the safe centre zone.

## Before you submit

- [ ] **Confirm `SITE_BASE`** in `index.html`. It is currently
      `https://donkeyeatsbacon-web.github.io/hexagon-game/`. In a packaged app this is where
      approved solution names are fetched from; if it is wrong, names fail silently.
- [ ] **Deploy the Worker CORS change.** `worker/wrangler.toml` now allows the packaged-app
      origins (`capacitor://localhost`, `https://localhost`). Until it is redeployed, in-app
      name submissions are blocked by CORS. Run `npx wrangler deploy` in `worker/`.
- [ ] **Privacy policy URL** — required by both stores. The app transmits a player-chosen
      name plus the originating IP to a Cloudflare Worker, which opens a GitHub issue.
- [ ] **Apple privacy labels / Google Data Safety** must match the above.
- [ ] **Apple guideline 1.2 (user-generated content).** Names are owner-approved before
      anyone else can see them. Say so explicitly in the review notes — it is a
      pre-publication moderation gate, which is what the guideline asks for.
- [ ] Content rating questionnaires (IARC for Google, age rating for Apple).
- [ ] Screenshots per device class; Play also wants a feature graphic.
- [ ] Google Play personal developer accounts require a closed test with 12 testers for 14
      continuous days before production access. Verify the current policy — it is calendar
      time, so start it early.

## Notes

- **Back button** is handled in web code: each overlay pushes a `history` entry, and
  Capacitor's Android shell maps hardware Back onto `history.back()`. No plugin needed.
- **Safe areas** are handled with `viewport-fit=cover` plus `env(safe-area-inset-*)`.
  `StatusBar.overlaysWebView` is `false`, so on Android the status bar is its own bar and
  the top inset is 0; iOS still gets real notch and home-indicator insets.
- **In-progress games** persist to `localStorage` after every move and on backgrounding.
