# Enterprise readiness and future features

Nothing planned is ruled out by the architecture:

- **Backup and sync** need no server at all.
- **Sharing by link and requests between people's Jeans** each need a small server, optional and self-hostable, that keeps or forwards only what it can't read.
- **Enterprise control works the web way:** enforcement comes from the organisation's own hosting, security headers and AI gateway, not from rules inside Jean.

## Feature readiness

| Feature | Verdict | How, without a Jean server |
|---|---|---|
| Backup, import/export | ✅ Trivial | Data is plain files: a zip in, a zip out. On Chrome and Edge, mirroring to a real folder is continuous backup. |
| Sync across my devices | ✅ | Four routes: <br>• A mirrored folder plus the user's existing sync tool (OneDrive, iCloud, Dropbox, Syncthing). Built in Chrome and Edge and the desktop app (D157). <br>• Each project to its own place, or kept on the device: work projects through the work drive, personal ones through the personal one (D227). <br>• A drive's own API, with OAuth in the browser, for phones, Safari and Firefox: Dropbox first, its app key from settings or policy (`sync`), then OneDrive with an app IT registers in Entra, and Google Drive through the gateway (D227). <br>• The phone as a remote of the Jean open on a laptop or at work, over the relay (D45 · D226, D227). |
| Share | ⚠️ Needs an optional host | Files through the native share sheet (Web Share API). A task, or one page, chart, deck or picture, as a link to an end-to-end-encrypted copy on a host that can't read it: hst.ing for jean.is, the organisation's own copy, or none (`urls.share`, `rules.share`, D361, [sharing.md](sharing.md)). Skills are `SKILL.md` files, which also work in Claude, Codex and similar tools. |
| Working together | ⚠️ Needs an optional server | A shared link opens in the recipient's own Jean, to continue with their brain and keys (D361). With no server, a project shared through a shared drive folder (D227). Then requests between people's Jeans, each answered by the person's own Jean and approved by them, over a tiny relay hosted by the maintainer on a subdomain of Jean's domain, which forwards end-to-end-encrypted traffic it can't read. Organisations can self-host it and point policy at their copy, or switch it off (D45 · D226). No editing live together: a call's screen sharing already does it. |
| Force a model or gateway | ✅ | The organisation self-hosts Jean by copying `dist/web/` (`npm run build:web`), with a `policy.json` next to `index.html`, enabled by adding `<meta name="app-policy" content="policy.json">` to `index.html` (`POLICY='{…}' npm run build:web` does both, D344), or has Warehouse SAS host it at its own address ([Hosted copies](#hosted-copies), D456). The policy pins the brain to their gateway (LiteLLM, Portkey, Cloudflare AI Gateway, Azure APIM); Jean already speaks the OpenAI-compatible format. Users sign in with the organisation's account at the first visit (OpenID Connect with PKCE, Entra ID first), and the gateway gets the token ([Signing in at work](#signing-in-at-work), D385). The gateway handles audit, cost and data-loss prevention; Jean builds no admin console. |
| Hard enforcement | ✅ Via CSP | Browsers enforce every policy they receive, and all of them must pass. One HTTP header, `connect-src 'self' https://ai.corp.example`, means Jean cannot reach anything else, whatever its own built-in policy allows. No files need editing. `connect-src 'self'` alone gives a local-only mode. |
| Forced proxy | ✅ Not Jean's job | Web pages can't set proxies. The browser or OS proxy policy (`ProxySettings`, PAC files) already applies to every request Jean makes, the Computer's included, since Jean makes them. Jean's duty is to make every external URL configurable so it can point to internal mirrors, and, for sites that refuse other sites' requests, to send the Computer's through a relay the organisation names (`computer.relay` in policy, D162). |
| Encryption at rest | ✅ | Every file Jean keeps on a device is sealed with AES-256-GCM, its key behind the device's own until a lock keeps it behind the person's passkey or password, with a recovery code; `"lock": "required"` in policy asks for one at the first run and hides Turn off, and denying `lock` never offers it. Backups and Sync's folder stay readable copies ([encryption.md](encryption.md), D371). |
| Disable capabilities | ✅ Comes for free | The policy feeds the unlock gate. A denied capability is never offered and its code is never downloaded. Admins can also unlock capabilities in advance. |
| Config for managed browsers | ✅ Chrome and Edge only | `ManagedConfigurationPerOrigin` pushes JSON to web apps that IT has installed, read with `navigator.managed.getManagedConfiguration()`. It is a second policy source alongside `policy.json`. |
| White-label | ✅ Comes for free | Change `BRAND` and it becomes "Acme Assistant". |
| Company projects | ✅ | Project templates with locked instructions, skills, brain and rules (e.g. "Contract review", pinned to the gateway). An organisation can also publish its skills in a discovery index that policy points to (`skills.sources`, which users can't remove; `skills.only` keeps to it), and users add them after reading their steps (D121). Extensions it offers ready-made are a list of their addresses (`extensions.ready`), each read before it is added (D535). Its catalogue of projects, what other products call agents (instructions, skills, connections without their secrets, a way of being), can be published the same way, each added after reading it. |
| Audit | ✅ Best effort | The ACP event stream, which the `record` event follows (D299), and what is done outside it, the skills, connections, routines and links added or removed and the answers taken away (`act`, D421), are mapped to OpenTelemetry GenAI conventions and sent to the organisation's collector ([Audit to OpenTelemetry](#audit-to-opentelemetry), D386). The gateway's log remains the authoritative one. |
| Retention | ✅ Best effort | What leaves a task, deleted or left out by asking a request again, is kept first for the period policy names, certificates included, as the AI Act asks of a high-risk use ([Retention](#retention), D412). Clearing the site's data still takes it. |
| The organisation's seal | ✅ | Answers' certificates and pictures' Content Credentials sealed under a certificate the organisation's authority gives the device's key over EST, or by the organisation's qualified seal at a qualified provider through the CSC API, carrying what checks them later (JAdES B-LT); the check page and Jean say whether an authority the organisation trusts vouches for a seal, and whether it is a qualified one ([The organisation's seal](#the-organisations-seal), D434, D436, D437). |
| Data residency | ✅ | Policy's brains declare their jurisdiction, and `jurisdictions` keeps requests to brains within the places it lists ([Data residency](#data-residency), D434). |

## What it cannot do, by design

These follow from keeping data on the device with no server. Companies already cover them with device management (MDM) and gateways.

- Guarantee anything on unmanaged devices. Rules inside the browser are advisory; real enforcement is the CSP header, network filtering and the gateway.
- Provide an authoritative audit of local actions.
- Remotely wipe or revoke data already on a device.
- Run scheduled jobs while no tab is open; that would need an optional runner. Routines run while Jean is open, and catch up at the next visit (D122).
- Hold jean-cli to policy (D241). It isn't served from the organisation's address, so it reads none: where Jean must keep to policy, block `npx jean-cli` with the machine's own controls.

## Open and enterprise

Jean is open core (D139). Everything a person or a team uses is MIT. What only an organisation's IT, security or compliance team asks for lives in `ee/`, under the [Elastic License 2.0](../app/ee/LICENSE) plus an [additional grant](../app/ee/GRANT.md), and needs a key.

| Area | Open (MIT) | Enterprise (`ee/`) |
|---|---|---|
| Sign-in | OAuth and OIDC with PKCE against any standard provider, one resource at a time, as connections sign in, and the organisation's sign-in to its gateway (D385) | Entra in depth: Conditional Access, more groups than a token holds, admin consent, government clouds, Azure OpenAI without keys. Custom authorization servers: token exchange (RFC 8693), one sign-in for the gateway and every connection. Teams and Outlook (nested app authentication). |
| Policy | `policy.json` beside `index.html`: allowed and locked brains, action rules, addresses, denied capabilities, the languages and themes offered and the organisation's own theme; `policy.html`, which checks it against what this version reads and the site's own headers (D415) | Sections by the directory's groups and app roles ([Policy by group](#policy-by-group), D429). Policy from managed configuration or a signed central file. Routing by sensitivity ("Confidential" only goes to the on-premises brain). Checks before sending (data-loss classifiers, Purview labels). Private catalogues of skills and projects with approval, by identity-provider group. Simulating a policy for a person or a group. |
| Brains | An allow-list and a lock, any OpenAI-compatible gateway | Azure OpenAI and Foundry with Entra, Bedrock through federated sign-in, brains within the organisation's places (D434), brains per group (D429) |
| Network | Every address replaceable, internal mirrors, answers without streaming when a proxy holds them back; a gateway to the services a browser can't reach, holding the apps registered with their sign-ins (`urls.gateway`, `gateway/`, D191); offline Wikipedia from the organisation's Kiwix server, for web search (`urls.wikipedia`, D254); the Computer's internet (`computer` in policy: off, ask first or any site, a list of sites, a relay) and its package registries (Pyodide's, PyPI, npm: an Artifactory instance, its key kept on the device) (D162) | The bridge, a small server the organisation hosts if it wants: CORS for internal services, sign-in translation (On-Behalf-Of, AWS signing, Kerberos), an egress allow-list, capture for audit |
| Records | Backup, export, a mirrored folder | Retention by policy (D412), certificates sealed under the organisation's authority, or its qualified seal, and judged by its anchors (D434, D436), legal hold, copies to the organisation's archive, encryption at rest (a key from the identity provider or a passkey), wipe at sign-out, virtual desktops |
| Audit | The ACP event stream and the `record` event, each call a hook decided saying whose answer it was (D299), and the `act` event (D421) | OpenTelemetry export with identities or pseudonyms (D386, D427), a hash-chained log, usage reports |
| Deployment | Copy `app/` to any static host, with recipes for IIS, Azure Static Web Apps and S3 behind CloudFront, or run its container image, each sending one header set; Edge or Chrome installing it on managed computers through Intune ([deploy/](../deploy/README.md), D415) | App registration kits, embedding in Teams, Outlook and SharePoint |

The trust pack is open ([trust/](trust/README.md), D419): a threat model, how Jean answers ANSSI's recommendations for generative AI, a DPIA template, an accessibility statement, an outside penetration test's brief, and releases signed by Warehouse SAS with their bill of materials, to deploy without building. Long-term-support releases, filled-in security questionnaires, the penetration test's report and a copy hosted at the organisation's own address ([Hosted copies](#hosted-copies)) come with a subscription. They are services, not code.

**Promises.** The person's own security is never paid for. Features never move from open to `ee/`; they may move the other way. Without a key, enterprise features don't appear at all, so the unlock game never shows a paywall.

**Keys.**
- Warehouse SAS signs them (JWS, ES256). Jean checks them offline with Web Crypto and reads them from policy (`key`); it never calls home. The check lives in `ee/` (`ee/key.js`): the signature, the origins the key names, and its end against the date this version of `ee/` was released, or against today for a trial.
- A subscription key unlocks every version released before its end date, forever. When a subscription lapses, a running deployment keeps working; only upgrades of `ee/` stop.
- A trial key is free for 30 days, one per address, with no fallback. An organisation asks for it, a free key or a subscription on jean.is's key page (`/enterprise/key`, D446), never by email: the page sends the request to Warehouse SAS, who signs each key by hand where its private half is kept offline and sends it by email. For a subscription, the page makes the quote to print.
- A policy that asks for enterprise features without a valid key stops Jean with a message for IT. Its rules are never dropped silently; removing those sections gives back the open version.
- On `localhost`, no key is needed. An organisation of fewer than 250 people gets a free key.
- One rule prices it (D428): an organisation of 250 people or more pays €9,900 a year excl. VAT, whatever its size, and one that serves Jean to many organisations pays it once. Everything is included: the enterprise features, long-term-support releases, filled-in security questionnaires, the penetration test's report, help to set up, and a hosted copy if wanted. No seats, since Jean can't count them, no tiers and no discounts. Four years stay under France's €60,000 excl. VAT for buying without a tender. jean.is's page for IT says so, at `/enterprise` and `/fr/entreprise`.
- If no key can be bought for twelve consecutive months, every version of `ee/` published until then becomes MIT.

## Hosted copies

An organisation that would rather not serve Jean itself has Warehouse SAS serve its copy, with a subscription or for a trial (D456). How the server does it is in [deploy/](../deploy/README.md#hosted-copies).

- **What is hosted:** files, and nothing else. Every hosted copy is the same release; only its `policy.json`, its `Content-Security-Policy` and, if it is pinned to one, its release are the organisation's. There is no admin console: the policy is the organisation's to write, `policy.html` at its address checks it, and Warehouse SAS puts it up.
- **What never reaches Warehouse SAS:** people's data, which stays on their devices as everywhere else, and their requests to brains, the gateway and connections, which go from the browser to the addresses the policy names; the header keeps Jean to its own files and those addresses. The server sees what any web server sees of a visit, the address asking and the files asked for, and keeps no log of it.
- **What it can't promise:** the code and the header are whatever Warehouse SAS's server sends. An organisation that must hold those itself serves Jean itself, from a signed release ([trust/releases.md](trust/releases.md)).
- **Its address:** the organisation's own, such as `ai.acme.com`, which it points at Warehouse SAS's server with a CNAME record. A browser keeps each person's data with the address Jean comes from, so an address the organisation owns lets it later move its copy, to its own server or another host, by changing that record, with everyone's data still there. A trial can start at a subdomain of jean.is, such as `acme.jean.is`, but data kept there stays tied to jean.is: leaving means a new address and each person bringing their data over by backup and restore.
- **Its key:** issued for that address. A trial key for `https://acme.jean.is` doesn't unlock `https://ai.acme.com`.

## Policy model (sketch)

Settings resolve as **defaults ← user ← policy**. Policy wins, and locked fields are labelled "set by your organization". The policy is empty on day one, but every capability and brain choice already checks it.

```json
{
  "brand": { "name": "Acme Assistant" },
  "signIn": { "issuer": "https://login.microsoftonline.com/<tenant-id>/v2.0", "clientId": "<Jean's app>", "scopes": ["api://<gateway-app>/chat"] },
  "brains": [{ "id": "corp", "provider": "custom", "api": "openai", "baseURL": "https://ai.corp.example/v1", "model": "gpt-5", "label": "Acme AI", "auth": "oidc", "jurisdiction": "FR" }],
  "reflexes": { "backend": "local" },
  "capabilities": { "deny": ["connections", "computer"], "preUnlock": ["files", "memory", "projects"] },
  "rules": { "send": "ask", "share": "never" },
  "guards": [{ "id": "no-mail-out", "service": "mail", "then": "never", "reason": "Mail is read-only here." }, { "id": "clients", "kind": "fetch", "if": "Does it send client data outside the company?", "then": "ask" }],
  "pages": { "scripts": true, "downloads": false, "web": false, "network": true, "sites": ["api.corp.example", "*.corp.example"], "maps": true },
  "mapStyles": { "light": "https://maps.corp.example/styles/light", "dark": "https://maps.corp.example/styles/dark" },
  "instructions": "Use British English. Never put client names in titles.",
  "locales": ["en", "fr", "de"],
  "look": { "name": "Acme", "on": "swiss", "accent": "#e30613", "background": "#fafafa", "font": "sans", "css": ".composer { border-radius: 0 !important; }" },
  "kit": { "name": "Acme", "tokens": { "primary": "#e30613", "voice": "bold", "radius": 0 } },
  "looks": [],
  "urls": { "modelWeights": "https://mirror.corp.example/hf/", "wikipedia": "https://wiki.corp.example/{lang}/w/api.php", "npm": "https://artifactory.corp.example/api/npm/npm/", "collaboration": "wss://relay.corp.example", "share": "https://share.corp.example/", "gateway": "https://gateway.corp.example/", "privacy": "https://intranet.corp.example/jean/privacy", "terms": "" },
  "connections": [{ "id": "crm", "name": "CRM", "url": "https://mcp.crm.corp.example/mcp", "auth": "oauth" }],
  "skills": { "sources": ["https://skills.corp.example"], "only": true },
  "extensions": { "ready": ["https://extensions.corp.example/expenses/"] },
  "sync": { "provider": "dropbox", "appKey": "…" },
  "directory": [{ "id": "microsoft-365", "clientId": "4f1c…" }, { "id": "servicenow", "url": "https://acme.service-now.com/sncapps/mcp-server/mcp/sn_mcp_server_default", "clientId": "9b2e…" }, { "id": "figma", "hidden": true }],
  "images": { "openai": ["gpt-image-1"] },
  "films": { "openai": ["sora-2-pro"] },
  "pictureCheck": { "suggestive": true, "hate": false },
  "lock": "required",
  "key": "eyJhbGciOiJFUzI1NiIs…",
  "audit": { "otlpEndpoint": "https://otel.corp.example/v1/traces", "auth": "oidc", "content": false },
  "retention": "P6M",
  "jurisdictions": ["EU"],
  "seal": { "est": "https://ca.corp.example/.well-known/est", "auth": "oidc" },
  "trust": ["-----BEGIN CERTIFICATE-----\nMIIB…\n-----END CERTIFICATE-----"],
  "groups": [{ "id": "5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07", "name": "Legal", "policy": { "rules": { "share": null } } }, { "id": "Jean.Engineering", "name": "Engineering", "policy": { "capabilities": { "deny": ["connections"] } } }]
}
```

Policy brains are the only brains, chosen among by Auto or by hand, and Settings says they are set by the organisation. A policy brain with `"trains": false`, because the organisation's contract with its service rules out training on what it is sent, may read what Google's services bring in, which goes only to such brains (D440).

## Languages and themes

Policy keeps Jean to the languages and themes an organisation supports, and may dress it in its own theme (D500).

- **`locales`:** the languages offered, by the codes `LOCALES` lists (`"fr"`, `"fr-CA"`, `"zh-Hant"`…). The menu and Settings list only those, and ⌘⇧L and ⌘⌥⇧L go round them. Jean opens in the browser's language among them, else English when listed, else the first; a language the person chose that isn't listed is dropped. One language alone is set, as `"locale": "fr"` sets it, and both say "Set by your organization".
- **`look`:** the organisation's own theme, first in the gallery and the one Jean starts in. `name` is what the gallery calls it (needed, and not translated); `on` the theme of Jean's it builds on, Tilde unless it names one; then what Make it yours sets: `accent` and `background` as `#rrggbb`, kept readable by night and by day, `size` (0.85 to 1.3 of the browser's text), `font` (`sans`, `serif`, `rounded` or `mono`) and `css`, its own rules over the theme it builds on. Its CSS is written as a person's own is: the starter in Settings › Appearance › Make it yours shows the main hooks, and a rule needs `!important` to win over a theme's. A typeface it names must be served beside `index.html`, since Jean's policy loads fonts from its own address only.
- **`looks`:** the themes of Jean's offered beside it, by their ids (`tilde`, `human`, `mail`, `minimal`, `swiss`, `paper`, `room`, `fjord`, `velvet`, `notebook`, `blueprint`, `classic`, `mondrian`, `terminal`, `neon`), in the policy's order; without `look`, the first is the one Jean starts in. `[]` offers none but the organisation's. With one theme offered, nothing switches it: the menu's row and Settings' gallery say it is set by the organisation, and ⌘⇧E does nothing.
- **`kit`:** the organisation's kit (D594, D601): `tokens`, a few flat ones (`paper`, `ink`, `primary` as `#rrggbb`, `voice`: `calm`, `elegant`, `bold` or `friendly`, `fonts`, `radius`, `dark`) or a design system's in the W3C's Design Tokens format, and `layouts`, each a grid of named slots, how its words sit, what paper it is on and the PowerPoint layout it is nearest to, as deck's grammar has them (`docs/kits.md` in its package), which drops what fails it. Over Jean's own kit and the person's design system (D602) and under a project's, it is the look of every deck made after, each deck keeping a copy and offered the new one when it changes; its colour and voice are a design's first take's, and those of the Word files and prints Jean makes; its layouts are in the Layout menu and in PowerPoint's. `urls.deck` names where a deck's file finds its renderer, jsDelivr's npm mirror unless the organisation serves its own copy of deck's `dist/deck.js`, `{version}` in it the version Jean writes.
- **What stays the person's:** light or dark, which the organisation's CSS styles through `:root[data-theme='light']` and `[data-theme='dark']`, and Make it yours's touches, over the organisation's theme: text size and typeface are how a person reads.

## Signing in at work

Policy's `signIn` names the organisation's identity provider and the app IT registered there for Jean; each policy brain with `"auth": "oidc"`, the organisation's AI gateway, gets its access token as its key, sent as `Authorization: Bearer`, the OpenAI-compatible way (D385, `caps/signin/`).

- **When:** at the first visit, before the room shows. With the organisation's session already open, the identity provider sends the person straight back; a shared link opened then comes back to where it pointed.
- **Where the tokens live:** in `.secrets/`, sealed at rest, behind the lock when there is one, and never in a backup, export, sync or share; the access token also as each such brain's key. The PKCE verifier waits in the tab's session storage during the sign-in.
- **Renewal:** with the refresh token, five minutes before the access token ends, one tab at a time, and when the page shows again. Refused (Entra's refresh tokens for single-page apps last 24 hours), the tokens go and a toast asks to sign in again, keeping what was typed; unreachable, they stay for the next try. A sign-in that comes back refused asks from the same toast, never in a loop.
- **Settings › Brains** says who is signed in, with Sign out, which signs out at the identity provider too and comes back to sign in afresh.
- **The person's groups:** the ID token's `groups` and `roles`, kept with the tokens for [policy by group](#policy-by-group) (D429).
- **The person's name:** the sign-in asks for `profile` too, and the foot of the drawer shows the name the ID token gives, or else its email or login, unless the person set a first name of their own in Settings › About you or the profile has a name (D150).
- **Entra ID**, for IT:
  1. Register an app for Jean as a *Single-page application*, with Jean's address as its redirect URI, which also comes back from signing out. The browser reaches the token endpoint only for such an app.
  2. On the gateway's own app, expose a scope (`api://<gateway-app>/chat`) with v2 access tokens (`accessTokenAcceptedVersion: 2`), and grant Jean's app consent for it.
  3. Name the issuer by tenant ID, as the tenant's discovery names it.
  4. Have the gateway check the token: its issuer, its audience (the gateway's app) and the scope, as LiteLLM's JWT auth, Portkey or Azure API Management's `validate-jwt` do.
- **Any other OpenID Connect provider** works the same way: its issuer, Jean's client id, the gateway's scopes, and refresh tokens (`offline_access`).

## Policy by group

With a key, or on localhost, `groups` gives the people in a group of the organisation's directory, or holding one of its app roles, a policy of their own (D429, `ee/`). Elsewhere, a policy with `groups` and no key that unlocks this version stops Jean with a message for IT.

```json
"groups": [
  { "id": "5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07", "name": "Legal", "policy": { "brains": [{ "id": "legal", "provider": "custom", "api": "openai", "baseURL": "https://ai.corp.example/legal/v1", "model": "gpt-5", "label": "Acme AI for Legal", "auth": "oidc" }], "rules": { "share": null } } },
  { "id": "Jean.Engineering", "name": "Engineering", "policy": { "capabilities": { "deny": ["connections"] } } },
  { "id": "interns", "policy": { "capabilities": { "deny": ["computer", "connections", "browser"] }, "instructions": "Ask your mentor before sending anything outside the company." } }
]
```

- **Who is in which:** the organisation's sign-in ([Signing in at work](#signing-in-at-work)) keeps the ID token's `groups` and `roles` with its tokens. A section's `id` is one of their values as the identity provider writes it: in Entra, a group's object id or an app role's value; in Okta or Keycloak, a group's name (Keycloak's full path, `/legal`, unless its mapper says otherwise). `name` is what Settings calls it.
- **How a section applies:** for each the person is in, in the order policy lists them, its `policy` goes over the organisation's as a JSON Merge Patch (RFC 7386). An object merges with what is there, anything else (a list, a text, a number) takes its place, and `null` takes it away. So a list is written whole: Engineering's `deny` above is its whole list, the Computer allowed; Legal's `"share": null` lifts the organisation's rule on sharing for them, each choosing their own. Where two sections set the same thing, the one listed later wins.
- **What a section can't hold:** `signIn`, `key` and `groups`, which say who signs in and so whose sections apply. One that holds them, or that Jean can't read, stops Jean with a message for IT, and `policy.html` says why first: it checks each section's `policy` as it checks policy.
- **When:** at each start, before a profile or settings read policy, from the groups the sign-in last gave. Back from signing in, the tokens are kept first, so a first visit has them. A renewal keeps the groups its ID token gives, for the next start: what has loaded can't unload while the page is open.
- **More groups than a token holds:** past 200, Entra leaves `groups` out of the token and names where Graph lists them instead. Jean can't tell then whose sections apply, so it stops with a message for IT: have the token name only the groups assigned to Jean's app (below).
- **What the person sees:** Settings › Brains, under who is signed in, names the sections that apply, by their `name`. What a section sets is labelled as set by the organisation, as the rest of policy is.
- **Entra ID**, for IT:
  1. In Jean's app registration, *Token configuration › Add groups claim*, with *Groups assigned to the application* (`groupMembershipClaims: "ApplicationGroup"`); then assign those groups to the app in *Enterprise applications › Users and groups* (Entra ID P1), so the token holds those alone and never overflows. Groups synced from Active Directory can be named by `sAMAccountName` instead of their object id.
  2. Or app roles: define them under *App roles* (their values, `Jean.Engineering`), and assign people or groups to them; the ID token's `roles` lists the person's.
- **Other providers:** Okta, a `groups` claim in the ID token, by a filter on Jean's app, with `groups` in `signIn.scopes` where the authorization server ties the claim to that scope; Keycloak, a *Group Membership* mapper named `groups`, added to the ID token. Google's sign-in names no groups, so Google Workspace can't have sections yet.
- **Limits:** like every rule inside the browser, a person with developer tools can change what their tab does. What must hold, the gateway checks in its own token: in Entra, the gateway's app adds the groups claim to its access tokens, which LiteLLM's JWT auth, for one, can map to teams and the brains each may use.

## Audit to OpenTelemetry

With a key, or on localhost, `audit` sends the audit stream to the organisation's collector (D386, `ee/`). Elsewhere, a policy with `audit` and no key that unlocks this version stops Jean with a message for IT.

- **Traces, in OpenTelemetry's GenAI conventions:** one a turn, its `invoke_agent` span holding the conversation's and the project's ids, and, for a routine's run, which routine (`jean.routine.id`) and what set it off (`jean.routine.trigger`: `schedule`, `person` with Run now, or `file`, D421). Under it:
  - a `chat {model}` span for each request to a brain: the provider, the model, the tokens read, written and read from the cache, why it stopped, and its error;
  - an `execute_tool {tool}` span for each call: its id and kind, the connection it reached (`jean.tool.service`, its id, and `server.address`, its host), and `jean.decision`, `jean.decided_by` and `jean.declined` when a rule or the person decided it (D308). A script's or a helper's calls go under theirs;
  - a `use_skill` span for each skill used (D421), with `jean.skill.name` and how, `jean.skill.via`: the brain's `skill` call read its steps (`call`, under the call), the box named it with / (`name`), or a mode of the box follows it (`mode`: Visual answers, a child's Learn it).
- **Removals**, once done, are spans of their own, in no turn. Nothing is sent for what a refusal kept (retention may refuse, D412), nor for any task of a project that stays because one of them was refused:
  - `remove_records` when a task is deleted, alone or with its project (`jean.removed.all` true), or going back to a request leaves records out (false), with the conversation's and the project's ids and how many records went (`jean.records.removed`);
  - `remove_profile` when a profile is removed, with its `jean.profile.id`, so the collector knows whose tasks went with it; how many isn't said, since another profile's tasks can't be read.
- **What is done outside the records**, once done, is a span each, in the turn under way in its task, else in no turn (D421). What was in a task carries the conversation's and the project's ids:
  - `add_skill`, with `jean.skill.name` and `jean.skill.source`: `file` (added in Settings), `made` (saved by the brain with the person), `directory` (Jean's own) or `elsewhere`, with the host it came from and the digest it was checked against (`jean.skill.digest`); `remove_skill`;
  - `add_connection`, with `jean.connection.id`, the host as `server.address` and `jean.connection.auth` (`none`, `key` or `oauth`), not when it is signed in to again; `remove_connection`;
  - `add_routine`, with `jean.routine.id`, `jean.routine.every` or `jean.routine.when`, and `jean.routine.flow` when it runs a flow; `remove_routine`;
  - from an answer's actions: `copy_answer`, `share_answer` (the system's share sheet), `save_answer` (`jean.answer.format`: `html`, `docx` or `csv`) and `print_answer`; `save_file`, a file downloaded from its card or the preview (`jean.file.format`, its extension); `save_task`, a task saved as a web page;
  - `add_share`, a link made, with `jean.share.id`, the host, `jean.share.days`, `jean.share.password` and `jean.share.part` when it holds one answer or picture; `remove_share`.
- **The resource:** `service.name` (`jean`, or `audit.service`), Jean's version, and who acted: by default (`"person": "email"`) `device.id`, `jean.profile.id` (D228), and `user.email` from the sign-in (`user.name` for a login).
- **As a pseudonym** (`"person": "pseudonym"`, D427), for organisations whose works council or staff representatives agree to an audit that names no one:
  - **No `user.*` and no `device.id`.** The device's id is the author of every record, skill and file, so a share, a backup or Sync's folder would tie it to a name.
  - **`jean.profile.id` is the pseudonym:** random, made on the device, in no file that leaves it, and the same in `remove_profile`. A person has one on each device.
  - **With `audit.trustee`**, a P-256 public key as a JWK whose private half whoever the agreement names holds (the works council, the data protection officer, or both together), the resource also carries `jean.user.sealed`: the account as the default would name it (`{"user.email": "…"}`), sealed for them as a compact JWE (RFC 7516, `ECDH-ES` and `A256GCM`, its `kid` the trustee's). Any JOSE tool opens it with the private key; IT, the collector's readers and Jean's makers can't. Without a trustee, nothing in the export ties the pseudonym to a person.
  - **Policy:** a value Jean doesn't know, a trustee without `"person": "pseudonym"`, or one holding its private key (`d`) stops Jean with a message for IT, and policy.html says why first.
  - **What Jean can't hide:** with `"auth": "oidc"`, each batch carries the person's token, so the collector's sign-in sees who sent it; the gateway's log names the person of each request, with its time and tokens, which a `chat` span can be matched to; and the collector sees each batch's IP address. What those keep, and who reads them, is the agreement's. With `content`, what is asked and answered often names people too. Less often, a connection's host or a skill's name may.
  - **For the trustee**, a key pair from any JOSE tool, for example `step crypto jwk create trustee.pub.json trustee.json --kty EC --crv P-256 --use enc`; only `trustee.pub.json` goes in policy.
- **What the person sees:** Settings › Your data says that the organisation receives a record of each request, which brain answered and what it did, and what they add, remove, share or save, with or without what they ask and get, and how it names them: by their account, by this device, or by a random name that only the trustee's key ties to them.
- **Metadata only**, unless `"content": true`: then what was asked and answered, what each brain wrote, its reasoning too, each call's arguments and result, as JSON strings, and an error's words (D427), and the names of the connections and routines added (`jean.connection.title`, `jean.routine.title`). Never a path, which holds a profile's name, nor a whole address, which may hold a key.
- **Credentials:** `"auth": "oidc"` sends the organisation's sign-in's token, which the collector's `oidc` authenticator checks. `"auth"` with its own `scopes`, `issuer` or `clientId` makes a sign-in of its own, at the first visit too. `headers` are fixed, and whoever can open Jean reads them in `policy.json`.
- **Sending:** OTLP/HTTP JSON, in batches every five seconds or of 500, again later while the collector is unreachable or busy, at most 5,000 waiting, and what fits in one request as the page is hidden. The collector allows Jean's origin (`cors.allowed_origins` on its OTLP HTTP receiver). Best effort: the gateway's log stays the authoritative one.

## Retention

With a key, or on localhost, `retention` keeps each task's records, and with them its answers' certificates, at least as long as the period it names (D412, `ee/`): an ISO 8601 duration, `"P6M"` for the AI Act's six months (Arts. 19, 26(6)), or `"P1Y"`, `"P90D"`. Elsewhere, a policy with `retention` and no key that unlocks this version stops Jean with a message for IT, as does a period Jean can't read.

- **What is kept:** what leaves a task for good, counted from each record's own time: a task deleted, alone or with its project, and what asking a request again leaves out. Records already older than the period go as they would. Shared files stay or go with their project.
- **Where:** `.kept/<task's id>.jsonl` in the profile's folder, out of sight and sealed at rest like every file (D371). It is a conversation file of its own, only ever added to: the task's header, then each removal's note (when, which device, from which task, how many records, whether the whole task went) before its records. Backups and Sync carry it, so a backup is how a copy is handed over.
- **When it goes:** at a start, once the last thing added to a copy has been kept its period. The tasks the person keeps are never removed.
- **When nothing goes:** if a copy can't be made (the device's storage is full), the removal is refused and a toast says so. A profile can't be removed, since this profile can't read another's sealed tasks to keep them.
- **What the person sees:** Settings › Your data says the organisation keeps each task, with its certificates, for at least the period, and that what they delete stays on the device until then, out of sight.
- **Limits:** best effort, like any rule inside a browser: clearing the site's data, or losing the device, takes the copies too. The collector's log (D386, with `content`) and the gateway's stay the authoritative ones.

## The organisation's seal

With a key, or on localhost, `seal` has the organisation's authority certify the key this device seals certificates with (D434), or has a qualified provider seal them with the organisation's own (D436), and `trust` names the authorities whose word the checks take (`ee/`). Elsewhere, a policy with either and no key that unlocks this version stops Jean with a message for IT, as does a part Jean can't read; `policy.html` says why first.

```json
"seal": { "est": "https://ca.corp.example/.well-known/est", "auth": "oidc" },
"trust": ["-----BEGIN CERTIFICATE-----\nMIIB…\n-----END CERTIFICATE-----"]
```

```json
"trust": [{ "lotl": "https://ec.europa.eu/tools/lotl/eu-lotl.xml", "signers": ["-----BEGIN CERTIFICATE-----\nMIII…\n-----END CERTIFICATE-----", "…"] }]
```

```json
"seal": { "csc": "https://sign.corp.example/csc/v2", "credential": "corp-seal", "auth": "oidc" }
```

- **Enrolment:** at a start, when no certificate from that service is kept for the device's key, or the one kept ends within a month, Jean sends the organisation's EST service (RFC 7030) a PKCS#10 request for that key, signed by it, at `simpleenroll`, in base64 lines of 64, as libest needs; the key never leaves the device. The certificate comes back with its chain, or the chain comes from `cacerts`. The authority's profile decides what it certifies, the subject first. `auth` says how the service knows who asks: `oidc`, the organisation's sign-in's token ([Signing in at work](#signing-in-at-work)); `tls`, what the browser holds for it, such as a client certificate a managed browser presents, the service then allowing Jean's origin with credentials; left out, nothing. The service answers Jean's origin with CORS, or the gateway reaches it, its host in `hosts`.
- **Kept:** in `.secrets/`, which no backup, export, sync or share holds, since it names a key that never leaves this device. Settings › Your data names the authority, and until when.
- **A qualified seal:** with `csc`, the base address of a qualified trust service provider's Cloud Signature Consortium API (v2), or of the organisation's proxy to it, and `credential`, the credentialID of the organisation's seal there, the provider seals in place of the device. At each start, `credentials/info` gives the credential's certificate and chain. Each certificate, or picture, is then a SHA-256 Jean computes of what it signs, granted by `credentials/authorize` (its SAD) and signed by `signatures/signHash` (ECDSA with SHA-256), checked against the credential's key before it is kept; the certificate's issuer is that key's thumbprint. Only an ECDSA P-256 key is taken, since certificates are ES256, and only a credential the provider authorizes itself (`implicit`): one that asks a person for a PIN, a code or a sign-in at each signature can't seal unattended. Jean refuses others with the reason in the console, and the device seals meanwhile, a toast saying so. `auth` works as for EST: with `oidc`, each request carries the organisation's sign-in's token, so the proxy, or a provider that accepts the organisation's tokens, knows who asks; no client secret is ever in `policy.json`, and the gateway only relays to a provider that doesn't answer browsers, its host in `hosts`. Settings › Your data names the provider's authority, and until when.
- **Sealing:** a certificate's `x5c` holds the authority's certificate, or the provider's, and the chain above it but its root, and so does a picture's Content Credentials. Once the witnesses dated it (D276), a certificate gets JAdES B-LT's validation data in its unsigned header: the chain in `xVals`, and in `rVals` what each authority said of its certificate then, an OCSP answer from the responder the certificate names, else its CRL, for the witnesses' certificates too, which their tokens carry; an authority a token leaves out comes from the CA Issuers address the certificate below it names, kept in `xVals` once it is shown to have issued that certificate. EU DSS reads it as B-LT when each of those certificates names where to ask, so policy names a witness whose certificates do (`urls.timestamp`), such as a qualified one from the EU's trusted list: with Sigstore's, the default, it stays B-T. The authority's profile also names its CA certificate (CA Issuers) in each certificate it issues, which DSS warns of otherwise. Responders and CRLs mostly answer plain HTTP, which a page served over HTTPS can't reach: the gateway relays to an origin its `hosts` names whole, `"http://ocsp.corp.example"`, the witnesses' responders and CA Issuers addresses included, what they answer being signed. An authority that can't be reached leaves the device's own certificate, and a toast says so.
- **Checking:** with `trust` (PEM, or base64 DER), the check page served beside this policy and `check_certificate` say whether one of those authorities vouches for a seal: its chain leads, each certificate an authority's and valid when it sealed, to one of them; and whether what the certificate keeps shows each unrevoked then, by an OCSP answer the issuer or a responder it certified signed, or the issuer's CRL. The card says so in a line, with the authority's name: certified by an authority the organisation trusts, the same with no proof it wasn't revoked, not certified by one, or revoked before it sealed. When one vouches and shows it unrevoked, and the seal's certificate says it is an EU qualified certificate for seals whose key a qualified device keeps (ETSI EN 319 412-5's QCStatements: QcCompliance, QcType eseal and QcSSCD, with no QcCClegislation naming another country's law), the line adds that it is a qualified seal under EU law (D437). Those statements count only beneath an anchor: anyone can write them into a certificate of their own.
- **The EU's trusted lists** (D439): an item of `trust` may name the List of Trusted Lists, `lotl`, with in `signers` the certificates the Official Journal publishes for signing it (today OJ C/2026/1944's six). Jean takes the LOTL once one of their keys signed it, or a key its pivots announce in turn, each pivot issued after the newest of those certificates and signed by a key the one before announced; then, for each seal, the list of each country its certificates' names give, once a key the LOTL names for that list signed it. Their XML signatures are checked as XMLDSig with exclusive canonicalization, each signer valid when its list was issued. A list's qualified authorities for certificates (CA/QC) are anchors for a seal made while their status was granted, from each one's history; where a list says what an authority certifies for, seals must be among it (ForeSeals) for the card to say qualified. So whoever relays the lists can withhold them, never choose them. The LOTL's host and the lists' don't answer browsers: the gateway policy names (`urls.gateway`) reaches them, `ec.europa.eu` and each list's host (the LOTL's `TSLLocation`s) in its `hosts`, Slovakia's named whole, `"http://tl.nbu.gov.sk"`, its list being plain HTTP. They are read off the page, in a worker, one country's list at a time (Germany's is 5.4 MB, all of them 27 MB), and kept in `.cache/lists/` a day, or read again for a seal made after they were read, which they can't speak for; the check page keeps them while it is open. Where a list that may hold a seal's authority can't be read or checked, the card says nothing of trust rather than that none vouches, and the console says why. The OJ prints each certificate's SHA-256 beside it: check them, since its HTML drops a line of the second; the LOTL's own pointer, whose `TSLType` is `EUlistofthelists`, carries the same six, and EU DSS's demonstration bundle ships them too.
- **Limits:** a seal under the organisation's certificate is attributable to it; a qualified seal, which the EU's law presumes intact and of correct origin (eIDAS Art. 35(2)), needs a key in a certified device, which a browser's isn't, hence `csc` ([certificates.md](certificates.md)). Each certificate or picture sealed is one signature at the provider. The check page judges a qualified seal by `trust`: the provider's root, or the EU's trusted lists. Of a list, Jean reads an authority's statuses and what it certifies for, not its qualifiers (`Qualifications`), which in a few lists say a certificate is or isn't qualified whatever it says itself; EU DSS reads them. A renewal is a new enrolment, since a browser can't present a Web Crypto key as a TLS client certificate (`simplereenroll`).

## Data residency

With a key, or on localhost, `jurisdictions` keeps requests to brains within the places it lists (D434, `ee/`): ISO 3166 codes, a country (`FR`), a subdivision (`US-CA`), or `EU` for its member states.

```json
"brains": [{ "id": "corp", "provider": "custom", "api": "openai", "baseURL": "https://ai.corp.example/v1", "model": "mistral-large", "jurisdiction": "FR", "auth": "oidc" }],
"jurisdictions": ["EU"]
```

- **Which brains:** policy's own, which are the only brains once policy names them, each declaring its `jurisdiction`. Jean keeps those within the places, and the brains on this device or this computer, and leaves out the rest before a profile or settings read policy, after a group's sections (D429), which may name places of their own. A brain's own settings can't declare its place: the person writes them.
- **Checked:** `policy.html` names the brains its places would leave out. A policy with `jurisdictions` and no `brains` stops Jean with a message for IT, since the person's own brains would go anywhere.
- **What the person sees:** Settings › Brains says where requests to brains stay, and each answer's certificate names its brain's jurisdiction (D274). Pictures and films are made by those same brains' providers.
- **Limits:** a jurisdiction is the organisation's word for its gateway or provider, which decides where a request goes from there. Connections and web search reach the services they name.

## Decide now (cheap now, expensive later)

1. **A file layout that survives sync:**
   - One file per entity, named by ULID and never renamed.
   - Conversations are append-only JSONL.
   - Attachments are named by content hash.
   - No central index of record.
   - Every file carries a `format` version.
2. **One storage interface (`core/fs.js`) as the only way to reach data.** OPFS now, a real folder next, and drives, WebDAV or remoteStorage later. Sync then means mirroring two back-ends.
3. **`author` and timestamps on every entity,** using a device ID for now.
4. **Settings resolve as defaults ← user ← policy** from day one.
5. **No hard-coded third-party URL.**
6. **An event stream in the core (ACP)** that other parts can subscribe to.
7. **The built-in CSP is the ceiling.** Organisations only tighten it with headers.
8. **Choose the domain before the public launch.** Data is bound to the origin, not the brand. A domain move, or moving people to a self-hosted copy, means export/import or a one-time hand-over page.
9. **Offer backup early.** Safari may wipe a site's storage after 7 days without a visit unless it is installed, and users clear site data themselves.
10. **Profiles' data layout** (D228): several Jeans on one device each live in a folder of their own, settled before launch, since data moves only then (D173).

## Sources

- [Single-page apps on the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-overview) · [OpenTelemetry's GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
- [ManagedConfigurationPerOrigin (Chrome)](https://chromeenterprise.google/intl/en_uk/policies/managed-configuration-per-origin/) · [ManagedConfigurationPerOrigin (Edge)](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/managedconfigurationperorigin) · [Managed Configuration API](https://wicg.github.io/WebApiDevice/managed_config/)
