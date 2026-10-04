// The services Jean already knows (D95): click one, sign in, done. An address here is a provider
// identity, like a brain's (D33), and policy can replace it (`directory` in policy.json). Only an
// entry checked from a browser is `ready`: CORS that names Authorization, on the service and its
// sign-in, and a sign-in open to any app (`npm run directory` checks again). The others are listed
// as not yet, until their service opens up or an organisation points them at its own gateway.
// A logo is the brand's own file, in logos/ (D159).
// Host-agnostic: no DOM.

/**
 * @typedef {{ id: string, name: string, url?: string, includes?: string[], clientId?: string, ready?: boolean, hidden?: boolean, logo?: string }} Known
 *   includes: the products it reaches, by name; clientId: one registered with the service, when it can't register Jean
 */

/** @type {readonly Known[]} */
export const DIRECTORY = Object.freeze([
  { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', ready: true, logo: 'notion.svg' },
  { id: 'canva', name: 'Canva', url: 'https://mcp.canva.com/mcp', ready: true, logo: 'canva.svg' },
  { id: 'miro', name: 'Miro', url: 'https://mcp.miro.com/', ready: true, logo: 'miro.svg' },
  { id: 'granola', name: 'Granola', url: 'https://mcp.granola.ai/mcp', ready: true, logo: 'granola.png' },
  // Google's servers are a developer preview that refuses browsers.
  { id: 'gmail', name: 'Gmail', url: 'https://gmailmcp.googleapis.com/mcp/v1', logo: 'gmail.svg' },
  { id: 'google-drive', name: 'Google Drive', url: 'https://drivemcp.googleapis.com/mcp/v1', logo: 'google-drive.svg' },
  { id: 'google-calendar', name: 'Google Calendar', url: 'https://calendarmcp.googleapis.com/mcp/v1', logo: 'google-calendar.svg' },
  // Refuses any request that carries an Origin, as every browser's does.
  { id: 'microsoft-365', name: 'Microsoft 365', url: 'https://microsoft365.mcp.claude.com/mcp', includes: ['Outlook', 'OneDrive', 'SharePoint', 'Teams'], logo: 'microsoft-365.svg' },
  { id: 'slack', name: 'Slack', url: 'https://mcp.slack.com/mcp', logo: 'slack.svg' },
  { id: 'dropbox', name: 'Dropbox', url: 'https://mcp.dropbox.com/mcp', logo: 'dropbox.svg' },
  { id: 'google-chat', name: 'Google Chat', url: 'https://chatmcp.googleapis.com/mcp/v1', logo: 'google-chat.svg' },
  { id: 'google-meet', name: 'Google Meet', logo: 'google-meet.svg' },
  { id: 'google-tasks', name: 'Google Tasks', logo: 'google-tasks.svg' },
  // Only registers the apps on its list.
  { id: 'figma', name: 'Figma', url: 'https://mcp.figma.com/mcp', logo: 'figma.svg' },
  // Its CORS allows any header with `*`, which never covers Authorization.
  { id: 'atlassian', name: 'Atlassian', url: 'https://mcp.atlassian.com/v1/mcp', includes: ['Jira', 'Confluence'], logo: 'atlassian.svg' },
])

/**
 * The directory, with the organisation's entries merged in by id: one can add a service, change
 * an address or a client id, or hide one. What policy names is ready unless it says otherwise.
 * @param {{ directory?: Partial<Known>[] }} [policy]
 * @returns {{ ready: Known[], later: Known[] }}
 */
export function known(policy = {}) {
  /** @type {Map<string, Known>} */
  const entries = new Map(DIRECTORY.map((entry) => [entry.id, entry]))
  for (const change of policy.directory ?? []) {
    const id = String(change.id ?? '')
    const before = entries.get(id)
    if (id && (before || change.name)) entries.set(id, /** @type {Known} */ ({ ...before, ready: true, ...change, id }))
  }
  const shown = [...entries.values()].filter((entry) => !entry.hidden)
  return { ready: shown.filter((entry) => entry.ready && entry.url), later: shown.filter((entry) => !(entry.ready && entry.url)) }
}

/** The entry a connection was made from, by its address. @param {string} url @param {{ directory?: Partial<Known>[] }} [policy] */
export const knownFor = (url, policy) => known(policy).ready.find((entry) => entry.url === url)
