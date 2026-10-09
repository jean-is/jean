# Jean in a container

Jean is static files, so a container only serves them (D232). This folder builds two images from the repository:

- **`jean`** serves Jean with nginx, without root, on port 8080. It holds exactly what a web deploy serves and nothing else: no tooling, tests or docs.
- **`jean-gateway`** is optional. It runs [the gateway](../../README.md#run-it) on Node, on port 8787, for the services a browser can't reach, like Gmail, Microsoft 365 or Slack (D191).

Neither keeps any data. Conversations and files stay in each person's browser, tied to the address Jean is served from. Choose that address once: moving it means everyone exports their data and imports it again.

You need Docker 23 or later with Compose, or any engine with BuildKit.

## Run it

Build from a checkout of the version you deploy: the image takes the folder as it is, uncommitted changes included. From this folder:

```bash
docker compose up -d --build
```

Jean is at http://localhost:8080. Browsers only run it on `localhost` or over HTTPS, so on any other address put it behind your HTTPS reverse proxy, ingress or load balancer. The proxy also adds HSTS.

With the gateway:

```bash
docker compose --profile gateway up -d --build
```

Without Compose, from the repository's root:

```bash
docker build -f deploy/docker/Dockerfile -t jean .
```

```bash
docker run -d -p 8080:8080 jean
```

`--target gateway -t jean-gateway` builds the gateway the same way.

## Configure it

Settings go in the shell's environment or in a `.env` file beside `compose.yaml`.

**Policy.** Write a `policy.json` beside `compose.yaml` and uncomment the `volumes` lines under `jean`, so it is served at `/srv/policy.json` in place of the image's empty one. It can pin the brain to your AI gateway, deny capabilities, lock rules, replace every outside address, and more ([enterprise.md](../../docs/enterprise.md#policy-model-sketch)). With the empty one, Jean runs as the open version does.

**A stricter policy for the browser.** `CONTENT_SECURITY_POLICY` adds a header to every file. Browsers enforce it on top of the policy in Jean's own pages, so it can only take away. This one keeps Jean, its workers and the Computer to its own address and your AI gateway:

```bash
CONTENT_SECURITY_POLICY="connect-src 'self' https://ai.corp.example"
```

List every other address Jean must still reach, such as the mirrors named in `urls` in the policy.

**The gateway.** `GATEWAY_CONFIG` names the addresses Jean is served from, and optionally the hosts it relays to and the apps you registered with their secrets ([gateway.js](../../gateway/gateway.js)). Its secrets stay in this variable, never in a file:

```bash
GATEWAY_CONFIG='{"origins":["https://jean.corp.example"]}'
```

Give the gateway an HTTPS address of its own, such as `https://gateway.corp.example`, rather than a path under Jean's, so that every request from Jean names its origin. Then name the gateway in the policy, and turn Connections on for everyone:

```json
{ "urls": { "gateway": "https://gateway.corp.example/" }, "capabilities": { "preUnlock": ["connections"] } }
```

## What the image does

- Serves `app/` as `npm run build` leaves it, as `shippedFiles()` in `scripts/desktop.js` lists it: without its types, dotfiles or Markdown. It adds a `<meta name="app-policy">` to `index.html` and an empty `policy.json` beside it, so Jean reads a mounted policy, and finds an empty one rather than a 404 without it.
- Sends `Cache-Control: no-cache` and `X-Content-Type-Options: nosniff` with every file, plus `Content-Security-Policy: frame-ancestors 'self'`, so that only Jean frames Jean's pages. File names carry no version, so each file is checked again before use, and the service worker keeps them for offline use.
- Compresses text and WebAssembly with gzip, and serves `.mjs`, `.wasm` and `.webmanifest` files with the types browsers require.

## Update it

Build again from the new version and replace the container. Each open Jean finds the new version and offers it, and people keep their data.

## Kubernetes and other orchestrators

`jean` runs as user 101 and listens on 8080. `jean-gateway` runs as user 1000 and listens on 8787. With a read-only root filesystem, `jean` needs `/tmp` and `/etc/nginx/conf.d` to be writable, for example as `emptyDir` volumes: as it starts, it writes its configuration to the second one. A probe can ask for `/`.
