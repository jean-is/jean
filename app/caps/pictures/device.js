// Pictures made on this device (D251): SD-Turbo, by Stability AI, in one step, in a worker
// (device-worker.js), through ONNX Runtime on WebNN where the browser offers it, else WebGPU. Its
// files come once, with the user's consent, from the weights host at a pinned revision, checked
// against their SHA-256 as Whistle's are; then private, free and offline.
import { signal } from '@preact/signals-core'
import { weightsHost } from '../../ui/state.js'
import { modelWorker, downloading } from '../../ui/model.js'

/** @type {Array<[string, string, number]>} path on the weights host, SHA-256, bytes: the text encoder, the UNet, the VAE's decoder */
const FILES = [
  ['schmuell/sd-turbo-ort-web/resolve/ace89b7d2cd849f9a73914cdbb8a3ea60c853dd1/text_encoder/model.onnx', '5d1f5bd3286abf26313a9e87db6fd32e47d8b1b2a84ffdf470884c3fe89497c4', 681393168],
  ['schmuell/sd-turbo-ort-web/resolve/ace89b7d2cd849f9a73914cdbb8a3ea60c853dd1/unet/model.onnx', '7468133d9f7babec9cf6636e160188fe25aad206792c0abdaa722edc676963c4', 1733430199],
  ['schmuell/sd-turbo-ort-web/resolve/ace89b7d2cd849f9a73914cdbb8a3ea60c853dd1/vae_decoder/model.onnx', 'b37a85f91a982811957abd6cfb617499742309f7b8e253240da3132e533a7605', 99094314],
]
export const BYTES = FILES.reduce((sum, [, , bytes]) => sum + bytes, 0)

/**
 * @typedef {{ state: 'idle' } | { state: 'downloading', loaded: number, total: number }
 *   | { state: 'loading' } | { state: 'ready' } | { state: 'failed', message: string }} Download
 */
export const download = signal(/** @type {Download} */ ({ state: 'idle' }))
const worker = modelWorker(new URL('./device-worker.js', import.meta.url), 'Pictures on this device stopped')

/** Whether this device can make pictures: WebNN, or WebGPU with 16-bit numbers, and 8 GB of memory. */
export async function fits() {
  const nav = /** @type {any} */ (navigator)
  const adapter = await nav.gpu?.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null)
  return ('ml' in nav || Boolean(adapter?.features.has('shader-f16'))) && !(nav.deviceMemory < 8)
}

/** Whether its files are here already, so making a picture downloads nothing. */
export async function here() {
  if (download.value.state === 'ready') return true
  try {
    const cache = await caches.open('transformers-cache')
    return (await Promise.all(FILES.map(([path]) => cache.match(new URL(path, weightsHost()).href)))).every(Boolean)
  } catch {
    return false
  }
}

/** Downloads its files (the first time) and loads them. Resolves when it can make pictures. */
export async function prepare() {
  if (download.value.state === 'ready') return
  download.value = { state: 'downloading', loaded: 0, total: BYTES }
  navigator.storage?.persist?.().catch(() => {})
  try {
    await worker.call({ type: 'load', host: weightsHost(), files: FILES }, { onMessage: (message) => { download.value = downloading(message, BYTES) } })
    download.value = { state: 'ready' }
  } catch (error) {
    download.value = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
    throw error
  }
}

/** A picture of a description, 512 pixels square, once its files are here. @param {string} description */
export async function paint(description) {
  await prepare()
  const { bytes } = await worker.call({ type: 'paint', prompt: description })
  return { bytes: new Uint8Array(bytes), mimeType: 'image/png' }
}
