# Recipes

How to register each service's app for a company's own server, and what to send. The person clicks in the service's console, signed in with the company's admin account. Consoles change their words: walk them through what they see, by what each step is for, rather than reciting labels.

Everywhere, the redirect address is `https://<address>/`, the company's Jean with its final slash. A secret only ever goes through `company_server`'s `ask`, never the conversation.

## Microsoft 365

Outlook, OneDrive, SharePoint and, for work accounts, Teams. Its sign-in answers browsers, so it needs no secret and no gateway.

1. In the Microsoft Entra admin center, register an application named for the company's Jean.
2. Supported account types: accounts in any organizational directory and personal Microsoft accounts, since Jean signs in through Microsoft's common endpoint.
3. Redirect URI: the platform **Single-page application**, at `https://<address>/`.
4. Copy its **Application (client) ID**.
5. For files and sites in work accounts, an admin may have to grant consent under its API permissions, once the first sign-in shows what it asks for.

Send, in the policy's `directory`: `{ "id": "microsoft-365", "clientId": "<the client id>", "connected": true }`.

## Google Workspace

Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat and Contacts, through the gateway with the company's own app. It needs a Google Workspace account; an app kept to the company's own users needs no review by Google.

1. In the Google Cloud console, signed in as the Workspace's admin, create a project named for the company's Jean.
2. Its OAuth consent screen (Google Auth Platform): the audience **Internal**, an app name and a support address.
3. Create an OAuth client of the type **Web application**, its authorized redirect URI `https://<address>/`. Copy its client ID, and keep the dialog open for its secret.
4. Enable, in its APIs and services, each API the first sign-in says is missing: Google names them.

Send, with `company_server`: `apps: [{ "issuer": "https://accounts.google.com", "tokenEndpoint": "https://oauth2.googleapis.com/token", "clientId": "<the client id>", "ask": "<asking for the client secret, in the person's language>" }]`. Then add `{ "id": "google", "connected": true }` to the policy's `directory`.

## Docusign

Its server for assistants, through the gateway with the company's own integration key. It needs a Docusign plan that includes API access. Without one, say so plainly: there is no way around it, and signatures stay in Docusign's own app.

1. In Docusign's eSignature Admin, under Apps and Keys, add an app and integration key named for the company's Jean.
2. Its authentication: **Authorization Code Grant**, with a secret key added. Docusign shows the secret once, so keep it on screen until it is typed.
3. Its redirect URI: `https://<address>/`. Save, then copy the **Integration Key**.
4. Under the account's integrations, turn on access for assistants' connections (MCP Connections).
5. A company's own key in production also needs two steps on Docusign's side, each taking a day or two:
   - its allowlist request for its server for assistants;
   - its go-live review of the key.

Send: `apps: [{ "issuer": "https://mcp.docusign.com", "tokenEndpoint": "https://account.docusign.com/oauth/token", "clientId": "<the integration key>", "ask": "<asking for the secret key, in the person's language>" }]`. Then add `{ "id": "docusign", "connected": true }` to the policy's `directory`.

## Slack

Its server for assistants, through the gateway with an app in the company's workspace.

1. In Slack's app console, create an app from scratch, in the company's workspace.
2. Under OAuth and permissions, add the redirect URL `https://<address>/`.
3. Copy its **Client ID** from its basic information; `ask` asks for its client secret.

Send: `apps: [{ "issuer": "https://mcp.slack.com", "tokenEndpoint": "https://slack.com/api/oauth.v2.user.access", "clientId": "<the client id>", "auth": "post", "ask": "<asking for the client secret, in the person's language>" }]`. Then add `{ "id": "slack", "connected": true }` to the policy's `directory`.

## A service that takes a key

A service each person reaches with a key of their own, such as an API key or a personal token, needs nothing on the server. Each person adds it under Connections in their own Settings. They type it in a masked field there, and it stays on their devices.

## Each app sends them all

`apps` replaces the gateway's apps whole. Every change that adds an app also lists the ones already there, each without `ask`, so their secrets are sent again as the person typed them before.

## Then

Run `company_server` with the address alone. Then the person opens `https://<address>`, finds the service's row, and signs in once.
