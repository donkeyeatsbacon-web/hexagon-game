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
Fit the coloured pieces into the hexagon. Two boards, easy to learn.
```

**Full description** (max 4000)
```
Fourteen coloured pieces. One hexagonal board. Every cell must be filled, and nothing may overlap.

Or take the smaller board: nine pieces, a quicker puzzle, and a collection of its own.

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
• Overlapping or overhanging cells flash white, so a mistake is never hidden

TWO BOARDS

Classic is fourteen pieces across sixty-one cells. Small is nine pieces across thirty-seven — faster to finish, and a gentler place to learn the controls. Each board remembers its own unfinished game and keeps its own collection of solutions.

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

## Data safety (Play Console) — question by question

Verified against the app, not just intended: the only outbound requests are a GET for the
published names and the POST that submits one. There is no analytics, crash-reporting or
advertising SDK anywhere in the Android build.

### Step 1 — Data collection and security

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | The optional solution name |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | HTTPS to the Worker; the app makes no plaintext requests |
| Do you provide a way for users to request that their data is deleted? | **Yes** | By email, stated in the privacy policy |

Deletion request URL: `https://donkeyeatsbacon-web.github.io/hexagon-game/privacy.html`

### Step 2 — Data types

Tick exactly one box, under **App activity**:

> **Other user-generated content**

Leave every other category unticked — Location, Personal info, Financial info, Health and
fitness, Messages, Photos and videos, Audio, Files and docs, Calendar, Contacts, App
interactions, In-app search history, Installed apps, Web browsing, App info and performance
(crash logs, diagnostics), and Device or other IDs. None of them are touched: the game has
no accounts, no identifiers, no analytics and no ads, and it requests only INTERNET and
VIBRATE.

### Step 3 — Details for "Other user-generated content"

| Question | Answer |
|---|---|
| Collected | **Yes** |
| Shared | **Yes** — see the note below |
| Processed ephemerally | **No** — an approved name is stored and published |
| Required or optional | **Optional** — the game is fully playable without ever submitting one |
| Purposes | **App functionality** only |

**Why "Shared" is Yes.** A submitted name is sent to a Cloudflare Worker, which opens an
issue on a *public* GitHub repository. That issue is world-readable from the moment it is
created — before any approval, and it stays readable even if the name is rejected and the
issue closed. An approved name is then published to every player who finds that solution.
Answering "No" here would be wrong. The privacy policy already says a submission "creates a
public entry for review", so the two agree.

### On the IP address

Visible to Cloudflare while a submission is rate-limited, never stored with the name and
never used to profile anyone. Data used transiently and not retained can be left undeclared,
and IP is not one of Play's listed data types. If you would rather be conservative, there is
nowhere natural to put it on this form — the honest place is the privacy policy, where it is
already described.

### Keep these consistent

The Data safety form, [privacy.html](privacy.html) and the store description all say the
same thing: no accounts, no ads, no tracking, one optional published name. If you ever add
analytics or ads, all three have to change together, and the listing line "No advertising.
No tracking." has to go.

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
