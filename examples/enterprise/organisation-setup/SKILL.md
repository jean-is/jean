---
name: organisation-setup
description: Set up an organisation's own copy of Jean, the assistant in a browser tab, from the example in jean-is/jean's examples/enterprise. It covers the organisation's name, logo and colours, its sign-in, its AI gateway, its connections and its house rules, then checks the result. Use when someone in IT asks to deploy, brand or configure Jean for their company, school or administration.
---

# An organisation's own copy of Jean

Jean is static files. An organisation makes them its own without changing them. It serves them with one `policy.json` beside `index.html` and one header. Everything here produces those two, plus, when the organisation has none yet, a sign-in and an AI gateway to try them with.

What you deliver:

- `policy.json`: the name, the look, the brains, the sign-in, the connections and the house rules.
- The `Content-Security-Policy` header, which keeps Jean to the addresses the policy names.
- The sign-in's and the gateway's part, as files when you run them, or as a checklist for whoever administers them.
- A check that passes: `policy.html`, first on this computer, then at the organisation's address.

## What to read, not guess

These come from the repository, https://github.com/jean-is/jean, at the version the organisation deploys. They are the truth whenever they and this skill disagree:

- `examples/enterprise/`: a sign-in (Dex), a gateway (LiteLLM) and Jean, working together on one computer. Its README's "Make it yours" lists every place an address appears.
- `app/schemas/policy.schema.json`, also served by every copy of Jean at `/schemas/policy.schema.json`: every field Jean reads. Never write a field it doesn't have.
- `docs/enterprise.md`: what each part of the policy does, signing in at work (Entra ID step by step) and hosted copies.
- `deploy/README.md`: the header set, the file types, and recipes for IIS, Azure Static Web Apps, S3 behind CloudFront and a container.

Without a terminal, as when Jean itself follows this skill, write `policy.json` and the checklists below, and leave the files and servers to the person.

## Ask first

Ask in one message, and only what neither the person nor their files have told you. A brand book, a PowerPoint template or a logo file answers the first question: take the colours, the typeface's feel and the logo from it.

1. **Name and look:** the organisation's name, its logo (SVG best, or PNG), its colours as `#rrggbb`, and the languages people work in.
2. **Sign-in:** Entra ID, Okta, Google Workspace, another OpenID Connect provider, or none yet. With none, the example's Dex is enough to try.
3. **Brains:** the AI gateway they already have (LiteLLM, Portkey, Azure API Management, Bifrost…), with its address and the names of its models. Or the example's LiteLLM, in front of a provider they have a contract with.
4. **Connections:** the MCP servers everyone should have, and how each checks who asks.
5. **House rules:** what every answer should follow, in a sentence or two.
6. **Where it runs:** their own server, and which kind, or a copy Warehouse SAS hosts for them. Also the address, such as `https://ai.acme.com`. People's data stays tied to that address in their browsers, so choose it once.

## Write the policy

Start from this, keep what they need and drop the rest:

```json
{
  "$schema": "https://jean.is/schemas/policy.schema.json",
  "signIn": { "issuer": "https://login.microsoftonline.com/<tenant-id>/v2.0", "clientId": "<Jean's app>", "scopes": ["openid", "profile", "email", "offline_access", "api://<gateway-app>/chat"] },
  "brains": [{ "id": "acme", "provider": "custom", "api": "openai", "baseURL": "https://ai.acme.example/v1", "model": "<the gateway's name for it>", "label": "Acme AI", "auth": "oidc" }],
  "instructions": "Acme's house rules, in a sentence or two.",
  "locales": ["en", "fr"],
  "look": { "name": "Acme", "on": "minimal", "accent": "#e30613", "font": "sans", "logo": "data:image/svg+xml;base64,PHN2Zy8+" },
  "kit": { "name": "Acme", "tokens": { "primary": "#e30613", "ink": "#1f2933", "voice": "calm", "logo": "data:image/svg+xml;base64,PHN2Zy8+" } },
  "capabilities": { "deny": ["scores", "games"], "preUnlock": ["connections", "machine", "documents", "tables", "slides", "projects", "browser", "search", "routines"] },
  "connections": [{ "id": "wiki", "name": "Wiki", "url": "https://ai.acme.example/wiki/mcp", "auth": "oidc" }]
}
```

- **Everything in it is public.** Anyone who opens the address can read `policy.json`. Never put a key, a password or a client secret in it. Jean signs in as a public app with PKCE, so it has no secret. The gateway's own keys go in its `.env`, which is never committed.
- **The logo:** the file's base64 in place of `PHN2Zy8+`, in `look.logo` and `kit.tokens.logo`. Jean takes no picture from the web. A mark about as wide as it is tall reads best beside Jean's name and on the browser's tab. Keep it to a few kilobytes: remove an SVG's metadata, and scale a PNG down to 256 pixels or so.
- **The look:** `look` is the theme Jean opens in, built `on` one of Jean's own. `accent` is the organisation's main colour. `kit` is the look of what people make: Word documents, prints and slides. With only their theme to offer, add `"looks": []`.
- **The name:** `look.name` names the theme, and each brain's `label` is what people see answer. Jean keeps its own name unless they ask for theirs: then `name` in the policy, such as `"Acme Assistant"`, and in the container `APP_NAME` too, so that an install has it. Never change the source for it.
- **The sign-in's scopes:** with `signIn.scopes`, Jean asks for `openid` and those alone, as written. List `profile`, `email` and `offline_access` beside the gateway's scope, or people lose their name and are asked to sign in again each time a token ends. Leave `scopes` out only when the gateway needs no scope of its own, as with the example's Dex.
- **Capabilities:** `preUnlock` turns on from the start what people use at work, and `deny` turns off what the organisation doesn't want. The lists above are the example's.
- **Addresses** are `https://`. `http://` works only on `localhost`.
- **Enterprise parts** (`groups`, `audit`, `dlp`, `session`, `retention`, `seal`, `trust`) need a key outside `localhost`. Add them only when asked, and say a key is needed: free under 250 people, asked for at https://jean.is/enterprise/key.

## The header

`connect-src` lists `'self'` and the origin of every address the policy names: the sign-in's issuer, the gateway, each connection. The example's is:

```
Content-Security-Policy: connect-src 'self' http://localhost:5556 http://localhost:4000
```

`deploy/README.md` gives the rest of the header set and how each kind of server sends it. Never loosen the header to make an error go away. Fix the address instead.

## The sign-in and the gateway

- **Entra ID:** register Jean as a single-page application, with Jean's address, final `/` included, as its redirect URI. On the gateway's own app, expose a scope with v2 access tokens and grant Jean's app consent for it; `signIn.scopes` lists it with `openid`, `profile`, `email` and `offline_access`. Name the issuer by tenant ID. `docs/enterprise.md` has each step. Hand them over as a checklist for whoever administers the tenant: never change a production tenant or gateway yourself unless the person asks you to.
- **Another OpenID Connect provider:** its issuer and Jean's client id, and, when the gateway needs a scope of its own, every scope the sign-in asks for, `offline_access` among them for refresh tokens. Its discovery and token endpoints must answer Jean's origin with CORS.
- **The gateway** checks each request's token: its signature, its issuer, its audience and its expiry, as `oidc_auth.py` does for LiteLLM. It answers Jean's origin with CORS for `Authorization`, `Content-Type`, `Mcp-Protocol-Version`, `Mcp-Method` and `Mcp-Name`.
- **Keeping the example's Dex or LiteLLM:** change every address where the README's "Make it yours" says it appears, put the brand in `brand/`, and give Dex a lasting `storage` beyond a trial.

## Try it, then check it

With a terminal, try it on this computer first, where no key is needed:

1. Copy `examples/enterprise/` to a folder of the organisation's own, and put their `policy.json` and `brand/` in it.
2. Outside the repository, replace the `jean` service's `build:` with `image: ghcr.io/jean-is/jean:latest`, or the version they deploy.
3. Run `docker compose up -d`, open http://localhost:8080, sign in, and look: their logo beside Jean's name, their theme, their brain answering.
4. Open http://localhost:8080/policy.html. It must find nothing wrong. Then open `policy.html` at the organisation's address once it is served there.

Without a terminal, `policy.html` at any copy of Jean, https://jean.is/policy among them, checks a `policy.json` chosen on the page before it goes up.

## Hand over

End with:

- the files and what each is for;
- what is left, and for whom: the identity provider's administrator, the gateway's owner, whoever runs the web server;
- the address, and the last result of `policy.html`.

For a hosted copy, the organisation sends `policy.json` and its address to Warehouse SAS, who puts them up.
