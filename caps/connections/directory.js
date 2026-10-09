// The services Jean already knows (D95): click one, sign in, done. An address here is a provider
// identity, like a brain's (D33), and policy can replace it (`directory` in policy.json). Each is
// reached from the browser, once checked from one (`ready`: CORS that lets Authorization through, on
// the service and its sign-in, and a sign-in open to any app; for one that needs no sign-in, CORS on
// the service; `npm run directory` checks again); otherwise through the gateway, once it relays to
// the service and its sign-in and holds the app a sign-in that registers none takes (D191, D214);
// otherwise not yet, shown but disabled. They are the services people
// at work use most, never a developer's tools or a payment's (D192). A logo is the brand's own
// file, in logos/ (D159).
// Host-agnostic: no DOM.

/**
 * @typedef {{ id: string, name: string, url?: string, includes?: string[], clientId?: string, ready?: boolean, hidden?: boolean, logo?: string, signIn?: string[], app?: string }} Known
 *   includes: the products it reaches, by name; clientId: one registered with the service, when it can't register Jean;
 *   signIn: the hosts its sign-in is reached at besides its server's, which a gateway relays to as well;
 *   app: its sign-in server (the issuer), when it takes only apps registered there, one of which the gateway holds
 */
/** @typedef {{ hosts?: string[], clients?: Record<string, string> }} Served  what the gateway serves: the hosts it relays to, and its apps by issuer */

/** @type {readonly Known[]} */
export const DIRECTORY = Object.freeze([
  { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', ready: true, logo: 'notion.svg' },
  { id: 'canva', name: 'Canva', url: 'https://mcp.canva.com/mcp', ready: true, logo: 'canva.svg' },
  { id: 'miro', name: 'Miro', url: 'https://mcp.miro.com/', ready: true, logo: 'miro.svg' },
  { id: 'granola', name: 'Granola', url: 'https://mcp.granola.ai/mcp', ready: true, logo: 'granola.png' },
  { id: 'clickup', name: 'ClickUp', url: 'https://mcp.clickup.com/mcp', ready: true, logo: 'clickup.png' },
  { id: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp', ready: true, logo: 'linear.svg' },
  // Its CORS allows any header with `*`, which the standard says leaves out Authorization, but
  // Chromium and WebKit let it through (D195).
  { id: 'atlassian', name: 'Atlassian', url: 'https://mcp.atlassian.com/v2/mcp', includes: ['Jira', 'Confluence'], ready: true, logo: 'atlassian.svg' },
  { id: 'intercom', name: 'Intercom', url: 'https://mcp.intercom.com/mcp', ready: true, logo: 'intercom.svg' },
  { id: 'wix', name: 'Wix', url: 'https://mcp.wix.com/mcp', ready: true, logo: 'wix.png' },
  { id: 'attio', name: 'Attio', url: 'https://mcp.attio.com/mcp', ready: true, logo: 'attio.svg' },
  { id: 'fireflies', name: 'Fireflies', url: 'https://api.fireflies.ai/mcp', ready: true, logo: 'fireflies.png' },
  // Web search with no key and no sign-in (D192).
  { id: 'exa', name: 'Exa', url: 'https://mcp.exa.ai/mcp', ready: true, logo: 'exa.svg' },
  // Google's servers are a developer preview that refuses browsers.
  { id: 'gmail', name: 'Gmail', url: 'https://gmailmcp.googleapis.com/mcp/v1', signIn: ['accounts.google.com', 'oauth2.googleapis.com'], app: 'https://accounts.google.com', logo: 'gmail.svg' },
  { id: 'google-drive', name: 'Google Drive', url: 'https://drivemcp.googleapis.com/mcp/v1', signIn: ['accounts.google.com', 'oauth2.googleapis.com'], app: 'https://accounts.google.com', logo: 'google-drive.svg' },
  { id: 'google-calendar', name: 'Google Calendar', url: 'https://calendarmcp.googleapis.com/mcp/v1', signIn: ['accounts.google.com', 'oauth2.googleapis.com'], app: 'https://accounts.google.com', logo: 'google-calendar.svg' },
  // Refuses any request that carries an Origin, as every browser's does.
  { id: 'microsoft-365', name: 'Microsoft 365', url: 'https://microsoft365.mcp.claude.com/mcp', includes: ['Outlook', 'OneDrive', 'SharePoint', 'Teams'], signIn: ['login.microsoftonline.com'], logo: 'microsoft-365.svg' },
  { id: 'slack', name: 'Slack', url: 'https://mcp.slack.com/mcp', signIn: ['slack.com'], app: 'https://mcp.slack.com', logo: 'slack.svg' },
  { id: 'dropbox', name: 'Dropbox', url: 'https://mcp.dropbox.com/mcp', signIn: ['www.dropbox.com', 'api.dropboxapi.com'], logo: 'dropbox.svg' },
  { id: 'google-chat', name: 'Google Chat', url: 'https://chatmcp.googleapis.com/mcp/v1', signIn: ['accounts.google.com', 'oauth2.googleapis.com'], app: 'https://accounts.google.com', logo: 'google-chat.svg' },
  { id: 'google-meet', name: 'Google Meet', logo: 'google-meet.svg' },
  { id: 'google-tasks', name: 'Google Tasks', logo: 'google-tasks.svg' },
  // Only registers the apps on its list.
  { id: 'figma', name: 'Figma', url: 'https://mcp.figma.com/mcp', signIn: ['api.figma.com'], app: 'https://api.figma.com', logo: 'figma.svg' },
  // Refuse browsers, and register only the apps made on their sites.
  { id: 'asana', name: 'Asana', url: 'https://mcp.asana.com/v2/mcp', signIn: ['app.asana.com'], app: 'https://app.asana.com', logo: 'asana.svg' },
  { id: 'zoom', name: 'Zoom', url: 'https://mcp.zoom.us/mcp/zoom/streamable', signIn: ['zoom.us'], app: 'https://zoom.us', logo: 'zoom.png' },
  { id: 'hubspot', name: 'HubSpot', url: 'https://mcp.hubspot.com/', app: 'https://mcp.hubspot.com', logo: 'hubspot.png' },
  // Registers only the apps made on its site.
  { id: 'box', name: 'Box', url: 'https://mcp.box.com/', signIn: ['api.box.com'], app: 'https://api.box.com', logo: 'box.png' },
  // Their sign-in refuses browsers, and most of them their service too.
  { id: 'monday', name: 'monday.com', url: 'https://mcp.monday.com/mcp', signIn: ['auth.monday.com'], logo: 'monday.png' },
  { id: 'airtable', name: 'Airtable', url: 'https://mcp.airtable.com/mcp', signIn: ['airtable.com'], logo: 'airtable.png' },
  { id: 'calendly', name: 'Calendly', url: 'https://mcp.calendly.com/', signIn: ['calendly.com'], logo: 'calendly.svg' },
  { id: 'otter', name: 'Otter.ai', url: 'https://mcp.otter.ai/mcp', signIn: ['otter.ai'], logo: 'otter.png' },
  { id: 'gamma', name: 'Gamma', url: 'https://mcp.gamma.app/mcp', signIn: ['auth.gamma.app'], logo: 'gamma.svg' },
  { id: 'zapier', name: 'Zapier', url: 'https://mcp.zapier.com/api/mcp/mcp', logo: 'zapier.png' },
  // Its service answers no browser.
  { id: 'todoist', name: 'Todoist', url: 'https://ai.todoist.net/mcp', signIn: ['todoist.com'], logo: 'todoist.png' },
])

/** @typedef {Known & { via: 'browser' | 'gateway' | null }} Listed  how it is reached now; null: not yet */

/**
 * The directory, with the organisation's entries merged in by id: one can add a service, change
 * an address or a client id, or hide one. What policy names is ready unless it says otherwise.
 * Those reached come first, from the browser or through the gateway: one that relays to the
 * service and its sign-in, and holds the app the sign-in takes when it registers none.
 * @param {{ directory?: Partial<Known>[] }} [policy] @param {Served} [served]
 * @returns {Listed[]}
 */
export function known(policy = {}, { hosts = [], clients = {} } = {}) {
  /** @type {Map<string, Known>} */
  const entries = new Map(DIRECTORY.map((entry) => [entry.id, entry]))
  for (const change of policy.directory ?? []) {
    const id = String(change.id ?? '')
    const before = entries.get(id)
    if (id && (before || change.name)) entries.set(id, /** @type {Known} */ ({ ...before, ready: true, ...change, id }))
  }
  const relayed = (/** @type {Known} */ { url, signIn = [], app, clientId }) => [String(url), ...signIn.map((host) => `https://${host}/`)].every((address) => covers(hosts, new URL(address)))
    && (!app || Boolean(clientId ?? clients[app]))
  const shown = [...entries.values()].filter((entry) => !entry.hidden)
    .map((entry) => ({ ...entry, via: !entry.url ? null : entry.ready ? 'browser' : relayed(entry) ? 'gateway' : null }))
  return /** @type {Listed[]} */ ([...shown.filter((entry) => entry.via), ...shown.filter((entry) => !entry.via)])
}

/**
 * The entry a connection was made from, by its address, while it is reached.
 * @param {string} url @param {{ directory?: Partial<Known>[] }} [policy] @param {Served} [served]
 */
export const knownFor = (url, policy, served) => known(policy, served).find((entry) => entry.via && entry.url === url)

/**
 * Whether the gateway relays to an address: HTTPS, or HTTP on this computer, to a host it names
 * or one of its subdomains, as the gateway itself checks (gateway/gateway.js).
 * @param {string[]} hosts @param {URL} url
 */
export const covers = (hosts, url) => (url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)))
  && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
