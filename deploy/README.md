# Deploying Jean

Jean is static files: no server of its own, no database. A deploy is `app/` as `npm run build:web` leaves it in `dist/web/`, served over HTTPS from one address that never changes, since each person's data stays in their browser, tied to that address.

```bash
npm ci && npm run build:web
```

`POLICY="$(cat policy.json)" npm run build:web` adds the organisation's `policy.json` and has `index.html` name it ([enterprise.md](../docs/enterprise.md#policy-model-sketch)).

Or take a release Warehouse SAS signed, which needs no Node.js: check its signature and sums, then unzip it and add the `policy.json` and its `<meta>` by hand ([docs/trust/releases.md](../docs/trust/releases.md)).

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

- **Pages without `.html`:** `/privacy`, `/terms`, `/files` and `/check` are `privacy.html`, `terms.html`, `files.html` and `check.html`, and `/fr/privacy`, `/fr/terms` and `/fr/files` their French, the addresses Jean links to (D356, D438).
- **Compressed copies:** `build:web` writes each file that compresses beside itself in brotli (`.br`) and gzip (`.gz`). A host that can sends them as they are (nginx's `gzip_static`, Caddy's `precompressed br gzip`); any other compresses as it serves, and the copies can stay behind.
- **No fallback page:** an address that names no file is a 404, never `index.html`.

## Hosted copies

Warehouse SAS also serves copies of Jean itself, for an organisation with a subscription and for a trial (D456): each at the organisation's own address, `ai.acme.com` pointed at Warehouse SAS's server by a CNAME, or for a trial at a subdomain of jean.is. The server holds files and nothing else: one release every copy shares, and each address's `policy.json`. People's data stays on their devices, and their requests go from their browser to the brains, gateway and services their policy names, never through this server ([enterprise.md](../docs/enterprise.md#hosted-copies)).

Each address differs from the others in three things only: its `policy.json`; its `Content-Security-Policy`, the header set's `frame-ancestors 'self'` with a `connect-src` that keeps Jean to its own files and the addresses that policy has it reach; and the release it is pinned to, if any.

**The server, once.** jean.is's Caddy serves them, from a folder of their own, mounted read-only at `/srv/hosted` in Caddy's container. It holds:

- `releases/` and `current`, which `npm run deploy` writes from a build that names a policy and no address: `DEPLOY_TO=<server>:<folder> POLICY='{}' npm run deploy`. Its `index.html` names `policy.json`, which each address answers with its own. jean.is's build won't do: it carries jean.is's own pages and names jean.is. A signed release names no policy, so it would need its `<meta>` added.
- `tenants/`, a copy of `dist/tenants/`, which `npm run tenant` writes: a Caddyfile for every address, each address's `policy.json`, and `pinned`, the releases they are pinned to, which `npm run deploy` keeps beside the last five.

The server's Caddyfile has Caddy ask that Caddyfile's first site before any certificate on demand, then imports it:

```caddyfile
{
	on_demand_tls {
		ask http://127.0.0.1:8790/
	}
}

import /srv/hosted/tenants/Caddyfile
```

And one DNS record that organisations point at, with the server's A and AAAA records, not proxied; the registry's `target` names it.

**An address.** The registry is a JSON file, kept apart from this repository since it holds organisations' policies; `TENANTS` names it.

```bash
TENANTS=<registry.json> npm run tenant -- add ai.acme.com --policy acme.json
```

`add` lists the address, or replaces its entry, after checking its policy as `policy.html` would at that address: what this version doesn't read, which only warns, or reads otherwise; an address the address's own header would refuse; and what `ee/` says of the key there, whose origins must name `https://ai.acme.com`. Nothing is written while any address has a problem. The header's `connect-src` lists the origin of every address the policy has Jean fetch: its brains, or their providers', its sign-in, connections, collector and mirrors; it warns of Jean's own default addresses it refuses, such as the device's brain's weights, which a mirror in `urls` replaces.

- `--connect <origin>` adds one, such as the token endpoint a sign-in's issuer names.
- `--open` leaves Jean free to reach any address, for a trial where people bring their own brains.
- `--release <folder>` pins the address to one of the server's `releases/`.
- `remove <host>` takes it away, `list` lists them, and `write` writes `dist/tenants/` again.

Then copy `dist/tenants/` to the server, and have Caddy load it, which keeps what it had when the new configuration doesn't load:

```bash
rsync -r --delete dist/tenants/ <server>:<folder>/tenants/
```

```bash
ssh <server> docker exec <Caddy's container> caddy reload --config /etc/caddy/Caddyfile
```

**Certificates.** Caddy gets each address's certificate from Let's Encrypt on demand, at the first visitor's handshake, over TLS-ALPN on port 443, which Caddy holds itself; first it asks its ask site, which says yes only for an address listed. So an address can be listed before its DNS points at the server, Let's Encrypt is asked only once it does, and a name anyone else points at the server gets no certificate. The first visitor waits a few seconds; Caddy renews it after. Port 80 is Traefik's, which sends only jean.is on to Caddy, so `http://ai.acme.com` isn't redirected: give out the `https://` address. Caddy's on-demand certificates were chosen over a Traefik router per address because Caddy already ends TLS on 443 for jean.is, its gateway and the share host, and a router would ask for its certificate as soon as it exists, failing until the address's DNS points at the server.

**The organisation's own address.** A browser keeps each person's data with the address Jean is served from. At an address on its own domain, an organisation can later move its copy, to its own server or to another host, by changing one DNS record: the address stays, and so does everyone's data. A subdomain of jean.is ties that data to jean.is: leaving means a new address, and every person moving their data by backup and restore. So a trial may start at `acme.jean.is`, but a subscription should live at the organisation's own address from its first day. The organisation adds:

```text
ai.acme.com.  CNAME  <the name the registry's target gives>.
```

A subdomain, since a domain's apex can't be a CNAME. A CAA record on the domain must allow `letsencrypt.org`. The organisation's gateway must allow `https://ai.acme.com` as an origin, and its sign-in that address as a redirect. Then `https://ai.acme.com/policy.html` checks it all from the organisation's own browser. For a trial at a subdomain of jean.is, the CNAME goes in jean.is's own zone, and the trial key names `https://acme.jean.is`.
