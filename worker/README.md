# worker — poluneev-subscribe

Cloudflare Worker that backs the **Stay informed** form on `poluneev.com`.

* `POST /subscribe`  with body `{ "email": "..." }`
  → 200 success / 400 invalid / 409 duplicate / 429 rate-limit / 500 storage error
* `GET /healthz` → `{ ok: true }`

Storage: a single `SUBSCRIBERS` KV namespace, two key prefixes:

| Prefix | Purpose | TTL |
|---|---|---|
| `sub:<lowercased-email>` | one record per subscriber: JSON `{email, ts_iso, ip_hash, ua, cf_country}` | none (persistent) |
| `rl:<ip-hash>:<bucket-hr>` | rate-limit counter, ≤ 3 / hour / IP-hash | 3700 s |

PHI / privacy: raw IPs never leave the Worker — only `sha-256[:12]` hex
prefix is persisted alongside each subscriber. User-Agent truncated to
200 chars.

## One-time setup (Phase B.6a + B.6c)

```powershell
# 1. Create the KV namespace via dashboard:
#    https://dash.cloudflare.com/  →  Workers & Pages  →  KV  →  Create namespace
#    Name: SUBSCRIBERS  →  copy the namespace ID.

# 2. Paste the ID into wrangler.toml (replace REPLACE_WITH_KV_NAMESPACE_ID
#    on both `id` and `preview_id`).

# 3. Install wrangler + login (one-time per machine):
npm install -g wrangler
wrangler login            # opens browser for OAuth

# 4. Deploy:
cd C:\AI_projects\poluneev\worker
npm install               # picks up @cloudflare/workers-types for tsc
wrangler deploy
```

`wrangler deploy` prints the workers.dev URL —
`https://poluneev-subscribe.<account>.workers.dev`. Two paths to wire
the frontend at it:

### Option A — workers.dev URL (fastest, public-facing URL is opaque)

Update `public/assets/js/subscribe.js`:

```js
const SUBSCRIBE_URL = "https://poluneev-subscribe.<account>.workers.dev";
```

Commit, push, CF Pages redeploys.

### Option B — custom domain `subscribe.poluneev.com` (recommended)

In Cloudflare dashboard → Workers & Pages → poluneev-subscribe →
Settings → Triggers → **Add Custom Domain** → `subscribe.poluneev.com`.
Cloudflare provisions DNS + cert automatically. Then `subscribe.js`
already points at this URL — no frontend change needed.

## Operations

```powershell
# List all subscriber keys
cd C:\AI_projects\poluneev\worker
npm run list-subs

# Get one record
wrangler kv key get --binding=SUBSCRIBERS "sub:someone@example.com"

# Live-tail logs (during testing)
npm run tail

# Local dev (exercises the same code path against a `wrangler dev` mock KV)
npm run dev
```

Subscribers can be exported to a CSV by listing keys and getting each
record one at a time; for now this is operational scale, no scheduled
job required.
