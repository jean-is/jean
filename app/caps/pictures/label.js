// The label the AI Act asks of whoever publishes a picture that could pass for real, or one on a matter
// of public interest (Art. 50(4), D324): a copy of a picture with the Commission's AI icon, which anyone
// may use without attribution, and "Made with AI" in the user's language, on a light pill in the corner
// where reading starts. Redrawn, it would lose its marks, so it is marked again as a trained model's
// (D279) and given Content Credentials, then saved.
import { t, locale, dir } from '../../core/i18n.js'
import { save } from '../../ui/save.js'
import { marked } from './mark.js'

/** The Commission's basic icon in its 566.93 square: the disk, then the A and its counter, then the I. */
const DISK = 'M272.03,100.72c100.92,0,182.74,81.82,182.74,182.75s-81.82,182.74-182.74,182.74-182.75-81.82-182.75-182.74,81.82-182.75,182.75-182.75Z'
const LETTERS = 'M170.79,353.74c-1.08,0-2.05-.43-2.92-1.31-.88-.87-1.31-1.84-1.31-2.92,0-.67.07-1.27.2-1.81l47.34-129.32c.4-1.48,1.24-2.79,2.52-3.93,1.27-1.14,3.05-1.71,5.34-1.71h29.81c2.28,0,4.06.57,5.34,1.71,1.27,1.14,2.11,2.45,2.52,3.93l47.14,129.32c.27.54.4,1.14.4,1.81,0,1.08-.44,2.05-1.31,2.92s-1.91,1.31-3.12,1.31h-24.78c-2.01,0-3.52-.5-4.53-1.51-1.01-1.01-1.65-1.91-1.91-2.72l-7.86-20.55h-53.78l-7.65,20.55c-.27.81-.88,1.71-1.81,2.72-.94,1.01-2.55,1.51-4.83,1.51h-24.78ZM218.13,299.96h37.47l-18.93-53.18-18.53,53.18Z'
  + 'M328.11,353.74c-1.48,0-2.69-.47-3.63-1.41-.94-.94-1.41-2.15-1.41-3.63v-130.93c0-1.48.47-2.68,1.41-3.63s2.15-1.41,3.63-1.41h26.99c1.48,0,2.68.47,3.63,1.41.94.94,1.41,2.15,1.41,3.63v130.93c0,1.48-.47,2.69-1.41,3.63-.94.94-2.15,1.41-3.63,1.41h-26.99Z'
/** As a button's sign: the disk with its letters cut out, in the button's own colour. */
export const MARK = DISK + LETTERS
/** The disk's corner and side in that square. */
const [LEFT, TOP, SIDE] = [89.28, 100.72, 365.49]

/**
 * Saves a copy of a picture with the label drawn in its corner, as a PNG under its name, marked as made by
 * a trained model, which one and at which revision. @param {Uint8Array} picture @param {string} name @param {string} maker @param {string} [revision]
 */
export async function saveLabelled(picture, name, maker, revision) {
  const bitmap = await createImageBitmap(new Blob([/** @type {BlobPart} */ (picture)]))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
  context.drawImage(bitmap, 0, 0)
  // The icon a fourteenth of the picture's shorter side, the words beside it, the pill around both, as far from the edges.
  const side = Math.max(20, Math.round(Math.min(bitmap.width, bitmap.height) / 14))
  const [words, rtl] = [t('pictures.label'), dir(locale.value) === 'rtl']
  const [pad, gap] = [side * 0.22, side * 0.3]
  context.direction = rtl ? 'rtl' : 'ltr'
  context.font = `600 ${Math.round(side * 0.5)}px system-ui, sans-serif`
  // Words too long for the picture are drawn smaller, to fit it.
  const room = bitmap.width - side * 1.2 - pad * 3 - side - gap
  const long = context.measureText(words).width
  if (long > room) context.font = `600 ${Math.max(8, Math.floor((side * 0.5 * room) / long))}px system-ui, sans-serif`
  const [width, height] = [pad + side + gap + Math.min(long, room) + pad * 2, side + pad * 2]
  const x = rtl ? bitmap.width - side * 0.6 - width : side * 0.6
  const y = bitmap.height - side * 0.6 - height
  context.fillStyle = 'rgb(255 255 255 / 0.9)'
  context.beginPath()
  context.roundRect(x, y, width, height, height / 2)
  context.fill()
  const iconX = rtl ? x + width - pad - side : x + pad
  context.save()
  context.translate(iconX, y + pad)
  context.scale(side / SIDE, side / SIDE)
  context.translate(-LEFT, -TOP)
  context.fillStyle = '#000'
  context.fill(new Path2D(MARK), 'evenodd')
  context.restore()
  context.fillStyle = '#000'
  context.textBaseline = 'middle'
  context.textAlign = 'start'
  context.fillText(words, rtl ? iconX - gap : iconX + side + gap, y + height / 2)
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
  const bytes = await (await import('../receipt/receipt.js')).credentialed(marked(png, maker, revision), maker, revision)
  save(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'image/png' }), name.replace(/\.\w+$/, '') + '.png')
}
