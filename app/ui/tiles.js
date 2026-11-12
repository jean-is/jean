// SPDX-License-Identifier: MIT
// jean.is's tiles (D397): one row of what Jean makes, dealt anew each visit, turned a view at a time, under the app's
// first screen (ui/home.js).

/** Each tile's place in the row, by its Try, drawn once a visit: every language's page has them in that one order, so the place read stays (ui/home.js). @type {Record<string, number>} */
const places = {}

/**
 * The tiles dealt, before the page rises into view, so that none is always a turn away, the first one's Try the primary
 * one, whichever it is; their row turned a view at a time by its buttons, each hidden where the row ends, whichever way
 * the page reads. Without scripts, the row is as it is written.
 * @param {Element} home
 */
export function tiles(home) {
  const row = home.querySelector('.home-tiles')
  const [back, next] = home.querySelectorAll('.home-turn')
  if (!(row instanceof HTMLElement) || !(back instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) return
  const place = (/** @type {Element} */ tile) => (places[tile.querySelector('[data-try]')?.id ?? ''] ??= Math.random())
  row.append(...[...row.children].sort((a, b) => place(a) - place(b)))
  row.querySelectorAll('[data-try]').forEach((button, i) => button.classList.toggle('primary', !i))
  const ends = () => {
    const at = Math.abs(row.scrollLeft)
    back.disabled = at < 4
    next.disabled = at + row.clientWidth >= row.scrollWidth - 4
  }
  const way = () => (getComputedStyle(row).direction === 'rtl' ? -1 : 1)
  back.addEventListener('click', () => row.scrollBy({ left: -way() * row.clientWidth }))
  next.addEventListener('click', () => row.scrollBy({ left: way() * row.clientWidth }))
  row.addEventListener('scroll', ends, { passive: true })
  new ResizeObserver(ends).observe(row)
  row.parentElement?.classList.add('is-turning')
}
