// Weights pinned by their SHA-256 (Whistle, D205; pictures on this device, D251): from the cache
// Transformers.js keeps its own in, apart from app versions, or else downloaded, checked and kept.
// A score's instruments come the same way, into a cache of their own (D338), or straight where the
// browser keeps none (a saved copy opened as a file). For workers as well as the page: web-standard APIs only.

/** How often a worker tells the page how far its weights have come, in ms: each message redraws a download there. */
export const PACE = 100

/**
 * A file's bytes, from the cache, or else downloaded and checked, with what of it has come, every
 * PACE ms and once it all has. @param {string} url @param {string} hash @param {(bytes: number) => void} progress @param {string} [kept] the cache's name
 */
export async function download(url, hash, progress, kept = 'transformers-cache') {
  const cache = await globalThis.caches?.open(kept).catch(() => null)
  const hit = await cache?.match(url)
  if (hit) return hit.arrayBuffer()
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`)
  let bytes = 0
  let told = performance.now()
  const counted = new TransformStream({
    transform: (chunk, next) => {
      bytes += chunk.length
      if (performance.now() - told >= PACE) {
        progress(bytes)
        told = performance.now()
      }
      next.enqueue(chunk)
    },
  })
  const data = await new Response(response.body.pipeThrough(counted)).arrayBuffer()
  progress(bytes)
  const sum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (sum !== hash) throw new Error(`${url}: not the expected file`)
  await cache?.put(url, new Response(data))
  return data
}
