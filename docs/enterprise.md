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
| Force a model or gateway | ✅ | The organisation self-hosts Jean by copying `dist/web/` (`npm run build:web`), with a `policy.json` next to `index.html`, enabled by adding `<meta name="app-policy" content="policy.json">` to `index.html` (`POLICY='{…}' npm run build:web` does both, D344). The policy pins the brain to their gateway (LiteLLM, Portkey, Cloudflare AI Gateway, Azure APIM); Jean already speaks the OpenAI-compatible format. Users sign in with the organisation's account at the first visit (OpenID Connect with PKCE, Entra ID first), and the gateway gets the token ([Signing in at work](#signing-in-at-work), D385). The gateway handles audit, cost and data-loss prevention; Jean builds no admin console. |
| Hard enforcement | ✅ Via CSP | Browsers enforce every policy they receive, and all of them must pass. One HTTP header, `connect-src 'self' https://ai.corp.example`, means Jean cannot reach anything else, whatever its own built-in policy allows. No files need editing. `connect-src 'self'` alone gives a local-only mode. |
| Forced proxy | ✅ Not Jean's job | Web pages can't set proxies. The browser or OS proxy policy (`ProxySettings`, PAC files) already applies to every request Jean makes, the Computer's included, since Jean makes them. Jean's duty is to make every external URL configurable so it can point to internal mirrors, and, for sites that refuse other sites' requests, to send the Computer's through a relay the organisation names (`computer.relay` in policy, D162). |
| Encryption at rest | ✅ | Every file Jean keeps on a device is sealed with AES-256-GCM, its key behind the device's own until a lock keeps it behind the person's passkey or password, with a recovery code; `"lock": "required"` in policy asks for one at the first run and hides Turn off, and denying `lock` never offers it. Backups and Sync's folder stay readable copies ([encryption.md](encryption.md), D371). |
| Disable capabilities | ✅ Comes for free | The policy feeds the unlock gate. A denied capability is never offered and its code is never downloaded. Admins can also unlock capabilities in advance. |
| Config for managed browsers | ✅ Chrome and Edge only | `ManagedConfigurationPerOrigin` pushes JSON to web apps that IT has installed, read with `navigator.managed.getManagedConfiguration()`. It is a second policy source alongside `policy.json`. |
| White-label | ✅ Comes for free | Change `BRAND` and it becomes "Acme Assistant". |
| Company projects | ✅ | Project templates with locked instructions, skills, brain and rules (e.g. "Contract review", pinned to the gateway). An organisation can also publish its skills in a discovery index that policy points to (`skills.sources`, which users can't remove; `skills.only` keeps to it), and users add them after reading their steps (D121). Its catalogue of projects, what other products call agents (instructions, skills, connections without their secrets, a way of being), can be published the same way, each added after reading it. |
| Audit | ✅ Best effort | The ACP event stream, which the `record` event follows (D299), and what is done outside it, the skills, connections, routines and links added or removed and the answers taken away (`act`, D421), are mapped to OpenTelemetry GenAI conventions and sent to the organisation's collector ([Audit to OpenTelemetry](#audit-to-opentelemetry), D386). The gateway's log remains the authoritative one. |
| Retention | ✅ Best effort | What leaves a task, deleted or left out by asking a request again, is kept first for the period policy names, certificates included, as the AI Act asks of a high-risk use ([Retention](#retention), D412). Clearing the site's data still takes it. |

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
| Policy | `policy.json` beside `index.html`: allowed and locked brains, action rules, addresses, denied capabilities; `policy.html`, which checks it against what this version reads and the site's own headers (D415) | Policy from managed configuration, a signed central file or identity-provider groups. Routing by sensitivity ("Confidential" only goes to the on-premises brain). Checks before sending (data-loss classifiers, Purview labels). Private catalogues of skills and projects with approval, by identity-provider group. Simulating a policy for a person or a group. |
| Brains | An allow-list and a lock, any OpenAI-compatible gateway | Azure OpenAI and Foundry with Entra, Bedrock through federated sign-in, region pinning, brains per group |
| Network | Every address replaceable, internal mirrors, answers without streaming when a proxy holds them back; a gateway to the services a browser can't reach, holding the apps registered with their sign-ins (`urls.gateway`, `gateway/`, D191); offline Wikipedia from the organisation's Kiwix server, for web search (`urls.wikipedia`, D254); the Computer's internet (`computer` in policy: off, ask first or any site, a list of sites, a relay) and its package registries (Pyodide's, PyPI, npm: an Artifactory instance, its key kept on the device) (D162) | The bridge, a small server the organisation hosts if it wants: CORS for internal services, sign-in translation (On-Behalf-Of, AWS signing, Kerberos), an egress allow-list, capture for audit |
| Records | Backup, export, a mirrored folder | Retention by policy (D412), legal hold, copies to the organisation's archive, encryption at rest (a key from the identity provider or a passkey), wipe at sign-out, virtual desktops |
| Audit | The ACP event stream and the `record` event, each call a hook decided saying whose answer it was (D299), and the `act` event (D421) | OpenTelemetry export with identities (D386), a hash-chained log, usage reports |
| Deployment | Copy `app/` to any static host, with recipes for IIS, Azure Static Web Apps and S3 behind CloudFront, or run its container image, each sending one header set; Edge or Chrome installing it on managed computers through Intune ([deploy/](../deploy/README.md), D415) | App registration kits, embedding in Teams, Outlook and SharePoint |

The trust pack is open ([trust/](../trust/README.md), D419): a threat model, a DPIA template, an accessibility statement, an outside penetration test's brief, and releases signed by WAREHOUSE SAS with their bill of materials, to deploy without building. Long-term-support releases, filled-in security questionnaires and the penetration test's report come with a subscription. They are services, not code.

**Promises.** The person's own security is never paid for. Features never move from open to `ee/`; they may move the other way. Without a key, enterprise features don't appear at all, so the unlock game never shows a paywall.

**Keys.**
- WAREHOUSE SAS signs them (JWS, ES256). Jean checks them offline with Web Crypto and reads them from policy (`key`); it never calls home. The check lives in `ee/` (`ee/key.js`): the signature, the origins the key names, and its end against the date this version of `ee/` was released, or against today for a trial.
- A subscription key unlocks every version released before its end date, forever. When a subscription lapses, a running deployment keeps working; only upgrades of `ee/` stop.
- A trial key is free for 30 days. An organisation generates one on a page WAREHOUSE SAS runs. It is bound to the deployment's addresses, one trial per address, and has no fallback.
- A policy that asks for enterprise features without a valid key stops Jean with a message for IT. Its rules are never dropped silently; removing those sections gives back the open version.
- On `localhost`, no key is needed. Small organisations, non-profits and schools get free keys.
- If no key can be bought for twelve consecutive months, every version of `ee/` published until then becomes MIT.

## Policy model (sketch)

Settings resolve as **defaults ← user ← policy**. Policy wins, and locked fields are labelled "set by your organization". The policy is empty on day one, but every capability and brain choice already checks it.

```json
{
  "brand": { "name": "Acme Assistant" },
  "signIn": { "issuer": "https://login.microsoftonline.com/<tenant-id>/v2.0", "clientId": "<Jean's app>", "scopes": ["api://<gateway-app>/chat"] },
  "brains": [{ "id": "corp", "provider": "custom", "api": "openai", "baseURL": "https://ai.corp.example/v1", "model": "gpt-5", "label": "Acme AI", "auth": "oidc" }],
  "reflexes": { "backend": "local" },
  "capabilities": { "deny": ["connections", "computer"], "preUnlock": ["files", "memory", "projects"] },
  "rules": { "send": "ask", "share": "never" },
  "guards": [{ "id": "no-mail-out", "service": "mail", "then": "never", "reason": "Mail is read-only here." }, { "id": "clients", "kind": "fetch", "if": "Does it send client data outside the company?", "then": "ask" }],
  "pages": { "scripts": true, "downloads": false, "web": false, "network": true, "sites": ["api.corp.example", "*.corp.example"], "maps": true },
  "mapStyles": { "light": "https://maps.corp.example/styles/light", "dark": "https://maps.corp.example/styles/dark" },
  "instructions": "Use British English. Never put client names in titles.",
  "urls": { "modelWeights": "https://mirror.corp.example/hf/", "wikipedia": "https://wiki.corp.example/{lang}/w/api.php", "npm": "https://artifactory.corp.example/api/npm/npm/", "collaboration": "wss://relay.corp.example", "share": "https://share.corp.example/", "gateway": "https://gateway.corp.example/", "privacy": "https://intranet.corp.example/jean/privacy", "terms": "" },
  "connections": [{ "id": "crm", "name": "CRM", "url": "https://mcp.crm.corp.example/mcp", "auth": "oauth" }],
  "skills": { "sources": ["https://skills.corp.example"], "only": true },
  "sync": { "provider": "dropbox", "appKey": "…" },
  "directory": [{ "id": "microsoft-365", "clientId": "4f1c…" }, { "id": "servicenow", "url": "https://acme.service-now.com/sncapps/mcp-server/mcp/sn_mcp_server_default", "clientId": "9b2e…" }, { "id": "figma", "hidden": true }],
  "images": { "openai": ["gpt-image-1"] },
  "films": { "openai": ["sora-2-pro"] },
  "pictureCheck": { "suggestive": true, "hate": false },
  "lock": "required",
  "key": "eyJhbGciOiJFUzI1NiIs…",
  "audit": { "otlpEndpoint": "https://otel.corp.example/v1/traces", "auth": "oidc", "content": false },
  "retention": "P6M"
}
```

Policy brains are the only brains, chosen among by Auto or by hand, and Settings says they are set by the organisation.

## Signing in at work

Policy's `signIn` names the organisation's identity provider and the app IT registered there for Jean; each policy brain with `"auth": "oidc"`, the organisation's AI gateway, gets its access token as its key, sent as `Authorization: Bearer`, the OpenAI-compatible way (D385, `caps/signin/`).

- **When:** at the first visit, before the room shows. With the organisation's session already open, the identity provider sends the person straight back; a shared link opened then comes back to where it pointed.
- **Where the tokens live:** in `.secrets/`, sealed at rest, behind the lock when there is one, and never in a backup, export, sync or share; the access token also as each such brain's key. The PKCE verifier waits in the tab's session storage during the sign-in.
- **Renewal:** with the refresh token, five minutes before the access token ends, one tab at a time, and when the page shows again. Refused (Entra's refresh tokens for single-page apps last 24 hours), the tokens go and a toast asks to sign in again, keeping what was typed; unreachable, they stay for the next try. A sign-in that comes back refused asks from the same toast, never in a loop.
- **Settings › Brains** says who is signed in, with Sign out, which signs out at the identity provider too and comes back to sign in afresh.
- **The person's name:** the sign-in asks for `profile` too, and the foot of the drawer shows the name the ID token gives, or else its email or login, until the person sets a first name of their own in Settings › About you (D150).
- **Entra ID**, for IT:
  1. Register an app for Jean as a *Single-page application*, with Jean's address as its redirect URI, which also comes back from signing out. The browser reaches the token endpoint only for such an app.
  2. On the gateway's own app, expose a scope (`api://<gateway-app>/chat`) with v2 access tokens (`accessTokenAcceptedVersion: 2`), and grant Jean's app consent for it.
  3. Name the issuer by tenant ID, as the tenant's discovery names it.
  4. Have the gateway check the token: its issuer, its audience (the gateway's app) and the scope, as LiteLLM's JWT auth, Portkey or Azure API Management's `validate-jwt` do.
- **Any other OpenID Connect provider** works the same way: its issuer, Jean's client id, the gateway's scopes, and refresh tokens (`offline_access`).

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
- **The resource:** `service.name` (`jean`, or `audit.service`), Jean's version, `device.id`, `jean.profile.id` (D228), and `user.email` from the sign-in.
- **Metadata only**, unless `"content": true`: then what was asked and answered, what each brain wrote, its reasoning too, and each call's arguments and result, as JSON strings, and the names of the connections and routines added (`jean.connection.title`, `jean.routine.title`). Never a path, which holds a profile's name, nor a whole address, which may hold a key.
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
