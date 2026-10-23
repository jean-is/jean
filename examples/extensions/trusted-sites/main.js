// Trusted sites, an example of an extension for Jean (D296). Jean asks you before it opens a page (in its
// browser, or the computer reaching a site). When it does, this extension offers, above the box, to trust
// that site; once trusted, its pages open without asking, and other sites still ask. It uses the loosen
// right, which an extension's card names apart: Jean never lets it loosen a reserved action (passwords,
// payments), nor a rule your organisation set, and your own guards still apply after it.
//
// Rights it asks for: watch (to hook tool.check), loosen (to let a call go ahead without asking) and
// draw (the offer above the box, and the sites trusted in its row of Settings › Extensions).

/** @param {(event: string, match: object | Function, run?: Function) => void} on @param {any} $ */
export async function register(on, $) {
  /** @type {string[]} the sites trusted, by host (with its port, if any) */
  let trusted = (await $.store.get('trusted')) ?? []
  /** The site Jean last asked about, to offer to trust. */
  let offered = ''

  // Only actions that reach a site (kind fetch). What the rules and the action's check decided comes
  // first; only a call they would ask about is let go, and only for a site trusted.
  on('tool.check', { kind: 'fetch' }, async (e, next) => {
    const said = await next(e)
    const site = siteOf(e.args)
    if (!site || said?.decision !== 'ask') return said
    if (trusted.includes(site)) return { decision: 'allow' }
    if (offered !== site) {
      offered = site
      $.redraw()
    }
    return said
  })

  $.slot('above', () => (offered && !trusted.includes(offered) ? { row: [
    { text: `Open pages from ${offered} without asking, from now on?` },
    { button: 'Trust it', action: 'trust' },
    { button: 'Not now', action: 'dismiss' },
  ] } : null))

  $.slot('settings', () => (trusted.length
    ? trusted.map((site) => ({ row: [{ text: site }, { button: 'Stop trusting', action: `forget:${site}` }] }))
    : { text: 'No site is trusted yet. When Jean asks to open a page, this offers above the box to trust its site.', muted: true }))

  $.press(async (action) => {
    if (action === 'trust') trusted = [...new Set([...trusted, offered])]
    if (action.startsWith('forget:')) trusted = trusted.filter((site) => site !== action.slice(7))
    if (action !== 'dismiss') await $.store.set('trusted', trusted)
    offered = ''
    $.redraw()
  })
}

/** The site an action reaches: a page's address (browse), or a site the computer asks to reach. @param {any} args */
function siteOf(args) {
  try {
    if (typeof args?.url === 'string') return new URL(args.url).host
    if (typeof args?.site === 'string') return new URL(/^[a-z]+:/i.test(args.site) ? args.site : `https://${args.site}`).host
  } catch {}
  return ''
}
