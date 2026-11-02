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

## Try it on your computer

One command serves Jean with the gateway at `/gateway` on the same address, already set for Connections (a policy the development server makes up, as an organisation's would), which is found as anywhere else, or turned on early from its trophy in Settings › Capabilities:

```bash
npm run dev:gateway
```

There, the redirect is `http://127.0.0.1:4173/`, and the apps go in `GATEWAY_CONFIG` before the command. jean.is's GitHub app is there already once `GITHUB_CLIENT_SECRET` gives its secret (`GITHUB_CLIENT_SECRET=… npm run dev:gateway`), for as long as that app's one callback is this address.

## What each service needs

`npm run directory` shows each service's sign-in server.

- **The gateway alone:** GitLab, Dropbox, Monday, Airtable, Calendly, Otter, Gamma, Zapier and Todoist. Qonto registers only the redirects on its list: once it has added Jean's address, its entry needs no `app`.
- **An app registered with them:** Gmail, Google Calendar, Google Drive and Google Workspace, Slack, GitHub, Figma, Asana, Zoom, HubSpot and Box. Gmail, Calendar and Drive are then called from the browser, only their sign-in through the gateway. Register one, with Jean's address as its redirect, and add it to `clients`: `{"issuer":"https://accounts.google.com","tokenEndpoint":"https://oauth2.googleapis.com/token","clientId":"…","clientSecret":"…"}`.
- **Microsoft 365** needs no gateway: register an app in Microsoft Entra for any organisation's accounts and personal ones, as a single-page app with Jean's address as its redirect, and give its client id in policy (`"directory": [{ "id": "microsoft-365", "clientId": "…" }]`). A web app whose secret the gateway holds instead (`"issuer":"https://login.microsoftonline.com/common/v2.0"`) renews for 90 days rather than one (D382).
- **ServiceNow** is each company's own instance, which registers no app itself. Its admin registers one (Machine Identity Console › Inbound integrations, OAuth - Authorization code grant, its token format JWT, Jean's address as its redirect), and policy names the instance's MCP server with that app's client id (`"directory": [{ "id": "servicenow", "url": "https://<instance>.service-now.com/sncapps/mcp-server/mcp/sn_mcp_server_default", "clientId": "…" }]`). An app with a secret goes in `clients` instead, with the instance as its issuer, and policy names it as `app` in place of `clientId`.
- **A company's own GitLab** needs no gateway: its admin registers an app (Admin › Applications, not confidential, scopes `mcp`, `openid` and `email`, Jean's address as its redirect), and policy names the instance's MCP server with that app's client id (`"directory": [{ "id": "gitlab", "url": "https://<instance>/api/v4/mcp", "clientId": "…" }]`). Or, with `"ready": false` in place of `clientId`, a gateway that relays to the instance registers Jean there.
