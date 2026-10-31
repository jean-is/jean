// The user's touches over a look (D111): an accent, a background, a text size, a typeface, and
// their own CSS. Loaded with Settings, or at start when there are some (ui/looks.js touched()).

/** @typedef {import('../core/settings.js').Look} Look */

/** Typefaces for the text; headings keep the look's. Generic names last, so every script finds its own. */
export const FONTS = Object.freeze({
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', 'Helvetica Neue', sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Noto Serif', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
})

/** A room's colour: Jean's sunflower, then around the colour wheel, past its own band and the red of errors
 * (teal is Jean's former water), then Tilde's warm grey, its paper's hue, told apart by having no colour.
 * The hue and chroma tint the wave; picked in Settings › Appearance, an accent. */
export const COLOURS = [['sunflower', 'oklch(0.845 0.161 88)'], ['green', 'oklch(0.74 0.17 150)'], ['teal', 'oklch(0.781 0.118 209)'], ['blue', 'oklch(0.74 0.17 260)'],
  ['violet', 'oklch(0.74 0.17 295)'], ['fuchsia', 'oklch(0.74 0.17 325)'], ['rose', 'oklch(0.74 0.17 355)'], ['grey', 'oklch(0.74 0.012 90)']]

/** Text sizes the slider offers, as a share of the browser's. */
export const SIZES = Object.freeze({ min: 0.85, max: 1.3, step: 0.05 })

const HEX = /^#[0-9a-f]{6}$/i
/** @param {unknown} value @returns {value is string} */
const isHex = (value) => typeof value === 'string' && HEX.test(value)
/** An accent: a hex colour, or one of the eight (`COLOURS`). @param {unknown} value @returns {value is string} */
const isAccent = (value) => isHex(value) || COLOURS.some(([, colour]) => colour === value)

/**
 * The user's touches as CSS, over any look. A colour keeps its hue and some of its chroma, at a
 * lightness that keeps text readable by night and by day (WCAG AA); `!important` puts it over the
 * look's own, and a project's light (an inline --tint) still wins over the accent's. Only checked
 * values are written into the CSS; the user's own CSS comes last, as they wrote it.
 * @param {Look} [look]
 */
export function customCSS(look = {}) {
  const { accent, background, size, font, css } = look
  const rules = []
  if (isAccent(accent)) {
    rules.push(`:root { --tint: ${accent}; --flame: oklch(from ${accent} 0.78 min(c, 0.16) h) !important; --flame-deep: oklch(from ${accent} 0.66 min(c, 0.16) h) !important; --on-flame: oklch(from ${accent} 0.2 min(c, 0.03) h) !important; }`)
    rules.push(`:root[data-theme='light'] { --flame: oklch(from ${accent} 0.5 min(c, 0.17) h) !important; --flame-deep: oklch(from ${accent} 0.45 min(c, 0.15) h) !important; --on-flame: oklch(0.99 0 0) !important; }`)
  }
  if (isHex(background)) {
    rules.push(`:root { --room: oklch(from ${background} clamp(0.1, l, 0.22) min(c, 0.05) h) !important; --room-2: oklch(from ${background} clamp(0.17, calc(l + 0.06), 0.28) min(c, 0.05) h) !important; --glass: oklch(from ${background} clamp(0.17, calc(l + 0.06), 0.28) min(c, 0.05) h / 0.9) !important; }`)
    rules.push(`:root[data-theme='light'] { --room: oklch(from ${background} clamp(0.93, l, 0.99) min(c, 0.04) h) !important; --room-2: oklch(from ${background} clamp(0.97, calc(l + 0.03), 1) min(c, 0.02) h) !important; --glass: oklch(from ${background} clamp(0.97, calc(l + 0.03), 1) min(c, 0.02) h / 0.9) !important; }`)
  }
  if (typeof size === 'number' && size >= SIZES.min && size <= SIZES.max && size !== 1) rules.push(`html { font-size: ${Math.round(size * 100)}%; }`)
  if (typeof font === 'string' && Object.hasOwn(FONTS, font)) rules.push(`:root { --sans: ${FONTS[/** @type {keyof typeof FONTS} */ (font)]} !important; }`)
  if (typeof css === 'string' && css.trim()) rules.push(css)
  return rules.join('\n')
}
