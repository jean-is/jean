// jean.is's tiles (D397): one row of what Jean makes, turned a view at a time, under the app's first screen (ui/home.js).

/** The tiles' row turned a view at a time by its buttons, each hidden where the row ends, whichever way the page reads. @param {Element} home */
export function tiles(home) {
  const row = home.querySelector('.home-tiles')
  const [back, next] = home.querySelectorAll('.home-turn')
  if (!(row instanceof HTMLElement) || !(back instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) return
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
