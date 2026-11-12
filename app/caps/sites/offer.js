// SPDX-License-Identifier: MIT
// Whether the share host publishes sites (D720), and the address a name makes there, asked once a host: what Sites needs, and what a
// page's Publish… asks before it shows (ui/out.js), without loading Sites.
import { app } from '../../ui/state.js'
import { serviceURL } from '../../core/settings.js'

/** The share host, which publishes sites too where it says so, or '' where policy names none or says never. */
export const hostOf = () => (app.policy.rules?.share === 'never' ? '' : String(serviceURL('share', app.settings.value, app.policy) ?? ''))
/** What the host offers for sites, asked once a host: the address a name makes, or null. @type {Map<string, Promise<{ address: string } | null>>} */
const offers = new Map()
export const offered = (host = hostOf()) => (!host ? Promise.resolve(null) : offers.get(host) ?? /** @type {Promise<{ address: string } | null>} */ (offers.set(host, fetch(host).then((response) => response.json())
  .then((told) => (typeof told?.sites?.address === 'string' ? told.sites : null), () => null)).get(host)))
