// jean.is's tiles (D397): one active at a time, its Try the primary one and its replay the one shown, the row turned a
// view at a time, a choice in the filter making its first one active. The same under the app's first screen
// (ui/home.js) and on About Jean's own page, which has it written into its script as it is here (site/about/page.js),
// so it imports nothing.

/**
 * The active tile, which assistive technologies hear as the current one, its Try the primary one and its replay
 * the one shown (a polite live region, heard without moving the focus); one at all times, a visible one.
 * @param {Element} home @param {Element | null | undefined} tile
 */
function activate(home, tile) {
  const tiles = [...home.querySelectorAll('.home-tile')]
  const active = tile && tile.checkVisibility() ? tile : tiles.find((one) => one.matches('.is-active') && one.checkVisibility()) ?? tiles.find((one) => one.checkVisibility())
  for (const one of tiles) {
    one.classList.toggle('is-active', one === active)
    one.querySelector('[data-try]')?.classList.toggle('primary', one === active)
    if (one === active) one.setAttribute('aria-current', 'true')
    else one.removeAttribute('aria-current')
  }
  const key = active?.querySelector('[data-try]')?.getAttribute('data-try')
  for (const replay of home.querySelectorAll('.home-replay')) replay.toggleAttribute('inert', replay.getAttribute('data-replay') !== key)
}

/** The tiles' row turned a view at a time by its buttons, each hidden where the row ends, whichever way the page reads. @param {Element} home */
function turning(home) {
  const row = home.querySelector('.home-tiles')
  const [back, next] = home.querySelectorAll('.home-turn')
  if (!(row instanceof HTMLElement) || !(back instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) return () => {}
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
  return () => { row.scrollTo({ left: 0 }); ends() }
}

/** The tiles of a page, made to work: the pointer, a tap or the keyboard picks the active one, and the filter starts over. @param {Element} home */
export function tiles(home) {
  for (const type of ['pointerover', 'focusin']) home.addEventListener(type, (event) => event.target instanceof Element && event.target.closest('.home-tile') && activate(home, event.target.closest('.home-tile')))
  const back = turning(home)
  home.querySelector('.home-filter')?.addEventListener('change', () => { activate(home, null); back() })
}
