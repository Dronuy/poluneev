# poluneev

Frontend for **poluneev.com** — Andrei Poluneev's diagnostic-radiology AI
products. The first deployed module is the **PFI Engine**, a fully
automated knee MRI analysis pipeline producing 14 quantitative
patellofemoral instability indices and a structured clinical output.

This repository hosts the **static site** served by Cloudflare Pages.
The inference backend lives in a separate repository
(`Dronuy/knee_mvp`, the `deployment/` subfolder) and is reached at
`https://api.poluneev.com`.

```
poluneev.com         CF Pages  ->  this repo (static HTML/CSS/JS)
api.poluneev.com     CF Tunnel ->  127.0.0.1:8000 (FastAPI on host PC)
```

## Layout

| Path | Purpose |
|------|---------|
| `public/index.html`           | landing page |
| `public/demo.html`            | live demo — 5 sample cases + DICOM upload |
| `public/privacy.html`         | privacy policy |
| `public/terms.html`           | terms of use |
| `public/404.html`             | branded not-found |
| `public/robots.txt`           | crawl directives |
| `public/_redirects`           | CF Pages redirects (e.g. `/demo` -> `/demo.html`) |
| `public/assets/css/`          | `shared.css` (tokens + nav/footer), `main.css`, `demo.css` |
| `public/assets/js/`           | `main.js`, `demo.js` (state machine), `viewer.js`, `overlays.js`, `api.js` |
| `public/assets/data/`         | 5 sanitized demo case JSONs |
| `public/assets/img/<case>/sag,ax/*.png` | pre-rendered slices for sample cases |
| `docs/`                       | internal: `DEPLOYMENT.md`, `ARCHITECTURE.md` (not served) |

## Development

```powershell
# Live preview (any static server). Example:
cd C:\AI_projects\poluneev\public
python -m http.server 8080
# Open http://localhost:8080
```

API base URL is set in `public/assets/js/api.js`:
* local dev:  `http://localhost:8000` (your backend container)
* staging:    `https://api.poluneev.com`
* production: `https://api.poluneev.com`

The local-dev branch picks up via `window.location.hostname === "localhost"`.

## Disclaimer

Research preview. Not a medical device. Findings here do not replace
clinical judgement. See `public/privacy.html` and `public/terms.html`.
