# Jean on Bunny CDN

A Bunny storage zone keeps Jean's files and a pull zone serves them over HTTPS, at the address Jean will keep. This is how jean.is is served. `npm run deploy` does the rest at each deploy: it uploads the release into a folder of its own, gives the pull zone [the header set](../README.md#the-header-set) and points it at that folder in one step, so no visitor gets two versions' files. A storage zone has no `try_files`, so [`pages.js`](pages.js), an Edge Script linked to the pull zone, answers `/privacy` with `privacy.html`.

Bunny compresses as it serves, WebAssembly included, so the build's `.br` and `.gz` copies stay behind. Each file goes with its type from [the table](../README.md#types).

## Set it up, once

In Bunny's dashboard, `jean-site` standing for the storage zone's name:

1. **Storage › Add Storage Zone:** `jean-site`, main region Germany, no replicas outside Europe.
2. **CDN › Add Pull Zone:** origin type *Storage Zone*, `jean-site`. Under **Logging**, turn logging off; each deploy turns it off again and stops if Bunny still keeps logs.
3. **Edge Scripting › Add Script:** a *Middleware* script with [`pages.js`](pages.js) as its code, linked to the pull zone, *Run script before cache* left off. Each deploy stops if the pull zone has no script.
4. **The pull zone › Hostnames:** the address Jean will keep, with Bunny's free certificate, after a CNAME record of that name for the pull zone's `b-cdn.net` name, not proxied. At a domain's apex, the DNS host must flatten the CNAME, as Cloudflare's does.
5. **Another name for the same site**, such as `www`: add it as a hostname too, then an edge rule redirecting it, *Redirect to URL* `https://<the address>%{Request.Path}`, status 301, when the request header `Host` is that name.

## Deploy

Three keys from the dashboard: the storage zone's password (**Storage › jean-site › FTP & API Access**), the account's API key (**Account › API**), and the pull zone's id, from its address in the dashboard. Keep them out of the repository and the shell's history: in a file only you can read, say `~/.jean-bunny`:

```bash
export BUNNY_STORAGE_KEY=… BUNNY_API_KEY=… BUNNY_PULL_ZONE=…
```

Then deploy a commit, with the site's own policy and address:

```bash
. ~/.jean-bunny && DEPLOY_TO=bunny:jean-site POLICY="$(cat policy.json)" ADDRESS=https://jean.example/ npm run deploy
```

It builds the commit as git has it, uploads it to `releases/<when>-<commit>/`, sets the pull zone (logging off, files kept at the edge until the next deploy, browsers told `public, max-age=0`, since Bunny caches nothing marked `no-cache`, and the rest of the header set), points it at the new release, purges the cache twice, 15 seconds apart, so no edge keeps a file of the release before, and keeps the last five releases. `BUNNY_STORAGE_HOST` names the storage zone's region when it isn't Germany's, `storage.bunnycdn.com`.

To go back to an earlier release, open the pull zone's edge rule *jean: serve the current release*, put that release's folder in its path, and purge the cache.

## The organisation's own policy

`CSP` adds it to the header set's `Content-Security-Policy` at each deploy, after `frame-ancestors 'self'`: browsers enforce both, so it can only take away.

```bash
. ~/.jean-bunny && DEPLOY_TO=bunny:jean-site CSP="connect-src 'self' https://ai.corp.example" POLICY="$(cat policy.json)" npm run deploy
```
