// Colours as WCAG reads them, for a design's marks (caps/designs/checks.js) and for the project's look wherever it goes
// (ui/kit.js, D601): the contrast of two colours, the nearest one that reads on a ground, and a mix of two. Pure.

/** WCAG's contrast ratio of two colours, #rgb or #rrggbb. @param {string} one @param {string} other */
export function contrast(one, other) {
  const luminance = (/** @type {string} */ hex) => {
    const digits = hex.replace('#', '')
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [high, low] = [luminance(one), luminance(other)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

/** Two colours, #rrggbb, mixed: `share` of the second in the first. @param {string} one @param {string} other @param {number} share */
export const mix = (one, other, share) => `#${[1, 3, 5].map((at) => Math.round(parseInt(one.slice(at, at + 2), 16) * (1 - share) + parseInt(other.slice(at, at + 2), 16) * share).toString(16).padStart(2, '0')).join('')}`

/**
 * A colour as near `hex` as reads on `ground` at AA (4.5): its hue kept, mixed a twentieth at a time toward black or
 * white, whichever `ground` stands further from, which always reads on it (√21 at worst). @param {string} hex #rrggbb @param {string} ground
 */
export function readable(hex, ground) {
  const to = contrast('#000000', ground) > contrast('#ffffff', ground) ? '#000000' : '#ffffff', mixed = (/** @type {number} */ step) => mix(hex, to, step / 20)
  return mixed([...Array(21).keys()].find((step) => contrast(mixed(step), ground) >= 4.5) ?? 20)
}
