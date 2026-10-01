# Enterprise readiness and future features

Nothing planned is ruled out by the architecture:

- **Backup, sync and sharing** need no server at all.
- **Live collaboration** is the first feature that genuinely needs one, and that server would be optional and self-hostable.
- **Enterprise control works the web way:** enforcement comes from the organisation's own hosting, security headers and AI gateway, not from rules inside Jean.

## Feature readiness

| Feature | Verdict | How, without a Jean server |
|---|---|---|
| Backup, import/export | ✅ Trivial | Data is plain files: a zip in, a zip out. On Chrome and Edge, mirroring to a real folder is continuous backup. |
| Sync across my devices | ✅ | Three routes: <br>• A mirrored folder plus the user's existing sync tool (OneDrive, iCloud, Dropbox, Syncthing). <br>• A cloud-drive connection (Drive, OneDrive or Dropbox APIs with OAuth in the browser); works in every browser. <br>• remoteStorage, an open protocol for user-owned storage. |
| Share | ✅ | Files through the native share sheet (Web Share API). Small items as a self-contained link: compressed data in the `#fragment`, which never reaches a server. Larger items via a link from the user's own drive. Routines are `SKILL.md` files, which also work in Claude, Codex and similar tools. |
| Live collaboration | ⚠️ Needs an optional server | Browsers need a signalling server to find each other, and a relay on some networks. The default is a tiny relay hosted by the maintainer on a subdomain of Jean's domain (D45). It runs only once someone turns collaboration on, and it forwards end-to-end-encrypted traffic it can't read. Organisations can self-host it and point policy at their copy, or switch collaboration off. Each participant's Jean uses its own brain and keys. CRDTs (Yjs) come back, but only for shared documents. |
| Force a model or gateway | ✅ | The organisation self-hosts Jean by copying the folder, with a `policy.json` next to `index.html`, enabled by adding `<meta name="app-policy" content="policy.json">` to `index.html`. The policy pins the brain to their gateway (LiteLLM, Portkey, Cloudflare AI Gateway, Azure APIM); Jean already speaks the OpenAI-compatible format. Users sign in through the organisation's identity provider directly from the browser (OIDC), and the token is passed to the gateway. The gateway handles audit, cost and data-loss prevention; Jean builds no admin console. |
| Hard enforcement | ✅ Via CSP | Browsers enforce every policy they receive, and all of them must pass. One HTTP header, `connect-src 'self' https://ai.corp.example`, means Jean cannot reach anything else, whatever its own built-in policy allows. No files need editing. `connect-src 'self'` alone gives a local-only mode. |
| Forced proxy | ✅ Not Jean's job | Web pages can't set proxies. The browser or OS proxy policy (`ProxySettings`, PAC files) already applies to every request Jean makes. Jean's only duty is to make every external URL configurable so it can point to internal mirrors. |
| Disable capabilities | ✅ Comes for free | The policy feeds the unlock gate. A denied capability is never offered and its code is never downloaded. Admins can also unlock capabilities in advance. |
| Config for managed browsers | ✅ Chrome and Edge only | `ManagedConfigurationPerOrigin` pushes JSON to web apps that IT has installed, read with `navigator.managed.getManagedConfiguration()`. It is a second policy source alongside `policy.json`. |
| White-label | ✅ Comes for free | Change `BRAND` and it becomes "Acme Assistant". |
| Company projects | ✅ | Project templates with locked instructions, routines, brain and rules (e.g. "Contract review", pinned to the gateway). |
| Audit | ✅ Best effort | The ACP event stream is mapped to OpenTelemetry GenAI conventions and sent to the organisation's collector. The gateway's log remains the authoritative one. |

## What it cannot do, by design

These follow from keeping data on the device with no server. Companies already cover them with device management (MDM) and gateways.

- Guarantee anything on unmanaged devices. Rules inside the browser are advisory; real enforcement is the CSP header, network filtering and the gateway.
- Provide an authoritative audit of local actions.
- Remotely wipe or revoke data already on a device.
- Run scheduled jobs while no tab is open; that would need an optional runner.

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
  "capabilities": { "deny": ["connections", "python"], "preUnlock": ["files", "memory", "projects"] },
  "rules": { "send": "ask", "share": "never" },
  "instructions": "Use British English. Never put client names in titles.",
  "urls": { "modelWeights": "https://mirror.corp.example/hf/", "search": "https://search.corp.example", "relay": "wss://relay.corp.example" },
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

## Sources

- [ManagedConfigurationPerOrigin (Chrome)](https://chromeenterprise.google/intl/en_uk/policies/managed-configuration-per-origin/) · [ManagedConfigurationPerOrigin (Edge)](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/managedconfigurationperorigin) · [Managed Configuration API](https://wicg.github.io/WebApiDevice/managed_config/)
