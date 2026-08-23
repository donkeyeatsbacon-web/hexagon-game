# Name-submission Worker

A tiny Cloudflare Worker that lets players submit a name for a solved puzzle **without logging into GitHub**. The game POSTs the submission here; the Worker validates it and opens a labeled GitHub issue using a token that lives only on the server.

```
browser (GitHub Pages)  ──POST {id,num,name,layout}──►  Worker  ──GitHub API──►  issue (label: name-submission)
                                                          │
                                          validates: real complete tiling + signature match
```

Your existing approval flow is unchanged: you review the issue, approve in `admin.html`, and it lands in `approved-names.json`.

## One-time setup

1. **Install Wrangler** (Cloudflare's CLI) and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Create a GitHub token** (fine-grained recommended):
   - GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*.
   - Repository access: **only** `donkeyeatsbacon-web/hexagon-game`.
   - Permissions: **Issues → Read and write** (nothing else).
   - Copy the token.

3. **Store the token as a Worker secret** (never commit it):
   ```bash
   cd worker
   wrangler secret put GITHUB_TOKEN
   # paste the token when prompted
   ```

4. **Deploy:**
   ```bash
   wrangler deploy
   ```
   Wrangler prints the Worker URL, e.g. `https://hexagon-name-submit.<your-subdomain>.workers.dev`.

5. **Point the game at it:** in `index.html`, set
   ```js
   const WORKER_URL = 'https://hexagon-name-submit.<your-subdomain>.workers.dev';
   ```
   commit, and push (GitHub Pages redeploys).

## Config (`wrangler.toml` `[vars]`)

| var | meaning |
|-----|---------|
| `GH_OWNER`, `GH_REPO` | repo that receives the issues |
| `SUBMISSION_LABEL` | label applied to each issue (`name-submission`) |
| `ALLOWED_ORIGINS` | comma-separated browser origins allowed to POST (your GitHub Pages origin, e.g. `https://donkeyeatsbacon-web.github.io`) |
| `TOTAL_SOLUTIONS` | must match the game's `TOTAL_SOLUTIONS` (only affects the `#num` label) |

Update a var and re-run `wrangler deploy`.

## Abuse protection (built in)

- **Hard per-IP rate limit** — Cloudflare's Rate Limiting binding (`RL` in `wrangler.toml`) caps each IP at **6 requests / 60s** by default. Every attempt counts, so spamming invalid submissions is throttled too. Returns HTTP 429 when exceeded.
- **Honeypot** field — bots that fill it are silently dropped.
- **Solution validation** — the Worker recomputes the tiling from the submitted layout and rejects anything that isn't a *complete, non-overlapping, on-board* fill, and whose signature doesn't match the claimed id. So you can't spam names for fake/partial boards.
- **CORS allow-list** — only your site's origin can call it from a browser.

### Tuning / disabling the rate limit
In `wrangler.toml`:
```toml
[[unsafe.bindings]]
name = "RL"
type = "ratelimit"
namespace_id = "1001"                 # any integer unique to this limiter in your account
simple = { limit = 6, period = 60 }   # max requests per window; period must be 10 or 60 (seconds)
```
- Raise/lower `limit` to taste. `period` can only be **10** or **60**.
- To **disable**, delete that `[[unsafe.bindings]]` block — the Worker skips limiting when the binding isn't present (fail-open), and also fails open if the limiter service is briefly unavailable.
- Re-run `wrangler deploy` after any change.

## Local test
```bash
wrangler dev        # runs the Worker locally
# then POST a solved layout to http://localhost:8787
```
