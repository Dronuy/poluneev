# Architecture

```
                 ┌────────────────────────────────────────────────┐
                 │                Cloudflare edge                 │
                 │                                                │
   browser ──►   │  poluneev.com / staging.poluneev.com           │
                 │  (Cloudflare Pages — this repo, public/)        │
                 │                                                │
                 │  api.poluneev.com (Cloudflare Tunnel)           │
                 │      │                                          │
                 │      ▼                                          │
                 │  127.0.0.1:8000 on host PC (FastAPI in Docker, │
                 │  separate repo Dronuy/knee_mvp deployment/)     │
                 │                                                │
                 │  subscribe.poluneev.com (Cloudflare Worker —   │
                 │  this repo, worker/)                            │
                 │      │                                          │
                 │      ▼                                          │
                 │  KV namespace SUBSCRIBERS                       │
                 └────────────────────────────────────────────────┘
```

## Components

### Frontend (`public/`)

Static HTML/CSS/JS, served by Cloudflare Pages.

| File | Role |
|------|------|
| `index.html`               | landing — hero, what-we-do, roadmap, capabilities, PFI Engine extended, subscribe, founder, contact |
| `demo.html`                | live demo — sample cases, dual viewer, upload zone, result panel |
| `privacy.html`, `terms.html`, `404.html` | legal + 404 |
| `_redirects`               | legacy `/pfi-engine` → `/demo` 301 |
| `assets/css/{shared,main,demo}.css` | tokens, landing layout, demo viewer |
| `assets/js/main.js`        | mobile nav burger |
| `assets/js/subscribe.js`   | POSTs to `subscribe.poluneev.com` |
| `assets/js/api.js`         | POSTs to `api.poluneev.com/analyze` |
| `assets/js/viewer.js`      | slice scrubbing + SVG overlays |
| `assets/js/overlays.js`    | result-panel rendering (4 domain panels) |
| `assets/js/demo.js`        | orchestrator + upload state machine + folder-drop walker |

### Inference backend (Dronuy/knee_mvp `deployment/`, NOT in this repo)

Docker container at `127.0.0.1:8000` reached via Cloudflare Tunnel at
`api.poluneev.com`. CORS allowlist covers `poluneev.com`,
`staging.poluneev.com`, `poluneev.pages.dev`, `localhost`. See the
`knee_mvp` repo's `deployment/README.md`.

### Subscribe Worker (`worker/`)

Cloudflare Worker in TypeScript. POST `/subscribe` validates the email,
checks for duplicates, rate-limits by IP-hash bucket, and persists to
KV. See `worker/README.md` for setup, deploy, and operations.

## KV namespace structure

Single namespace `SUBSCRIBERS`, two key prefixes:

```
sub:<lowercased-email>          { email, ts_iso, ip_hash, ua, cf_country }   no TTL
rl:<ip-hash>:<bucket-hr>        "<int count>"                                3700 s TTL
```

`<ip-hash>` is `sha-256(CF-Connecting-IP)[:12]` (hex). Raw IPs are never
persisted.

`<bucket-hr>` is `floor(Date.now() / 3_600_000)` — current UTC hour.

### Operating the subscriber list

```powershell
cd C:\AI_projects\poluneev\worker
npm run list-subs                     # all keys with prefix sub:
wrangler kv key get --binding=SUBSCRIBERS "sub:someone@example.com"
```

For larger exports, write a one-shot Node script that lists with
prefix=`sub:` and `gets` each key. There's no scheduled job; the volume
is small.

## DNS

| Hostname | Cloudflare resource |
|---|---|
| `poluneev.com` (root)        | CF Pages — primary domain on `poluneev` project |
| `www.poluneev.com`           | CF Pages — alias of root |
| `staging.poluneev.com`       | CF Pages — preview / pre-cutover staging |
| `api.poluneev.com`           | CF Tunnel → host PC, port 8000 |
| `subscribe.poluneev.com`     | Worker `poluneev-subscribe` (custom-domain trigger) |

## Privacy boundary

* Inference uploads: PHI tags stripped server-side; original blob deleted within seconds; results not persisted past 5 min. See `privacy.html` § 2.
* Subscribe form: only the email + a hashed IP prefix + UA prefix are stored. No third-party processors. See `privacy.html` § 5.
* Static site: no third-party analytics or tracking cookies. CF may set its own short-lived security cookie for bot protection.
