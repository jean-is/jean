// SPDX-License-Identifier: MIT
// Hands a file Jean made to the browser's downloads.

/** @param {Blob} blob @param {string} name */
export function save(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim()
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Prints what `holder` holds, alone: `on` on the root and `page`'s rule while the dialog is up, once `drawing()` says it is done, a few
 * seconds at most, and its faces are in; then gone. @param {Element} holder @param {string} on @param {{ page?: string, drawing?: () => boolean, ready?: () => void, gone?: () => void }} [options]
 */
export async function printAlone(holder, on, { page = '', drawing = () => false, ready, gone } = {}) {
  const rule = new CSSStyleSheet(), root = document.documentElement
  rule.replaceSync(page)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, rule]
  root.classList.add(on)
  for (let wait = 0; wait < 60 && drawing(); wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  await document.fonts.ready
  ready?.()
  addEventListener('afterprint', () => { root.classList.remove(on); document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== rule); gone?.(); holder.remove() }, { once: true })
  print()
}

/**
 * Puts a drawing on the clipboard two ways at once (D196): its source as text, for a box or an
 * editor, and its picture, a PNG, for a document. Where a browser can't hold both, or the picture
 * fails, the text alone. @param {string} text @param {Promise<Blob>} picture
 */
export async function copyDrawing(text, picture) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'image/png': picture })])
  } catch (error) {
    console.warn('Copy', error)
    await navigator.clipboard.writeText(text)
  }
}

/**
 * An SVG as a picture to put in a document, a PNG on white, twice as fine (D196, D200). Read from
 * a `data:` address: one with HTML inside (a slide) taints the canvas when read from a `blob:` one.
 * @param {string} drawing the SVG's markup @param {number} width @param {number} height @returns {Promise<Blob>}
 */
export async function pictureOf(drawing, width, height) {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing)}`
  await image.decode()
  const canvas = Object.assign(document.createElement('canvas'), { width: width * 2, height: height * 2 })
  const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  pen.fillStyle = '#fff'
  pen.fillRect(0, 0, canvas.width, canvas.height)
  pen.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/png'))
}

/**
 * A file a web page made and asked Jean to save, through preview.html's relay (D158): saved on a
 * click of the user's, when Settings lets pages save files. @param {unknown} data @param {boolean} allowed
 */
export function savePage(data, allowed) {
  const { save: blob, name } = /** @type {{ save?: unknown, name?: unknown }} */ (data ?? {})
  if (allowed && blob instanceof Blob && navigator.userActivation?.isActive !== false) save(blob, String(name ?? ''))
}
