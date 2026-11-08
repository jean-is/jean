// The reader's languages first in a menu of languages, as the person's menu lists them (ui/inbox.js): the homepage's,
// from ui/home.js, and every other page of the site's, which runs it as written, site/site.js copying it with
// preferredLocales into their script (MENU), so it names nothing else.
import { preferredLocales } from '../core/i18n.js'

/**
 * Of a list of languages, a link each with its lang, the reader's move to a list before it, in the browser's order, a
 * line between, as the person's menu groups them; every one theirs, they only take that order. Once per list.
 * @param {Element} list @param {readonly string[]} preferred  navigator.languages
 */
export function yoursFirst(list, preferred) {
  const rows = [...list.children], codes = rows.map((row) => row.firstElementChild?.getAttribute('lang') ?? '')
  const yours = preferredLocales(codes, preferred).map((code) => rows[codes.indexOf(code)])
  if (yours.length === rows.length) return list.prepend(...yours)
  if (!yours.length) return
  const group = document.createElement('ul')
  group.append(...yours)
  list.before(group, document.createElement('hr'))
}
