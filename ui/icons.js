// About twenty inline icons, 24×24, drawn with the current colour.
import { html, svg } from 'lit-html'

/** @param {unknown} paths @param {string} [extra] */
const icon = (paths, extra = '') => html`<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`

export const icons = {
  send: icon(svg`<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>`),
  stop: icon(svg`<rect x="7" y="7" width="10" height="10" rx="2"/>`),
  plus: icon(svg`<path d="M12 5v14M5 12h14"/>`),
  history: icon(svg`<path d="M4 6h16M4 12h16M4 18h10"/>`),
  globe: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5Z"/>`),
  gear: icon(svg`<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>`),
  close: icon(svg`<path d="M6 6l12 12M18 6 6 18"/>`),
  speaker: icon(svg`<path d="M4 10v4h3.5L12 18V6L7.5 10H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`),
  copy: icon(svg`<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`),
  check: icon(svg`<path d="M5 12.5 10 17 19 7"/>`),
  chevron: icon(svg`<path d="m8 10 4 4 4-4"/>`),
  spark: icon(svg`<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z"/>`),
  trash: icon(svg`<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>`),
  retry: icon(svg`<path d="M5 12a7 7 0 1 0 2-4.9M5 4v4h4"/>`),
  key: icon(svg`<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2"/>`),
  computer: icon(svg`<rect x="3.5" y="5" width="17" height="11" rx="2"/><path d="M9 20h6M12 16v4"/>`),
  arrow: icon(svg`<path d="M5 12h14M13 6l6 6-6 6"/>`, 'flip-rtl'),
}
