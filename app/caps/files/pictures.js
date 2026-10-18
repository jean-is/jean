// Pictures, as brains that can see take them: a shared picture, or one frame of a screen the
// user shares. Brains see no side longer than 1568 pixels: providers scale larger ones down anyway,
// after they have been sent whole, and every later message in the conversation sends them again.
// A shared picture is kept as it was given all the same, with whatever marks it carries (D324).
import { t, locale } from '../../core/i18n.js'

const MAX_SIDE = 1568
const TAKEN = /^image\/(png|jpeg|webp|gif)$/

/**
 * A shared picture: kept as it is when brains take its format, whatever its size, otherwise redrawn
 * smaller as PNG. Null when the browser can't open it (HEIC outside Safari, SVG).
 * @param {File} file @returns {Promise<{ name: string, mimeType: string, bytes: Uint8Array } | null>}
 */
export async function fitPicture(file) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return null
  try {
    if (TAKEN.test(file.type)) return { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
    return { name: file.name.replace(/(\.[^.]*)?$/, '.png'), mimeType: 'image/png', bytes: await draw(bitmap, bitmap.width, bitmap.height, 'image/png') }
  } finally {
    bitmap.close()
  }
}

/**
 * A kept picture as brains see it: as it is, or a smaller copy (JPEG for a photo) when a side is
 * longer than they take. @param {Uint8Array} bytes @param {string} mimeType
 * @returns {Promise<{ mimeType: string, bytes: Uint8Array }>}
 */
export async function seenBy(bytes, mimeType) {
  const bitmap = await createImageBitmap(new Blob([/** @type {BlobPart} */ (bytes)], { type: mimeType })).catch(() => null)
  if (!bitmap) return { mimeType, bytes }
  try {
    if (Math.max(bitmap.width, bitmap.height) <= MAX_SIDE) return { mimeType, bytes }
    const type = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    return { mimeType: type, bytes: await draw(bitmap, bitmap.width, bitmap.height, type) }
  } finally {
    bitmap.close()
  }
}

/**
 * One frame of what the user chose to share, as a PNG named for the moment. Sharing stops at
 * once: Jean keeps a picture, never a view of the screen.
 * @param {MediaStream} stream @returns {Promise<File>}
 */
export async function screenshot(stream) {
  try {
    const video = document.createElement('video')
    video.muted = true
    video.srcObject = stream
    await video.play()
    // The first frame may not be painted yet: wait for the next, but not long (a still screen sends few).
    await new Promise((resolve) => {
      setTimeout(resolve, 250)
      video.requestVideoFrameCallback?.(resolve)
    })
    const bytes = await draw(video, video.videoWidth, video.videoHeight, 'image/png')
    const time = new Intl.DateTimeFormat(locale.value, { timeStyle: 'medium' }).format(new Date())
    return new File([/** @type {BlobPart} */ (bytes)], `${t('capture.name', { time })}.png`, { type: 'image/png' })
  } finally {
    for (const track of stream.getTracks()) track.stop()
  }
}

/** @param {CanvasImageSource} source @param {number} width @param {number} height @param {string} type */
async function draw(source, width, height, type) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
  // Text on a screen stays readable when it is scaled down smoothly.
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Uint8Array(await (await canvas.convertToBlob({ type, quality: 0.9 })).arrayBuffer())
}
