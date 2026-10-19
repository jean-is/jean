// A CloudFront Function (cloudfront-js-2.0) on viewer requests: Jean's pages without .html
// (deploy/README.md), /privacy being privacy.html and /fr/privacy fr/privacy.html.
function handler (event) {
  var request = event.request
  if (/^\/(privacy|terms|files|check|fr\/privacy|fr\/terms|fr\/files)$/.test(request.uri)) request.uri += '.html'
  return request
}
