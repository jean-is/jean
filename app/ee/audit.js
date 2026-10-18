// SPDX-FileCopyrightText: 2026 WAREHOUSE SAS
// SPDX-License-Identifier: Elastic-2.0

// The audit export (D386): Jean's audit stream, each record kept (the `record` event, D299), each
// turn's end, what left for good once it is gone (`record` too, D412), and what was done outside the
// records (`act`, D421), as OpenTelemetry traces (otlp.js), sent to the collector policy names
// (`audit.otlpEndpoint`). Its credentials: the organisation's sign-in (`auth: "oidc"`, D385), a
// sign-in of its own (`auth` naming its own issuer, client or scopes, over the organisation's), or
// headers policy gives (`headers`), which whoever can open Jean can read in policy.json.
import { register, contributions } from '../ui/caps.js'
import { app, effective } from '../ui/state.js'
import { here } from '../ui/opfs.js'
import { tracer, exporter, profileOf } from './otlp.js'

/** @typedef {import('../caps/signin/signin.js').SignIn} SignIn */

/** Who signed in, as OpenTelemetry names it. @param {string | null | undefined} account */
const user = (account) => (account ? { [account.includes('@') ? 'user.email' : 'user.name']: account } : {})

/**
 * The connection a call reached, the organisation's or the person's, with its host, never the rest of its address,
 * which may hold a key (D421). @param {string} name the tool's @returns {import('./otlp.js').Service | undefined}
 */
function serviceOf(name) {
  const id = contributions().tools.find((tool) => tool.spec.name === name)?.service
  const url = [...app.policy.connections ?? [], ...effective.peek().settings.connections ?? []].find((connection) => connection.id === id)?.url
  return id ? { id, address: url && new URL(url).hostname } : undefined
}

/** @param {{ otlpEndpoint: string, content?: boolean, auth?: 'oidc' | Partial<SignIn>, headers?: Record<string, string>, service?: string }} audit */
export async function start(audit) {
  const signin = audit.auth ? await import('../caps/signin/signin.js') : null
  const own = typeof audit.auth === 'object' ? audit.auth : null
  const id = own ? 'signin:audit' : 'signin'
  if (signin && own) await signin.start(id, { ...app.policy.signIn, ...own })
  const version = await fetch('capabilities.json').then((res) => res.json()).then((listing) => listing.version, () => undefined)
  const out = exporter({
    endpoint: audit.otlpEndpoint,
    resource: () => ({ 'service.name': audit.service ?? 'jean', 'service.version': version, 'device.id': app.deviceId, 'jean.profile.id': profileOf(here()), ...user(signin?.account.value) }),
    headers: async () => {
      const token = await signin?.token(id)
      return { ...audit.headers, ...(token && { authorization: `Bearer ${token}` }) }
    },
  })
  const follow = tracer({ send: out.add, content: audit.content === true, serviceOf })
  register({
    id: 'audit',
    hooks: [
      { on: 'record', tier: 'policy', run: (e, next) => { follow.record(e); return next(e) } },
      { on: 'turn.end', tier: 'policy', run: (e, next) => { follow.end(e); return next(e) } },
      { on: 'act', tier: 'policy', run: (e, next) => { follow.act(e); return next(e) } },
    ],
  })
  // What waits goes as the page is hidden or closed, which may be the last chance.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') out.flush(true) })
}
