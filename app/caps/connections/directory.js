// The services Jean already knows (D95): click one, sign in, done. An address here is a provider
// identity, like a brain's (D33), and policy can replace it (`directory` in policy.json). Each is
// reached from the browser, once checked from one (`ready`: CORS that lets Authorization through, on
// the service and its sign-in, and a sign-in open to any app, or to the one policy names; for one that
// needs no sign-in, CORS on the service; `npm run directory` checks again); otherwise through the gateway, once it relays to
// the service and its sign-in and holds the app a sign-in that registers none takes (D191, D214);
// otherwise not yet, shown but disabled. They are the services people
// at work use most, never a developer's tools or a payment's (D192). A logo is the brand's own
// file, in logos/ (D159). One that searches the web says so (`searches`), and Settings › Web
// search offers it until it is connected; once it is, its tools say it themselves (D271).
// Host-agnostic: no DOM.
import { locale } from '../../core/i18n.js'
import { byName } from '../../core/search.js'

/**
 * @typedef {{ id: string, name: string, url?: string, servers?: string[], includes?: string[], clientId?: string, ready?: boolean, hidden?: boolean, logo?: string, signIn?: string[], app?: string, scopes?: string[], authorize?: Record<string, string>, searches?: boolean, api?: boolean }} Known
 *   servers: the further servers its one sign-in reaches; includes: the products it reaches, by name;
 *   clientId: one registered with the service, when it can't register Jean; searches: it searches the web;
 *   scopes: what its sign-in asks for, at once, rather than connecting without one first; authorize: more for its sign-in's address;
 *   signIn: the hosts its sign-in is reached at besides its server's, which a gateway relays to as well;
 *   app: its sign-in server (the issuer), when it takes only apps registered there: the one policy names, or else the gateway's;
 *   api: no MCP server, but an API that answers browsers, which Jean's own tools call (apis.js), its sign-in through the gateway unless it is ready
 */

/** @typedef {{ hosts?: string[], clients?: Record<string, string> }} Served  what the gateway serves: the hosts it relays to, and its apps by issuer */

/** Google's sign-in, which takes only apps registered with Google, offline, since Google renews only then (D344). @param {string[]} scopes */
const google = (scopes) => ({ signIn: ['accounts.google.com', 'oauth2.googleapis.com'], app: 'https://accounts.google.com', authorize: { access_type: 'offline', prompt: 'consent' }, scopes: scopes.map((scope) => `https://www.googleapis.com/auth/${scope}`) })

export const DIRECTORY = Object.freeze(/** @type {Known[]} */ ([
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
  { id: 'exa', name: 'Exa', url: 'https://mcp.exa.ai/mcp', ready: true, logo: 'exa.svg', searches: true },
  // Any Google account's, each asking only for what its own tools need (D349).
  { id: 'gmail', name: 'Gmail', url: 'https://gmail.googleapis.com/gmail/v1/users/me/', api: true, ...google(['gmail.modify']), logo: 'gmail.svg' },
  { id: 'google-calendar', name: 'Google Calendar', url: 'https://www.googleapis.com/calendar/v3/', api: true, ...google(['calendar.events', 'calendar.calendarlist.readonly']), logo: 'google-calendar.svg' },
  { id: 'google-drive', name: 'Google Drive', url: 'https://www.googleapis.com/drive/v3/', api: true, ...google(['drive.readonly', 'drive.file']), logo: 'google-drive.svg' },
  // Google's servers, one a product, are a developer preview for Workspace accounts that refuses browsers.
  // One sign-in reaches them all, asking for what their tools need (D344).
  { id: 'google', name: 'Google Workspace', url: 'https://gmailmcp.googleapis.com/mcp/v1', servers: ['drive', 'docs', 'sheets', 'slides', 'calendar', 'chat'].map((product) => `https://${product}mcp.googleapis.com/mcp/v1`).concat('https://people.googleapis.com/mcp/v1'),
    includes: ['Gmail', 'Drive', 'Docs', 'Sheets', 'Slides', 'Calendar', 'Chat', 'Contacts'], logo: 'google.svg', ...google(['gmail.modify', 'drive.readonly', 'drive.file', 'documents', 'spreadsheets', 'presentations', 'calendar.events',
      'calendar.calendarlist.readonly', 'chat.messages.readonly', 'chat.spaces.readonly', 'chat.messages.create', 'contacts.readonly', 'directory.readonly', 'userinfo.profile']) },
  // Any Microsoft account's, through Microsoft Graph, its sign-in too from the browser: Microsoft's answers
  // browsers for an app registered there as a single-page app, whose id policy gives, one sign-in for all (D382).
  { id: 'microsoft-365', name: 'Microsoft 365', url: 'https://graph.microsoft.com/v1.0/', api: true, ready: true, includes: ['Outlook', 'OneDrive', 'SharePoint'], signIn: ['login.microsoftonline.com'],
    app: 'https://login.microsoftonline.com/common/v2.0', scopes: ['User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'Files.ReadWrite', 'Files.Read.All'], logo: 'microsoft-365.svg' },
  { id: 'slack', name: 'Slack', url: 'https://mcp.slack.com/mcp', signIn: ['slack.com'], app: 'https://mcp.slack.com', logo: 'slack.svg' },
  { id: 'dropbox', name: 'Dropbox', url: 'https://mcp.dropbox.com/mcp', signIn: ['www.dropbox.com', 'api.dropboxapi.com'], logo: 'dropbox.svg' },
  // Only registers the apps on its list.
  { id: 'figma', name: 'Figma', url: 'https://mcp.figma.com/mcp', signIn: ['api.figma.com'], app: 'https://api.figma.com', logo: 'figma.svg' },
  // Refuse browsers, and register only the apps made on their sites.
  { id: 'asana', name: 'Asana', url: 'https://mcp.asana.com/v2/mcp', signIn: ['app.asana.com'], app: 'https://app.asana.com', logo: 'asana.svg' },
  { id: 'zoom', name: 'Zoom', url: 'https://mcp.zoom.us/mcp/zoom/streamable', signIn: ['zoom.us'], app: 'https://zoom.us', logo: 'zoom.png' },
  { id: 'hubspot', name: 'HubSpot', url: 'https://mcp.hubspot.com/', app: 'https://mcp.hubspot.com', logo: 'hubspot.png' },
  // Registers only the apps made on its site.
  { id: 'box', name: 'Box', url: 'https://mcp.box.com/', signIn: ['api.box.com'], app: 'https://api.box.com', logo: 'box.png' },
  // Their sign-in refuses browsers, and most of them their service too.
  { id: 'monday', name: 'Monday', url: 'https://mcp.monday.com/mcp', signIn: ['auth.monday.com'], logo: 'monday.png' },
  { id: 'airtable', name: 'Airtable', url: 'https://mcp.airtable.com/mcp', signIn: ['airtable.com'], logo: 'airtable.png' },
  { id: 'calendly', name: 'Calendly', url: 'https://mcp.calendly.com/', signIn: ['calendly.com'], logo: 'calendly.svg' },
  { id: 'otter', name: 'Otter', url: 'https://mcp.otter.ai/mcp', signIn: ['otter.ai'], logo: 'otter.png' },
  { id: 'gamma', name: 'Gamma', url: 'https://mcp.gamma.app/mcp', signIn: ['auth.gamma.app'], logo: 'gamma.svg' },
  { id: 'zapier', name: 'Zapier', url: 'https://mcp.zapier.com/api/mcp/mcp', logo: 'zapier.png' },
  // A business's account, cards and invoices, not a payment service: its server sends no money, and a
  // transfer it prepares waits for approval in Qonto's own app (D352). It and its sign-in answer no browser.
  { id: 'qonto', name: 'Qonto', url: 'https://mcp.qonto.com/mcp', logo: 'qonto.png' },
  // Its service answers no browser.
  { id: 'todoist', name: 'Todoist', url: 'https://ai.todoist.net/mcp', signIn: ['todoist.com'], logo: 'todoist.png' },
  // Each company's own instance, whose address policy gives, with the app its admin registered
  // there, since it registers none; it answers no browser, whatever the address (D283).
  { id: 'servicenow', name: 'ServiceNow', ready: false, logo: 'servicenow.png' },
]))

/** @typedef {Known & { via: 'browser' | 'gateway' | null }} Listed  how it is reached now; null: not yet */

/**
 * The directory, with the organisation's entries merged in by id: one can add a service, change
 * an address or a client id, or hide one. What policy names is ready unless it, or the directory, says otherwise.
 * Those reached come first, from the browser (one whose sign-in takes only registered apps, once policy names one) or through the gateway: one that relays to the
 * service, each of its servers and its sign-in (an API's sign-in alone), and holds the app the sign-in takes when it registers none. Each part is by name.
 * @param {{ directory?: Partial<Known>[] }} [policy] @param {Served} [served]
 * @returns {Listed[]}
 */
export function known(policy = {}, { hosts = [], clients = {} } = {}) {
  /** @type {Map<string, Known>} */
  const entries = new Map(DIRECTORY.map((entry) => [entry.id, entry]))
  for (const change of policy.directory ?? []) {
    const id = String(change.id ?? '')
    if (id && (entries.has(id) || change.name)) entries.set(id, /** @type {Known} */ ({ ready: true, ...entries.get(id), ...change, id }))
  }
  const relayed = (/** @type {Known} */ { url, servers = [], signIn = [], app, clientId, api }) => [...(api ? [] : [String(url), ...servers]), ...signIn.map((host) => `https://${host}/`)].every((address) => covers(hosts, new URL(address)))
    && (!app || Boolean(clientId ?? clients[app]))
  const shown = byName([...entries.values()].filter((entry) => !entry.hidden), (entry) => entry.name, locale.value)
    .map((entry) => ({ ...entry, via: !entry.url ? null : entry.ready && (!entry.app || entry.clientId) ? 'browser' : relayed(entry) ? 'gateway' : null }))
  return /** @type {Listed[]} */ ([...shown.filter((entry) => entry.via), ...shown.filter((entry) => !entry.via)])
}

/** The address of a service's logo, from its file's name. @param {string} logo */
export const logoAt = (logo) => new URL(`logos/${logo}`, import.meta.url).href

/**
 * The services Jean knows that search the web and a click connects, those already connected left
 * out: Settings › Web search offers them (D271). @param {Listed[]} listed @param {{ url: string }[]} connections
 */
export const searchers = (listed, connections) => listed.filter((entry) => entry.searches && entry.via && !connections.some((connection) => connection.url === entry.url))

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
