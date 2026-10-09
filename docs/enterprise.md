# Enterprise readiness and future features

Nothing planned is ruled out by the architecture:

- **Backup, sync and sharing** need no server at all.
- **Live collaboration** is the first feature that genuinely needs one, and that server would be optional and self-hostable.
- **Enterprise control works the web way:** enforcement comes from the organisation's own hosting, security headers and AI gateway, not from rules inside Jean.

## Feature readiness

| Feature | Verdict | How, without a Jean server |
|---|---|---|
| Backup, import/export | ✅ Trivial | Data is plain files: a zip in, a zip out. On Chrome and Edge, mirroring to a real folder is continuous backup. |
| Sync across my devices | ✅ | Four routes: <br>• A mirrored folder plus the user's existing sync tool (OneDrive, iCloud, Dropbox, Syncthing). Built in Chrome and Edge and the desktop app (D157). <br>• Each project to its own place, or kept on the device: work projects through the work drive, personal ones through the personal one (D227). <br>• A drive's own API, with OAuth in the browser, for phones, Safari and Firefox: Dropbox first, its app key from settings or policy (`sync`), then OneDrive with an app IT registers in Entra, and Google Drive through the gateway (D227). <br>• The phone as a remote of the Jean open on a laptop or at work, over the relay (D45 · D226, D227). |
| Share | ✅ | Files through the native share sheet (Web Share API). Small items as a self-contained link: compressed data in the `#fragment`, which never reaches a server. Larger items via a link from the user's own drive. Skills are `SKILL.md` files, which also work in Claude, Codex and similar tools. |
| Live collaboration | ⚠️ Needs an optional server | Browsers need a signalling server to find each other, and a relay on some networks. The default is a tiny relay hosted by the maintainer on a subdomain of Jean's domain (D45). It runs only once someone turns collaboration on, and it forwards end-to-end-encrypted traffic it can't read. Organisations can self-host it and point policy at their copy, or switch collaboration off. Each participant's Jean uses its own brain and keys. CRDTs (Yjs) come back, but only for shared documents. First, with no server, a project shared through a shared drive folder (D227); then requests between people's Jeans, each answered by the person's own Jean and approved by them, and live sharing over WebRTC, the relay only for signalling (D45 · D226). |
| Force a model or gateway | ✅ | The organisation self-hosts Jean by copying the folder, with a `policy.json` next to `index.html`, enabled by adding `<meta name="app-policy" content="policy.json">` to `index.html`. The policy pins the brain to their gateway (LiteLLM, Portkey, Cloudflare AI Gateway, Azure APIM); Jean already speaks the OpenAI-compatible format. Users sign in through the organisation's identity provider directly from the browser (OIDC), and the token is passed to the gateway. The gateway handles audit, cost and data-loss prevention; Jean builds no admin console. |
| Hard enforcement | ✅ Via CSP | Browsers enforce every policy they receive, and all of them must pass. One HTTP header, `connect-src 'self' https://ai.corp.example`, means Jean cannot reach anything else, whatever its own built-in policy allows. No files need editing. `connect-src 'self'` alone gives a local-only mode. |
| Forced proxy | ✅ Not Jean's job | Web pages can't set proxies. The browser or OS proxy policy (`ProxySettings`, PAC files) already applies to every request Jean makes, the Computer's included, since Jean makes them. Jean's duty is to make every external URL configurable so it can point to internal mirrors, and, for sites that refuse other sites' requests, to send the Computer's through a relay the organisation names (`computer.relay` in policy, D162). |
| Disable capabilities | ✅ Comes for free | The policy feeds the unlock gate. A denied capability is never offered and its code is never downloaded. Admins can also unlock capabilities in advance. |
| Config for managed browsers | ✅ Chrome and Edge only | `ManagedConfigurationPerOrigin` pushes JSON to web apps that IT has installed, read with `navigator.managed.getManagedConfiguration()`. It is a second policy source alongside `policy.json`. |
| White-label | ✅ Comes for free | Change `BRAND` and it becomes "Acme Assistant". |
| Company projects | ✅ | Project templates with locked instructions, skills, brain and rules (e.g. "Contract review", pinned to the gateway). An organisation can also publish its skills in a discovery index that policy points to (`skills.sources`, which users can't remove; `skills.only` keeps to it), and users add them after reading their steps (D121). Its catalogue of projects, what other products call agents (instructions, skills, connections without their secrets, a way of being), can be published the same way, each added after reading it. |
| Audit | ✅ Best effort | The ACP event stream is mapped to OpenTelemetry GenAI conventions and sent to the organisation's collector. The gateway's log remains the authoritative one. |

## What it cannot do, by design

These follow from keeping data on the device with no server. Companies already cover them with device management (MDM) and gateways.

- Guarantee anything on unmanaged devices. Rules inside the browser are advisory; real enforcement is the CSP header, network filtering and the gateway.
- Provide an authoritative audit of local actions.
- Remotely wipe or revoke data already on a device.
- Run scheduled jobs while no tab is open; that would need an optional runner. Routines run while Jean is open, and catch up at the next visit (D122).
- Hold jean-cli to policy (D241). It isn't served from the organisation's address, so it reads none: where Jean must keep to policy, block `npx jean-cli` with the machine's own controls.

## Open and enterprise

Jean is open core (D139). Everything a person or a team uses is MIT. What only an organisation's IT, security or compliance team asks for lives in `ee/`, under the [Elastic License 2.0](../ee/LICENSE) plus an [additional grant](../ee/GRANT.md), and needs a key.

| Area | Open (MIT) | Enterprise (`ee/`) |
|---|---|---|
| Sign-in | OAuth and OIDC with PKCE against any standard provider, one resource at a time, as MCP sign-in does today | Entra in depth: Conditional Access, more groups than a token holds, admin consent, government clouds, Azure OpenAI without keys. Custom authorization servers: token exchange (RFC 8693), one sign-in for the gateway and every connection. Teams and Outlook (nested app authentication). |
| Policy | `policy.json` beside `index.html`: allowed and locked brains, action rules, addresses, denied capabilities | Policy from managed configuration, a signed central file or identity-provider groups. Routing by sensitivity ("Confidential" only goes to the on-premises brain). Checks before sending (data-loss classifiers, Purview labels). Private catalogues of skills and projects with approval, by identity-provider group. A command that checks and simulates a policy. |
| Brains | An allow-list and a lock, any OpenAI-compatible gateway | Azure OpenAI and Foundry with Entra, Bedrock through federated sign-in, region pinning, brains per group |
| Network | Every address replaceable, internal mirrors, answers without streaming when a proxy holds them back; a gateway to the services a browser can't reach, holding the apps registered with their sign-ins (`urls.gateway`, `gateway/`, D191); the Computer's internet (`computer` in policy: off, ask first or any site, a list of sites, a relay) and its package registries (Pyodide's, PyPI, npm: an Artifactory instance, its key kept on the device) (D162) | The bridge, a small server the organisation hosts if it wants: CORS for internal services, sign-in translation (On-Behalf-Of, AWS signing, Kerberos), an egress allow-list, capture for audit |
| Records | Backup, export, a mirrored folder | Retention and legal hold by policy, copies to the organisation's archive, encryption at rest (a key from the identity provider or a passkey), wipe at sign-out, virtual desktops |
| Audit | The ACP event stream | OpenTelemetry export with identities, a hash-chained log, usage reports |
| Deployment | Copy the folder, or run its container image ([deploy/docker/](../deploy/docker/README.md)); the headers are documented | Deployment kits (hosting, app registration, Intune), embedding in Teams, Outlook and SharePoint |

Long-term-support releases, signed builds, SBOMs, security questionnaires and accessibility reports come with a subscription. They are services, not code.

**Promises.** The person's own security is never paid for. Features never move from open to `ee/`; they may move the other way. Without a key, enterprise features don't appear at all, so the unlock game never shows a paywall.

**Keys.**
- CODENAME SAS signs them (JWS, ES256). Jean checks them offline with Web Crypto and reads them from policy; it never calls home. The check lives in `ee/`.
- A subscription key unlocks every version released before its end date, forever. When a subscription lapses, a running deployment keeps working; only upgrades of `ee/` stop.
- A trial key is free for 30 days. An organisation generates one on a page CODENAME SAS runs. It is bound to the deployment's addresses, one trial per address, and has no fallback.
- A policy that asks for enterprise features without a valid key stops Jean with a message for IT. Its rules are never dropped silently; removing those sections gives back the open version.
- On `localhost`, no key is needed. Small organisations, non-profits and schools get free keys.
- If no key can be bought for twelve consecutive months, every version of `ee/` published until then becomes MIT.

## Policy model (sketch)

Settings resolve as **defaults ← user ← policy**. Policy wins, and locked fields are labelled "set by your organization". The policy is empty on day one, but every capability and brain choice already checks it.

```json
{
  "brand": { "name": "Acme Assistant" },
  "brains": {
    "allowed": [{ "id": "corp", "type": "openai-compatible", "baseURL": "https://ai.corp.example/v1", "auth": "oidc" }],
    "locked": true
  },
  "reflexes": { "backend": "local" },
  "capabilities": { "deny": ["connections", "computer"], "preUnlock": ["files", "memory", "projects"] },
  "rules": { "send": "ask", "share": "never" },
  "pages": { "scripts": true, "downloads": false, "web": false, "network": true, "sites": ["api.corp.example", "*.corp.example"] },
  "instructions": "Use British English. Never put client names in titles.",
  "urls": { "modelWeights": "https://mirror.corp.example/hf/", "wikipedia": "https://wiki.corp.example/{lang}/w/api.php", "npm": "https://artifactory.corp.example/api/npm/npm/", "collaboration": "wss://relay.corp.example", "gateway": "https://gateway.corp.example/" },
  "connections": [{ "id": "crm", "name": "CRM", "url": "https://mcp.crm.corp.example/mcp", "auth": "oauth" }],
  "skills": { "sources": ["https://skills.corp.example"], "only": true },
  "sync": { "provider": "dropbox", "appKey": "…" },
  "directory": [{ "id": "microsoft-365", "url": "https://mcp.m365.corp.example/mcp", "clientId": "4f1c…" }, { "id": "figma", "hidden": true }],
  "images": { "openai": ["gpt-image-1"] },
  "audit": { "otlpEndpoint": "https://otel.corp.example/v1/traces" }
}
```

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

- [ManagedConfigurationPerOrigin (Chrome)](https://chromeenterprise.google/intl/en_uk/policies/managed-configuration-per-origin/) · [ManagedConfigurationPerOrigin (Edge)](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/managedconfigurationperorigin) · [Managed Configuration API](https://wicg.github.io/WebApiDevice/managed_config/)
