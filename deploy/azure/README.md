# Jean on Azure Static Web Apps

[`staticwebapp.config.json`](staticwebapp.config.json) gives Static Web Apps [the header set, the types and the pages without `.html`](../README.md) Jean needs. It goes at the root of what is uploaded, where Static Web Apps reads it and never serves it.

A deploy is about 170 MB in some 5,600 files, the compressed copies included: within the Free plan's 250 MB and 15,000 files. Jean needs no API, sign-in or fallback route of the platform's: people sign in to the organisation's AI gateway from Jean itself ([enterprise.md](../../docs/enterprise.md#signing-in-at-work)).

## Deploy

1. Create a Static Web App with **Other** as its deployment source, and copy its deployment token (Overview › Manage deployment token).
2. Build with Node 22 or later, from the repository's root, the organisation's policy beside it ([enterprise.md](../../docs/enterprise.md#policy-model-sketch)):

```bash
npm ci && POLICY="$(cat policy.json)" npm run build:web && cp deploy/azure/staticwebapp.config.json dist/web/
```

3. Upload with Microsoft's command line:

```bash
npx @azure/static-web-apps-cli deploy dist/web --env production --deployment-token "$SWA_TOKEN"
```

4. Add the address Jean will keep under Custom domains. Static Web Apps serves it over HTTPS with its own certificate.

From GitHub Actions instead, build the same way, then upload with Microsoft's action, the token kept as a secret:

```yaml
- run: npm ci && npm run build:web && cp deploy/azure/staticwebapp.config.json dist/web/
  env:
    POLICY: ${{ vars.JEAN_POLICY }}
- uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
    action: upload
    app_location: dist/web
    skip_app_build: true
```

## The organisation's own policy

Add it to `Content-Security-Policy` under `globalHeaders`, after a semicolon:

```json
"Content-Security-Policy": "frame-ancestors 'self'; connect-src 'self' https://ai.corp.example"
```

## Check

Open `https://<the site>/policy.html`. Each line of the server's part should say it is sent.

## Update

Build and upload again. Each open Jean finds the new version and offers it; people keep their data.
