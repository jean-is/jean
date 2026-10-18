# Jean on IIS

[`web.config`](web.config) gives IIS 10 [the header set, the types and the pages without `.html`](../README.md) Jean needs. Without it, IIS refuses `.mjs`, `.wasm`, `.webmanifest` and the other types it doesn't know, with a 404.

## Before

- **[URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite)**, for `/privacy`, `/terms` and `/files`. Without the module, IIS refuses the whole site for a section it doesn't know, with a 500.19: install it, or delete `<rewrite>` from `web.config` and Jean's links to those three pages go nowhere.
- **Static Content Compression** (Server Manager › Web Server › Performance), and for brotli, Microsoft's [IIS Compression](https://www.iis.net/downloads/microsoft/iis-compression). IIS only compresses the types the server lists, and a file once it has been asked for twice in ten seconds. From an administrator's command prompt:

```bat
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/httpCompression /+"staticTypes.[mimeType='application/json',enabled='True']" /+"staticTypes.[mimeType='application/wasm',enabled='True']" /+"staticTypes.[mimeType='image/svg+xml',enabled='True']" /commit:apphost
```

```bat
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/serverRuntime /frequentHitThreshold:1 /commit:apphost
```

- **A site with an HTTPS binding** and the certificate of the address Jean will keep. Browsers only run Jean on `localhost` or over HTTPS.

## Deploy

Build with Node 22 or later on Linux, macOS or WSL, from the repository's root, the organisation's policy beside it ([enterprise.md](../../docs/enterprise.md#policy-model-sketch)):

```bash
npm ci && POLICY="$(cat policy.json)" npm run build:web && cp deploy/iis/web.config dist/web/
```

Then, on the server, from a copy of `dist/web`:

```bat
robocopy dist\web C:\inetpub\jean /MIR /XF *.br *.gz
```

`/MIR` makes the site's folder exactly `dist\web`, `web.config` included, and leaves out the `.br` and `.gz` copies, which IIS doesn't send as they are.

## The organisation's own policy

Add it to the `Content-Security-Policy` line of `web.config`, after a semicolon:

```xml
<add name="Content-Security-Policy" value="frame-ancestors 'self'; connect-src 'self' https://ai.corp.example" />
```

## Check

Open `https://<the site>/policy.html`. Each line of the server's part should say it is sent; IIS sends `Strict-Transport-Security` on plain HTTP too, where browsers ignore it.

## Update

Build the new version and run the same `robocopy`. Each open Jean finds the new version and offers it; people keep their data.
