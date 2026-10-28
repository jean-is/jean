// The glyphs the first screen draws (the box and the line under it, the answers, the header): 24×24, one pen, the current colour (docs/design.md#icons).
// The drawer, the menus and Settings import ui/menu-icons.js, which adds the rest.
import { html, svg } from 'lit-html'

/** @param {unknown} paths @param {string} [extra] */
export const icon = (paths, extra = '') => html`<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`

export const icons = {
  send: icon(svg`<path d="M12 19.5V5M6 11l6-6 6 6"/>`),
  stop: icon(svg`<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>`),
  plus: icon(svg`<path d="M12 5v14M5 12h14"/>`),
  attach: icon(svg`<path d="m19 11.5-7.1 7.1a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4a3 3 0 0 1 4.2 4.2l-7.3 7.3a1.5 1.5 0 0 1-2.1-2.1l6.6-6.6"/>`),
  capture: icon(svg`<path d="M4.5 9V6.5a2 2 0 0 1 2-2H9M15 4.5h2.5a2 2 0 0 1 2 2V9M19.5 15v2.5a2 2 0 0 1-2 2H15M9 19.5H6.5a2 2 0 0 1-2-2V15"/><circle cx="12" cy="12" r="3"/>`),
  mic: icon(svg`<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>`),
  voice: icon(svg`<path d="M5.5 7.5a7 7 0 0 0 0 9M18.5 7.5a7 7 0 0 1 0 9M7.5 12q2.25-3.6 4.5 0t4.5 0"/>`),
  close: icon(svg`<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>`),
  copy: icon(svg`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V7A2.5 2.5 0 0 0 13 4.5H7A2.5 2.5 0 0 0 4.5 7v6A2.5 2.5 0 0 0 7 15.5h1.5"/>`),
  retry: icon(svg`<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9"/>`),
  fork: icon(svg`<path d="M7 4v16M7 15c0-4.7 3.3-8.5 10.5-8.5M14 3l3.5 3.5L14 10"/>`, 'flip-rtl'),
  speaker: icon(svg`<path d="M4.5 9.5v5h3l4.5 4v-13l-4.5 4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`, 'flip-rtl'),
  chevron: icon(svg`<path d="m7 10 5 5 5-5"/>`),
  external: icon(svg`<path d="M7 17 17 7M9 7h8v8"/>`, 'flip-rtl'),
  search: icon(svg`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.1 15.1 4.9 4.9"/>`),
  sidebar: icon(svg`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>`, 'flip-rtl'),
  brain: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M7 12q2.5-4 5 0t5 0"/>`),
  'brain-device': icon(svg`<rect x="4.5" y="4.5" width="15" height="11" rx="2.5"/><path d="M3 19.5h18M8 10q2-3.2 4 0t4 0"/>`),
  file: icon(svg`<path d="M13.5 3.5H8A2.5 2.5 0 0 0 5.5 6v12A2.5 2.5 0 0 0 8 20.5h8a2.5 2.5 0 0 0 2.5-2.5V8.5Z"/><path d="M13.5 3.5V7A1.5 1.5 0 0 0 15 8.5h3.5M9 13h6M9 16.5h4"/>`),
  globe: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5Z"/>`),
  alarm: icon(svg`<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M4.5 7 7 4.5M19.5 7 17 4.5"/>`),
  since: icon(svg`<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9M12 8v4l2.5 1.5"/>`),
  camera: icon(svg`<path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/>`),
  helpers: icon(svg`<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M14.5 14.6a4.5 4.5 0 0 1 6 4.9"/>`),
}
