// Together (D733): people work on one thing at once, each keeping their own copy, a journal on the relay keeping the copies in step.
// This module registers it: Share's "Work on it together" (./page.js `how`), the faces at the head of a shared thing's pane, its dialog,
// and the #/join/ address. The visible tab follows every circle kept here (./engine.js), one tab at a time across tabs, and lets go 30
// seconds after Jean is hidden; each member still in says so every 20 seconds, which the faces show. Found from Share, an invitation or
// a link: nothing of it shows before.
import { html } from 'lit-html'
import { register } from '../../ui/caps.js'
import { app } from '../../ui/state.js'
import { mine } from '../../ui/opfs.js'
import { useStrings } from '../../core/i18n.js'
import { apart } from '../sync/mirror.js'
import { circles, circleOf, follow, all, here, join } from './engine.js'
import { how, faces, asked } from './page.js'

await useStrings('together')

/** @type {(() => void) | null} */
let release = null
/** Every circle followed, from this tab alone while it is in sight: it takes them from another that had them. */
async function wake() {
  if (document.hidden || release) return
  const run = async () => { for (const [id, kept] of await all()) if (!circles.peek().has(id)) follow(id, kept).catch((error) => console.warn('Together', error)) }
  if (!navigator.locks) return run()
  navigator.locks.request(mine('app-together'), { steal: true }, () => new Promise((resolve) => { release = () => resolve(undefined); run() }))
    .catch(() => {}).finally(() => { release = null; for (const live of circles.peek().values()) { live.stop(); live.unwatch?.() } circles.value = new Map() })
}
document.addEventListener('visibilitychange', () => (document.hidden ? setTimeout(() => { if (document.hidden) release?.() }, 30_000) : wake()))
setInterval(() => { if (!document.hidden) for (const live of circles.peek().values()) here(live) }, 20_000)
// Sync and the store carry none of what is worked on together, from the first round on (caps/sync/mirror.js).
for (const [, kept] of await all()) if (kept.place) apart.add(`${kept.place.dir}/${kept.place.folder}`)
wake()

/** A #/join/ link: one question, the name the others see (./page.js). */
export function fromAddress() {
  asked.value = { link: location.hash.slice('#/join/'.length) }
  history.replaceState(null, '', `${location.pathname}#/`)
  app.dialog.value = 'together'
}

/** An invitation People brought (caps/people): joined as the name the person gives themselves. @param {{ value: { link: string, invite: object } }} one @param {string} name */
export const joinInvite = (one, name) => join(one.value.link, { name, invite: one.value.invite })

register({ id: 'together', slots: {
  // Share's second question, how, for what can be worked on together (caps/share/dialog.js).
  how: { at: 1, draw: how },
  // The faces of who is in, at the head of a collection's pane worked on together.
  head: { at: 0, draw: (/** @type {{ uri: string }} */ file) => ((live) => (live ? faces(live) : null))(circleOf(file.uri)) },
  dialog: { at: 2, draw: () => html`<app-together-dialog></app-together-dialog>` },
} })
