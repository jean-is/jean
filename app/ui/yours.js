// SPDX-License-Identifier: MIT
// The reader's languages first in a menu of languages, as the person's menu lists them (ui/inbox.js): the homepage's,
// from ui/home.js, and every other page of the site's, which runs it as written, site/site.js copying it with
// preferredLocales into their script (MENU), so it names nothing else. Jean's own words for a browser's translation too.
import { preferredLocales } from '../core/i18n.js'

/**
 * The page the browser translates into a language Jean has, in Jean's own words instead (D723): Chrome writes the language
 * it translates into in <html lang>, which nothing else changes but the page's own language. Edge marks nothing, so it
 * translates on, as for a language Jean lacks. Once, from now, since a page that loads its watch late may be translated already.
 * @param {() => string[]} offered @param {() => string} own  the page's language @param {(code: string) => unknown} go
 */
export function untranslated(offered, own, go) {
  const root = document.documentElement
  const check = () => {
    const [code] = preferredLocales(offered(), [root.lang]).filter((code) => code !== own())
    if (code) { watch.disconnect(); go(code) }
  }
  const watch = new MutationObserver(check)
  watch.observe(root, { attributeFilter: ['lang'] })
  check()
}

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
