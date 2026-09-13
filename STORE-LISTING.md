# Store listing copy

Ready-to-paste text for both stores. Character limits are noted; run
`node scripts/check-listing.mjs` to verify nothing has drifted over a limit.

The home-screen name is **Hexagon** (short enough to avoid truncation under the icon).
The *store* listing uses **Hexagon Puzzle**, which is more searchable.

---

## Google Play

**App name** (max 30)
```
Hexagon Puzzle
```

**Short description** (max 80)
```
Fit fourteen coloured pieces into one hexagon. Easy to learn, hard to put down.
```

**Full description** (max 4000)
```
Fourteen coloured pieces. One hexagonal board. Every cell must be filled, and nothing may overlap.

That is the whole game. There is no timer pressure, no lives, no energy meter and no ads — just a shape that has to come out exactly right.

FIND YOUR OWN SOLUTIONS

There are millions of ways to fill the board, and almost none of them have been found yet. Every solution you discover gets its own code and joins your collection, so solving it again is never repeating yourself — you are hunting for an arrangement nobody has turned up before.

NAME WHAT YOU FIND

Discover a solution nobody has named yet and you can propose a name for it. Approved names are shown to every other player who finds that same arrangement. Leave your mark on a puzzle.

BUILT FOR TOUCH

• Drag a piece onto the board — it can hang over the edge while you think
• Tap a piece to rotate it around the exact hexagon you touched, so it stays where you put it
• Press and hold for rotate and flip
• Turn the whole board with the outer ring to see the puzzle from a new angle
• Overlapping pieces flash red, so a mistake is never hidden

PLAYS ANYWHERE

Works completely offline. Your half-finished board is saved automatically, so a phone call or a closed app never costs you your progress.

No accounts. No sign-in. No advertising. No tracking. Nothing to buy.
```

---

## Apple App Store

**Name** (max 30)
```
Hexagon Puzzle
```

**Subtitle** (max 30)
```
Be first to find a new one
```

**Promotional text** (max 170, editable without review)
```
Most solutions have never been found by anyone. Turn one up and it is yours to name — and your name is shown to every player who finds that same arrangement after you.
```

**Keywords** (max 100, comma-separated — no spaces, they waste characters)
```
puzzle,hexagon,tiling,logic,brain,offline,shapes,tangram,pentomino,relaxing,blocks,zen
```

**Description** (max 4000) — same body as the Play full description above.

**Support URL**
```
https://donkeyeatsbacon-web.github.io/hexagon-game/
```

**Privacy policy URL** (required by both stores)
```
https://donkeyeatsbacon-web.github.io/hexagon-game/privacy.html
```

---

## App Review notes

Paste into *App Review Information → Notes* for Apple. This heads off the most likely
rejection, which is guideline 1.2 on user-generated content.

```
The game is a single-player puzzle. No account or sign-in is required and all
functionality is available immediately on launch.

USER-GENERATED CONTENT (guideline 1.2)
After solving the puzzle, a player may optionally propose a short name for that
solution. Moderation is PRE-PUBLICATION: a submitted name is never visible to any
other user until the developer has personally reviewed and approved it. Names that
are objectionable, abusive, or that contain personal information are rejected and
never published. There is therefore no path by which one user can show arbitrary
text to another.

Reporting and contact details are published in the privacy policy, which is linked
from inside the app (How to play -> Privacy policy) and at:
https://donkeyeatsbacon-web.github.io/hexagon-game/privacy.html

The name feature is entirely optional; the game is fully playable without it.
```

---

## Privacy labels / Data safety

Both stores ask the same questions in different words. Answers consistent with
[privacy.html](privacy.html):

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Yes — one optional item |
| What is collected | "User content" — the optional solution name |
| Is it linked to the user's identity? | **No** — there are no accounts or identifiers |
| Is it used for tracking? | **No** |
| Is it used for advertising or marketing? | **No** |
| Is collection optional? | **Yes** — the game is fully playable without it |
| Analytics / crash data | **None** |
| Device or advertising identifiers | **None** |
| Location, contacts, photos, camera, microphone | **None** |

On the IP address: it is visible to the Cloudflare service transiently for rate limiting
and is not stored with the submission or used to build a profile. Neither store requires
declaring an IP used purely as an anti-abuse measure and never retained — but if you would
rather be conservative, declare it under "Diagnostics / App functionality" and say it is
not linked to identity.

Account deletion (Apple requirement): **not applicable**, since the app has no accounts.

---

## Content rating

Expect the lowest tier — no violence, no profanity, no gambling, no purchases.

The one question to answer carefully is whether users can **interact or share content**.
Answer **yes** (players can submit a name that others may see) and state that submissions
are moderated before publication. Answering "no" here would be inaccurate and is the kind
of mismatch that causes a rating to be revoked later.

---

## Assets

| Asset | Size | Where |
|---|---|---|
| App icon | 512×512 (Play), 1024×1024 (Apple) | `resources/icon.png` |
| Feature graphic (Play only) | 1024×500 | `resources/feature-graphic.png` |
| Phone screenshots | see `scripts/make-screenshots.mjs` | `store-assets/screenshots/` |

Play requires at least 2 phone screenshots; Apple requires at least one 6.7" iPhone set.
Both accept up to 10.
