// What test/csp.spec.js and scripts/csp.js share: how a report reads, and the one refusal expected.

/** A report a page's policy sent (scripts/serve.js --csp-reports), in a line. @param {any} report */
export function line(report) {
  const r = report['csp-report'] ?? report
  return `${r['document-uri']}: ${r['violated-directive'] ?? r['effective-directive']} ${r['blocked-uri'] ?? ''} ${r['source-file'] ?? ''}:${r['line-number'] ?? ''}${r['script-sample'] ? ` “${r['script-sample']}”` : ''}`
}

/**
 * The refusals expected. Pyodide asks whether its worker is a classic one by importing an empty data:
 * script, which the sandbox's policy refuses (data: isn't its scripts'), and goes on as a module
 * worker would; Python works either way, and the sandbox stays as tight. Safari makes a Trusted Types
 * policy of its own in the room, from a script it puts in the page, outside the page's own
 * `trustedTypes`: the report names the page, never a file of Jean's, which makes only its two.
 * @param {string} text a report's line, or what the console said
 */
export const expected = (text) => /^blob\S*: script-src(-elem)? data /.test(text) || /Refused to load data:text\/javascript, /.test(text)
  || /^(\S+): trusted-types trusted-types-policy \1:\d+$/.test(text)
