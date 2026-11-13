# The gateway

Some services, like Google Workspace or Slack, refuse requests from a browser, or only accept apps they registered. A small gateway, with nothing to install, reaches them for Jean: it relays to every service Jean knows that a browser can't reach, or to the `hosts` you name, and keeps the secret of an app you registered there (D191, D214).

## Run it

Run it on Node, or put `gateway/gateway.js` on Cloudflare Workers, Deno or Bun, then name it in Settings › Connections, or in policy (`urls.gateway`):

```bash
GATEWAY_CONFIG='{"origins":["https://jean.example"]}' node gateway/serve.js
```

Or, with nothing to clone, its secrets still in `GATEWAY_CONFIG`:

```bash
npx jean-cli gateway --origin https://jean.example
```

It keeps no log of what it relays. A service it can't reach, or that sends a request to a host it doesn't relay to, gets a 502 with CORS, so Jean can say so. The cause goes to standard error on one line: the method, the service's origin and why (`ENOTFOUND`, `ECONNREFUSED`, a certificate). The path and query never go there, since they may hold what is private.

## Try it on your computer

One command serves Jean with the gateway at `/gateway` on the same address, already set for Connections (a policy the development server makes up, as an organisation's would), which is found as anywhere else, or turned on early from its trophy in Settings › Capabilities:

```bash
npm run dev:gateway
```

There, the redirect is `http://127.0.0.1:4173/`, and the apps go in `GATEWAY_CONFIG` before the command. jean.is's GitHub app is there already once `GITHUB_CLIENT_SECRET` gives its secret (`GITHUB_CLIENT_SECRET=… npm run dev:gateway`), for as long as that app's one callback is this address.

## What each service needs

`npm run directory` shows each service's sign-in server.

- **The gateway alone:** GitLab, Dropbox, Monday, Airtable, Calendly, Otter, Gamma, Picsart, Zapier, Todoist and IFTTT. Qonto registers only the redirects on its list: once it has added Jean's address, its entry needs no `app`.
- **An app registered with them:** Gmail, Google Calendar, Google Drive and Google Workspace, Slack, GitHub, Figma, Asana, Zoom, HubSpot, Instacart, Salesforce and Box. Gmail, Calendar and Drive are then called from the browser, only their sign-in through the gateway. Register one, with Jean's address as its redirect, and add it to `clients`: `{"issuer":"https://accounts.google.com","tokenEndpoint":"https://oauth2.googleapis.com/token","clientId":"…","clientSecret":"…"}`.
- **Microsoft 365** needs no gateway: register an app in Microsoft Entra for any organisation's accounts and personal ones, as a single-page app with Jean's address as its redirect, and give its client id in policy (`"directory": [{ "id": "microsoft-365", "clientId": "…" }]`). A web app whose secret the gateway holds instead (`"issuer":"https://login.microsoftonline.com/common/v2.0"`) renews for 90 days rather than one (D382).
- **ServiceNow** is each company's own instance, which registers no app itself. Its admin registers one (Machine Identity Console › Inbound integrations, OAuth - Authorization code grant, its token format JWT, Jean's address as its redirect), and policy names the instance's MCP server with that app's client id (`"directory": [{ "id": "servicenow", "url": "https://<instance>.service-now.com/sncapps/mcp-server/mcp/sn_mcp_server_default", "clientId": "…" }]`). An app with a secret goes in `clients` instead, with the instance as its issuer, and policy names it as `app` in place of `clientId`.
- **NetSuite** is each company's own account, likewise. Its admin registers an integration (Setup › Integration › Manage Integrations › New: Authorization Code Grant, a public client, the scope NetSuite AI Connector Service alone, Jean's address as its redirect), and policy names the account's MCP server with its client id (`"directory": [{ "id": "netsuite", "url": "https://<account>.suitetalk.api.netsuite.com/services/mcp/v1/all", "clientId": "…" }]`). People sign in with a role other than Administrator, which NetSuite keeps out.
- **Databricks** is each company's own workspace, likewise. Its account admin adds an app connection (account console › Settings › App connections: Jean's address as its redirect, the scopes `genie`, `sql` and `offline_access`, no client secret), and policy names the workspace's MCP server with its client id: a Genie space's (`"directory": [{ "id": "databricks", "url": "https://<workspace>/api/2.0/mcp/genie/<space id>", "clientId": "…" }]`), which answers questions about its data in words, or Databricks SQL's (`/api/2.0/mcp/sql`). The workspace itself is the issuer of an app with a secret (`https://<workspace>/oidc`).
- **SAP** runs no server for people's work: each company makes its own in SAP Integration Suite, from its systems' APIs (S/4HANA, SuccessFactors…), on hosts of its own, which its gateway adds to `hosts`. Its admin lets people sign in to that server through SAP Cloud Identity Services, registers Jean there as an OpenID Connect application (a public client, Jean's address as its redirect), and policy names the server with that application's client id (`"directory": [{ "id": "sap", "url": "https://<its host>/<its path>", "clientId": "…" }]`). Jean finds where to sign in from the server's own metadata, which has to name Cloud Identity Services, not its token endpoint.
- **A company's own GitLab** needs no gateway: its admin registers an app (Admin › Applications, not confidential, scopes `mcp`, `openid` and `email`, Jean's address as its redirect), and policy names the instance's MCP server with that app's client id (`"directory": [{ "id": "gitlab", "url": "https://<instance>/api/v4/mcp", "clientId": "…" }]`). Or, with `"ready": false` in place of `clientId`, a gateway that relays to the instance registers Jean there.
