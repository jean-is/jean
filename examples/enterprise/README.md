# Jean at work, on one computer

A complete setup for an organisation, small enough to read in a sitting. It runs three services: the organisation's sign-in, its AI gateway, and Jean, whose policy pins it to both. People sign in once with their work account. Jean then sends their token to the gateway's brains and to its MCP servers, so nobody pastes a key and the gateway knows who asks.

| Service | Image | Address | What it does |
|---|---|---|---|
| Jean | built from this checkout ([deploy/docker](../../deploy/docker/README.md)) | http://localhost:8080 | Serves Jean, with `policy.json` beside `index.html` |
| [Dex](https://dexidp.io) | `ghcr.io/dexidp/dex` | http://localhost:5556/dex | The sign-in: OpenID Connect, one person in its own list |
| [LiteLLM](https://docs.litellm.ai) | `ghcr.io/berriai/litellm` | http://localhost:4000 | The AI gateway: a brain at `/v1`, MCP servers at `/mcp/`, for whoever the sign-in vouches for |

Dex is the sign-in because it is one small binary configured by one file, with what Jean needs built in: public apps with PKCE, CORS for a page in a browser, refresh tokens, and access tokens the gateway can check. At work you keep the identity provider you have, as [Make it yours](#make-it-yours) says.

## Run it

You need Docker with Compose, and a brain for the gateway: a key to an OpenAI-compatible service, or Ollama on this computer. From this folder:

```bash
cp .env.example .env
```

In `.env`, set `LITELLM_MASTER_KEY` as it says, and name the brain.

```bash
docker compose up -d --build
```

The first build takes a few minutes. Then open http://localhost:8080 and sign in as `ana@example.com` with the password `password`.

## What happens

1. Jean reads `policy.json` and goes to the sign-in before anything shows (`signIn`). Dex sends Ana back with a code, and Jean trades it for tokens from the browser, with PKCE.
2. The only brain is the gateway's (`brains`, `"auth": "oidc"`). Each request carries Ana's access token as `Authorization: Bearer`, and Jean renews it before it ends.
3. `oidc_auth.py` checks the token at the gateway: its signature against Dex's keys, its issuer, its audience (`jean`) and its expiry. It then names Ana in LiteLLM's logs. A request without a valid token gets a 401.
4. Connections are on for everyone (`capabilities.preUnlock`). The gateway's MCP server is the organisation's connection (`connections`, `"auth": "oidc"`), sent the same token. It is in Settings › Connections, where people can't remove it.
5. The `Content-Security-Policy` header keeps Jean to its own address, the sign-in and the gateway, whatever its own policy allows.

## The files

- `compose.yaml`: the three services, each on `127.0.0.1` only.
- `policy.json`: what Jean reads ([enterprise.md](../../docs/enterprise.md#policy-model-sketch)). Its `$schema` lets an editor check it as you type, and `policy.html` at Jean's address checks it in the browser, with your site's headers.
- `dex.yaml`: the sign-in, with Jean as a public app whose only redirect is Jean's address.
- `litellm.yaml`: the gateway's brain and MCP server, and `oidc_auth.py`, which checks who asks.
- `.env.example`: the gateway's administrator's key and its brain.

## Make it yours

- **Addresses.** Give each service an HTTPS address of its own, such as `jean.corp.example`, `login.corp.example` and `ai.corp.example`. Then change them everywhere they appear: `issuer`, `redirectURIs` and `allowedOrigins` in `dex.yaml`, `OIDC_ISSUER` and `CONTENT_SECURITY_POLICY` in `compose.yaml`, and the policy. Browsers run Jean only on `localhost` or over HTTPS.
- **Your identity provider.** To sign in with Entra ID or any other OpenID Connect provider directly, put its issuer, Jean's app and the gateway's scope in `signIn`, as [Signing in at work](../../docs/enterprise.md#signing-in-at-work) shows. Then set `OIDC_ISSUER`, `OIDC_JWKS_URI` and `OIDC_AUDIENCE` to its issuer, its keys and the gateway's app. Or keep Dex in front of your directory with a [connector](https://dexidp.io/docs/connectors/), and give it a lasting `storage`: in memory, people sign in again after each restart.
- **The gateway's check.** `oidc_auth.py` is LiteLLM's custom auth. LiteLLM Enterprise's JWT auth does the same from its configuration, and can map the token's groups to teams and to the brains each may use.
- **More MCP servers.** Add each under `mcp_servers` in `litellm.yaml`, and a connection for it in the policy at `http://<gateway>/<name>/mcp`. One connection per server keeps each server's rules apart in Jean. One connection at `/mcp/` reaches them all, under one rule.
- **Services a browser can't reach**, such as Gmail or Slack, go through Jean's own gateway, the `gateway` profile of [deploy/docker](../../deploy/docker/README.md). Its `GATEWAY_CONFIG` follows [gateway.schema.json](../../app/schemas/gateway.schema.json).

## When it doesn't work

- **The sign-in comes back with an error, or the browser's console names CORS.** `allowedOrigins` in `dex.yaml` must be Jean's origin exactly, and `redirectURIs` its address with the final `/`.
- **Answers fail with 401.** The gateway refuses the token. `docker compose logs litellm` says why: usually an issuer that isn't the one browsers reach, or an audience that isn't the token's.
- **Answers fail otherwise.** `docker compose logs litellm` shows what the brain behind the gateway said.
