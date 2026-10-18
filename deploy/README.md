# Deploying Jean

Jean is static files: no server of its own, no database. A deploy is `app/` as `npm run build:web` leaves it in `dist/web/`, served over HTTPS from one address that never changes, since each person's data stays in their browser, tied to that address.

```bash
npm ci && npm run build:web
```

`POLICY="$(cat policy.json)" npm run build:web` adds the organisation's `policy.json` and has `index.html` name it ([enterprise.md](../docs/enterprise.md#policy-model-sketch)).

| Where | How |
|---|---|
| A server reached over SSH | `DEPLOY_TO=host:/path npm run deploy` ([README](../README.md)) |
| Containers | [docker/](docker/README.md) |
| IIS | [iis/](iis/README.md) |
| Azure Static Web Apps | [azure/](azure/README.md) |
| Amazon S3 behind CloudFront | [aws/](aws/README.md) |
| Installing it on managed computers | [intune/](intune/README.md) |

Then open `policy.html` at the new address. It says whether the server sends what follows, and what the site's `policy.json` holds: what Jean doesn't read, what isn't the right shape, the addresses the site's own headers refuse, and, on a click, whether each address answers.

## The header set

Every file goes out with:

| Header | Value | Why |
|---|---|---|
| `Cache-Control` | `no-cache` | File names carry no version: each is checked again before use, and the service worker keeps them for offline use. |
| `X-Content-Type-Options` | `nosniff` | A file is only ever what its type says. |
| `Content-Security-Policy` | `frame-ancestors 'self'` | Only Jean frames Jean's pages. A `<meta>` can't say this, so it is a header. |
| `Strict-Transport-Security` | `max-age=31536000` | Wherever the host serves HTTPS itself; behind a proxy, the proxy sends it. |

Each page carries its own policy in a `<meta>`, so nothing else is needed. The organisation may add its own policy to the header: browsers enforce both, so it can only take away. `frame-ancestors 'self'; connect-src 'self' https://ai.corp.example` keeps Jean, its workers and the Computer to its own address and the AI gateway; list every other address Jean must still reach, such as the mirrors named in `urls` in the policy.

## Types

Browsers refuse a script, a style sheet or WebAssembly of the wrong type, and IIS refuses to serve a type it doesn't know. Text is UTF-8.

| Ending | Type |
|---|---|
| `.html` | `text/html` |
| `.js`, `.mjs` | `text/javascript` |
| `.css` | `text/css` |
| `.json` | `application/json` |
| `.webmanifest` | `application/manifest+json` |
| `.wasm` | `application/wasm` |
| `.svg` | `image/svg+xml` |
| `.png`, `.jpg`, `.webp` | `image/png`, `image/jpeg`, `image/webp` |
| `.woff2`, `.ttf` | `font/woff2`, `font/ttf` |
| `.txt`, `.md`, `.csv` | `text/plain`, `text/markdown`, `text/csv` |
| `.xml`, `.zip` | `application/xml`, `application/zip` |
| `.bcmap`, `.pfb`, `.sf3` | `application/octet-stream` |
| none (`LICENSE`) | `text/plain` |

## Also

- **Pages without `.html`:** `/privacy`, `/terms` and `/files` are `privacy.html`, `terms.html` and `files.html`, the addresses Jean links to (D356).
- **Compressed copies:** `build:web` writes each file that compresses beside itself in brotli (`.br`) and gzip (`.gz`). A host that can sends them as they are (nginx's `gzip_static`, Caddy's `precompressed br gzip`); any other compresses as it serves, and the copies can stay behind.
- **No fallback page:** an address that names no file is a 404, never `index.html`.
