# Jean in a container

Jean is static files, so a container only serves them (D232). This folder builds three images from the repository:

- **`jean`** serves Jean with nginx, without root, on port 8080. It holds exactly what a web deploy serves and nothing else: no tooling, tests or docs.
- **`jean-gateway`** is optional. It runs [the gateway](../../README.md#run-it) on Node, on port 8787, for the services a browser can't reach, like Gmail, Microsoft 365 or Slack (D191).
- **`jean-relay`** is optional. It runs [the relay](../../relay/relay.js) on Node, on port 8791: the meeting point for a person's devices and the people they send to (D45 · D226), which later versions of Jean use, and which an organisation runs to keep that with it.

Jean and the gateway keep no data. The relay keeps sealed messages it can't read, 7 days at most, each mailbox until 90 days without use, and a record of each change (its time, address, port and mailbox) for a year, as French law asks of a host: sealed to a key of yours when `RELAY_CONFIG` names one, plain text otherwise. Conversations and files stay in each person's browser, tied to the address Jean is served from. Choose that address once: moving it means everyone exports their data and imports it again.

You need Docker 23 or later with Compose, or any engine with BuildKit.

## Run it

The images are ready-made in the repository's packages, for `linux/amd64` and `linux/arm64`:

```bash
docker run -d -p 8080:8080 ghcr.io/jean-is/jean:latest
```

`latest` and a version's number, like `0.9`, are the versions tagged; `edge` follows `main`, and `sha-` followed by a commit's first seven characters is that commit. The gateway is `ghcr.io/jean-is/jean-gateway`, with the same tags, and the relay `ghcr.io/jean-is/jean-relay`, `edge` and `sha-` from `main` until the next version tagged gives it `latest` and a number. Each image carries its build's provenance and its bill of materials, which `docker buildx imagetools inspect` shows with `--format '{{ json .Provenance }}'` or `'{{ json .SBOM }}'`.

To build them yourself, use a checkout of the version you deploy: the image takes the folder as it is, uncommitted changes included. From this folder:

```bash
docker compose up -d --build
```

Jean is at http://localhost:8080. Browsers only run it on `localhost` or over HTTPS, so on any other address put it behind your HTTPS reverse proxy, ingress or load balancer. The proxy also adds HSTS.

With the gateway:

```bash
docker compose --profile gateway up -d --build
```

With the relay:

```bash
docker compose --profile relay up -d --build
```

Without Compose, from the repository's root:

```bash
docker build -f deploy/docker/Dockerfile -t jean .
```

```bash
docker run -d -p 8080:8080 jean
```

`--target gateway -t jean-gateway` builds the gateway the same way, and `--target relay -t jean-relay` the relay.

## Configure it

Settings go in the shell's environment or in a `.env` file beside `compose.yaml`.

**Policy.** Write a `policy.json` beside `compose.yaml` and uncomment the `volumes` lines under `jean`, so it is served at `/srv/policy.json` in place of the image's empty one. It can pin the brain to your AI gateway, deny capabilities, lock rules, replace every outside address, and more ([enterprise.md](../../docs/enterprise.md#policy-model-sketch)). With the empty one, Jean runs as the open version does. [examples/enterprise/](../../examples/enterprise/README.md) adds a sign-in, an AI gateway and a relay beside this image, and a policy pinning Jean to them.

**Your privacy policy and terms.** The welcome links to `privacy.html` and `terms.html`, which are jean.is's, published by Warehouse SAS. Name your own in the policy, or none with `""`:

```json
{ "urls": { "privacy": "https://intranet.corp.example/jean/privacy", "terms": "" } }
```

**Its name.** `APP_NAME` is what people see Jean called, in the room and when they install it, on their computer's list of apps:

```bash
APP_NAME="Acme Assistant"
```

As it starts, the container writes `brand.js` and the install's manifests with that name into `/tmp/app-name`, which it serves in place of its own. Nothing to mount, and a new version keeps the name. The policy's `name` does the same in the room, wherever Jean is served, but an install takes its name from the manifest, so set `APP_NAME` before people install it. A name on more than one line is refused, and Jean keeps its own.

**A stricter policy for the browser.** `CONTENT_SECURITY_POLICY` adds a header to every file. Browsers enforce it on top of the policy in Jean's own pages, so it can only take away. This one keeps Jean, its workers and the Computer to its own address and your AI gateway:

```bash
CONTENT_SECURITY_POLICY="connect-src 'self' https://ai.corp.example"
```

List every other address Jean must still reach, such as the mirrors named in `urls` in the policy.

**The gateway.** `GATEWAY_CONFIG` names the addresses Jean is served from, and optionally the hosts it relays to and the apps you registered with their secrets ([gateway.js](../../gateway/gateway.js), [its schema](../../app/schemas/gateway.schema.json)). Its secrets stay in this variable, never in a file:

```bash
GATEWAY_CONFIG='{"origins":["https://jean.corp.example"]}'
```

Give the gateway an HTTPS address of its own, such as `https://gateway.corp.example`, rather than a path under Jean's, so that every request from Jean names its origin. Then name the gateway in the policy, and turn Connections on for everyone:

```json
{ "urls": { "gateway": "https://gateway.corp.example/" }, "capabilities": { "preUnlock": ["connections"] } }
```

**The relay.** `RELAY_CONFIG` names the addresses Jean is served from, which alone may use it, and the public half of the key that seals its records of each change, as French law asks of a host ([relay.js](../../relay/relay.js), [serve.js](../../relay/serve.js)). Without `origins`, it refuses everyone:

```bash
RELAY_CONFIG='{"origins":["https://jean.corp.example"]}'
```

`node host/serve.js keys`, in a checkout, makes the records' key pair: its public half goes in `recordKey`, and its private half stays offline. The relay keeps its mailboxes in the volume at `/data`. Give it an HTTPS address of its own, such as `https://relay.corp.example`. Behind a reverse proxy, set `RELAY_PROXIED=1` and have the proxy send the visitor's address as the last `X-Forwarded-For` entry and its port as `X-Client-Port` (Caddy: `header_up X-Client-Port {remote_port}`, as [Jean's own server](../server/Caddyfile) does), so that limits and records name each visitor rather than the proxy. Then name it in the policy; with none named, there is none:

```json
{ "urls": { "relay": "https://relay.corp.example/" } }
```

## What the image does

- Serves `app/` as `npm run build` leaves it, as `shippedFiles()` in `scripts/desktop.js` lists it: without its types, dotfiles or Markdown. It adds a `<meta name="app-policy">` to `index.html` and an empty `policy.json` beside it, so Jean reads a mounted policy, and finds an empty one rather than a 404 without it.
- Sends `Cache-Control: no-cache` and `X-Content-Type-Options: nosniff` with every file, plus `Content-Security-Policy: frame-ancestors 'self'`, so that only Jean frames Jean's pages. File names carry no version, so each file is checked again before use, and the service worker keeps them for offline use.
- Answers a page at its address without `.html` too, as jean.is does: `/check` is `check.html`.
- With `APP_NAME`, serves `brand.js` and the manifests from `/tmp/app-name`, written by `/docker-entrypoint.d/40-app-name.sh` as it starts.
- Compresses text and WebAssembly with gzip, and serves `.mjs`, `.wasm` and `.webmanifest` files with the types browsers require.

## Update it

Pull the new version, or build again from it, and replace the container. Each open Jean finds the new version and offers it, and people keep their data.

## Kubernetes and other orchestrators

`jean` runs as user 101 and listens on 8080. `jean-gateway` runs as user 1000 and listens on 8787. `jean-relay` runs as user 1000, listens on 8791 and writes to `/data`, which needs a persistent volume of its own that user 1000 can write to, such as one with `securityContext.fsGroup: 1000`. With a read-only root filesystem, `jean` needs `/tmp` and `/etc/nginx/conf.d` to be writable, for example as `emptyDir` volumes: as it starts, it writes its configuration to the second one. A probe can ask for `/`.
