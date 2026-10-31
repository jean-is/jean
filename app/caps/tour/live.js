// Show me: a help article's guided tour over the reader's own Jean, from the site's ?help=<article>. Jean
// opens at the page of Settings where the article's steps start, then each stop points at what a step names, found by
// the app's own string for it, and says the step's words, in Jean's language where the article has it, else in
// English. It only points and speaks: it clicks, types and changes nothing, and Escape ends it. Its stops are the
// site's file beside the article (help/<article>.<lang>.json, site/help/help.js), never words from the address.
import { openSettings } from '../../ui/dialogs.js'
import { show } from './tour.js'

/** How long a stop waits for what it points at to show: the first, on the page Jean opened; the others, while the reader finds their way there. */
const WAIT = [3000, 60_000]

/** An article's tour, played over Jean as it is. @param {string} article  its folder in site/help/ */
export async function start(article) {
  if (!/^[a-z-]+$/.test(article)) return
  const lang = document.documentElement.lang
  const at = (/** @type {string} */ code) => fetch(new URL(`../../help/${article}.${code}.json`, import.meta.url))
  let response = await at(lang)
  if (!response.ok && lang !== 'en') response = await at('en')
  if (!response.ok) return
  /** @type {{ open?: string, stops?: import('./tour.js').Stop[] }} */
  const tour = await response.json()
  if (tour.open) openSettings(/** @type {any} */ (tour.open))
  for (const [i, stop] of (tour.stops ?? []).entries()) if (await show(stop, lang, 1, WAIT[Math.min(i, 1)])) break
}
