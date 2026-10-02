// About thirty inline icons, 24×24, drawn with the current colour.
import { html, svg } from 'lit-html'

/** @param {unknown} paths @param {string} [extra] */
const icon = (paths, extra = '') => html`<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`

export const icons = {
  send: icon(svg`<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>`),
  stop: icon(svg`<rect x="7" y="7" width="10" height="10" rx="2"/>`),
  plus: icon(svg`<path d="M12 5v14M5 12h14"/>`),
  history: icon(svg`<path d="M4 6h16M4 12h16M4 18h10"/>`),
  globe: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5Z"/>`),
  contrast: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/>`),
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
  attach: icon(svg`<path d="m19 11.5-7.1 7.1a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4a3 3 0 0 1 4.2 4.2l-7.3 7.3a1.5 1.5 0 0 1-2.1-2.1l6.6-6.6"/>`),
  mic: icon(svg`<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>`),
  file: icon(svg`<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>`),
  download: icon(svg`<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>`),
  upload: icon(svg`<path d="M12 15.5v-11M7 9l5-5 5 5M5 19.5h14"/>`),
  print: icon(svg`<path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>`),
  table: icon(svg`<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 5v14"/>`),
  house: icon(svg`<path d="M4 11.5 12 5l8 6.5M6 10v9.5h12V10"/><path d="M10.5 19.5v-4.5h3v4.5"/>`),
  calc: icon(svg`<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 7.5h7M8.5 12h1M11.5 12h1M14.5 12h1M8.5 16h1M11.5 16h1M14.5 16h1"/>`),
  lamp: icon(svg`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>`),
  note: icon(svg`<path d="M6 3.5h9l3.5 3.5v13.5H6Z"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>`),
  pin: icon(svg`<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3Z"/><path d="M12 14v6"/>`),
  repeat: icon(svg`<path d="M5 11V9.5A3.5 3.5 0 0 1 8.5 6H19M16 3l3 3-3 3M19 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M8 21l-3-3 3-3"/>`, 'flip-rtl'),
  rooms: icon(svg`<path d="M3.5 10.5 12 4l8.5 6.5V20h-17Z"/><path d="M12 20v-6M3.5 14h17"/>`),
  code: icon(svg`<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/>`),
  chip: icon(svg`<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>`),
}
