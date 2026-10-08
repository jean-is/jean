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
 * A file a web page made and asked Jean to save, through preview.html's relay (D158): saved on a
 * click of the user's, when Settings lets pages save files. @param {unknown} data @param {boolean} allowed
 */
export function savePage(data, allowed) {
  const { save: blob, name } = /** @type {{ save?: unknown, name?: unknown }} */ (data ?? {})
  if (allowed && blob instanceof Blob && navigator.userActivation?.isActive !== false) save(blob, String(name ?? ''))
}
