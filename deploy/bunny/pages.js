// A Bunny Edge Script, of the middleware kind, linked to the pull zone (README.md beside this file): Jean's pages
// without .html (deploy/README.md), /privacy being privacy.html and /fr/entreprise fr/entreprise.html, as a server's
// `try_files {path} {path}.html` finds them. It asks the storage zone for <path>.html whenever an address's last part
// has no ending, which is why `npm run deploy` stores LICENSE as LICENSE.html, with its own type. It runs only when
// the edge has no copy, so a page's first visitor after a deploy, never the next ones.
import * as BunnySDK from '@bunny.net/edgescript-sdk@0.13.0'

BunnySDK.net.http.servePullZone({ url: 'http://localhost:4173' }).onOriginRequest((context) => {
  const url = new URL(context.request.url)
  if (!/\/[^/.]+$/.test(url.pathname)) return Promise.resolve(context.request)
  url.pathname += '.html'
  return Promise.resolve(new Request(url, context.request))
})
