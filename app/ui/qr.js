// A QR code for a phone's camera: a shared link's, a design's, a device's to pair. Only capabilities import this module,
// so lean-qr's smallest build, their runtime (vendor/lean-qr), loads with them; where it isn't installed, there is no code.
const qr = await import(new URL('../vendor/lean-qr/lean-qr.mjs', import.meta.url).href).catch(() => null)
/** Each QR code drawn, by what it holds. @type {Map<string, { size: number, d: string } | null>} */
const codes = new Map()
/** A QR code for an address or words: how many modules to a side, and its dark ones as one path, a square each; null for nothing, too much, or no lean-qr. @param {string} [text] */
export function codeOf(text = '') {
  if (text && qr && !codes.has(text)) try { const { size, get } = qr.generate(text), d = []; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (get(x, y)) d.push(`M${x} ${y}h1v1h-1z`); codes.set(text, { size, d: d.join('') }) } catch { codes.set(text, null) }
  return codes.get(text) ?? null
}
