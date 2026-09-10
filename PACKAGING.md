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

## Store listing

All copy — descriptions, keywords, review notes, privacy-label answers and content-rating
guidance — lives in [STORE-LISTING.md](STORE-LISTING.md). Verify nothing exceeds a store's
character limit (they reject rather than truncate):

```bash
npm run check-listing
```

Screenshots are generated at exact store pixel sizes. Needs Playwright and a static server
on port 8777:

```bash
npm install -D playwright && npx playwright install chromium
npm run build && npx http-server www -p 8777    # any static server works
npm run screenshots                             # -> store-assets/screenshots/
```

Real captures from a physical device are also fine, and arguably better — the generated ones
exist so you are never blocked on owning the right hardware.

## Before you submit

- [x] **`SITE_BASE` confirmed** — `https://donkeyeatsbacon-web.github.io/hexagon-game/`
      returns 200 and serves the current build.
- [x] **Worker CORS deployed.** Verified: the Worker echoes `capacitor://localhost` and
      `https://localhost` back as allowed origins, and refuses unlisted ones.
- [x] **Privacy policy** written and published at
      `https://donkeyeatsbacon-web.github.io/hexagon-game/privacy.html`, linked from inside
      the app (How to play → Privacy policy).
- [x] **Apple privacy labels / Google Data Safety** — answers prepared in STORE-LISTING.md.
- [x] **Apple guideline 1.2 (user-generated content)** — review-notes text prepared. Names
      are approved before publication, which is the pre-publication gate the guideline asks
      for; saying so up front heads off the most likely rejection.
- [x] **Feature graphic** (Play, 1024×500) — `resources/feature-graphic.png`.
- [ ] Content rating questionnaires. Answer **yes** to "can users interact or share content"
      and note that submissions are moderated — see STORE-LISTING.md.
- [ ] Screenshots — run `npm run screenshots`, or capture on a device.
- [ ] **Release signing** — configured, but needs your keystore. See below.
- [ ] Google Play personal developer accounts require a closed test with 12 testers for 14
      continuous days before production access. Verify the current policy — it is calendar
      time, not work time, so start it as early as possible.
- [ ] iOS requires macOS and Xcode. Nothing on a Linux machine produces an iOS build.

## Release build (Play)

Play needs a signed AAB; the debug APK will not be accepted. One-time setup:

```bash
keytool -genkeypair -v -keystore ~/hexagon-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias hexagon

cp android/keystore.properties.example android/keystore.properties
# then fill in storeFile / storePassword / keyAlias / keyPassword
```

> **Back the .jks file up somewhere off this machine, before you ship anything.**
> If you lose it you can never publish an update to this app. Play would require a new
> package name and a new listing, and existing users could not be migrated.
>
> `keystore.properties`, `*.jks` and `*.keystore` are all gitignored. Capacitor's own
> `android/.gitignore` leaves the keystore lines commented out, so the root `.gitignore`
> is what actually prevents a key or its passwords being committed — don't remove those.

Then build. Play rejects a versionCode it has already seen, so bump it every upload:

```bash
npm run sync
cd android
./gradlew bundleRelease -PversionCode=2 -PversionName=1.1
# -> app/build/outputs/bundle/release/app-release.aab
```

Without `keystore.properties` the release tasks fail immediately with an explanatory
message, rather than quietly producing an unsigned artifact that Play would reject.

Verify before uploading:

```bash
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

`minifyEnabled` is deliberately off: R8 can strip the reflection-based methods Capacitor's
JS-to-native bridge depends on. Turn it on only alongside real on-device plugin testing.

## Notes

- **Back button** is handled in web code: each overlay pushes a `history` entry, and
  Capacitor's Android shell maps hardware Back onto `history.back()`. No plugin needed.
- **Safe areas** are handled with `viewport-fit=cover` plus `env(safe-area-inset-*)`.
  `StatusBar.overlaysWebView` is `false`, so on Android the status bar is its own bar and
  the top inset is 0; iOS still gets real notch and home-indicator insets.
- **In-progress games** persist to `localStorage` after every move and on backgrounding.
