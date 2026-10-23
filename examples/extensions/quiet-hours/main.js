// Quiet hours, an example of an extension for Jean (D296). During the hours you choose, Jean asks you first
// before doing anything but reading, searching and thinking, and deletes nothing; the rest of the time,
// your rules stand as they are. It is a guard made by someone else: it only ever makes Jean more careful
// (the refuse right), so it can never let an action through that your rules would stop.
//
// Rights it asks for: watch (to hook tool.check), refuse (to ask first, or say no), draw (a band above the
// box while it is quiet, and its row in Settings › Extensions) and notify.

/** The hours to choose from: from, to (on the next day when earlier), on a 24-hour clock. */
const HOURS = {
  evenings: { label: 'Evenings, 20:00 to 8:00', from: 20, to: 8 },
  nights: { label: 'Nights, 22:00 to 7:00', from: 22, to: 7 },
  always: { label: 'All the time', from: 0, to: 24 },
  off: { label: 'Never', from: 0, to: 0 },
}
/** What it lets through, quiet or not: what only reads. */
const READING = ['read', 'search', 'think']

/** @param {(event: string, match: object | Function, run?: Function) => void} on @param {any} $ */
export async function register(on, $) {
  let hours = HOURS[await $.store.get('hours')] ? await $.store.get('hours') : 'evenings'
  let paused = (await $.store.get('paused')) ?? 0

  /** Whether it is quiet now, and until when. */
  const now = () => {
    const { from, to } = HOURS[hours]
    const at = new Date()
    const hour = at.getHours()
    const quiet = Date.now() >= paused && from !== to && (from < to ? hour >= from && hour < to : hour >= from || hour < to)
    const until = new Date(at)
    until.setHours(to % 24, 0, 0, 0)
    if (until <= at) until.setDate(until.getDate() + 1)
    return { quiet, until }
  }

  // Before an action runs: the rules and the action's own check first (next), then, if it is quiet,
  // something more careful. Only more careful: what the rules refused stays refused.
  on('tool.check', async (e, next) => {
    const said = await next(e)
    if (!now().quiet || said?.refuse || said?.decision === 'never' || READING.includes(e.kind)) return said
    if (e.kind === 'delete') return { decision: 'never', reason: 'It is quiet hours: nothing is deleted now. Tell the user, and offer to do it later.' }
    return said?.decision === 'allow' ? { decision: 'ask' } : said
  })

  // The band above the box, while it is quiet; drawn again when that changes.
  $.slot('above', () => {
    const { quiet, until } = now()
    if (!quiet) return null
    return { row: [
      { text: `Quiet hours${HOURS[hours].to === 24 ? '' : ` until ${clock(until)}`}: I'll ask you first before doing anything but reading.` },
      { button: 'Pause for an hour', action: 'pause' },
    ] }
  })

  $.slot('settings', () => {
    const { quiet } = now()
    return [
      { text: Date.now() < paused ? `Paused until ${clock(new Date(paused))}.` : quiet ? 'Quiet now.' : 'Not quiet now.', muted: true },
      { row: Object.entries(HOURS).map(([id, { label }]) => ({ button: id === hours ? `✓ ${label}` : label, action: `hours:${id}` })) },
      ...(Date.now() < paused ? [{ button: 'Resume', action: 'resume' }] : []),
    ]
  })

  $.press(async (action) => {
    if (action.startsWith('hours:')) {
      hours = action.slice(6)
      paused = 0
      await Promise.all([$.store.set('hours', hours), $.store.set('paused', 0)])
    }
    if (action === 'pause') {
      paused = Date.now() + 60 * 60 * 1000
      await $.store.set('paused', paused)
      $.notify(`Paused until ${clock(new Date(paused))}.`)
    }
    if (action === 'resume') {
      paused = 0
      await $.store.set('paused', 0)
    }
    $.redraw()
  })

  // Each minute, the band follows the clock.
  let was = now().quiet
  setInterval(() => {
    if (now().quiet !== was) $.redraw()
    was = now().quiet
  }, 60 * 1000)
}

/** @param {Date} date */
const clock = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
