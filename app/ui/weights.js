// Weights pinned by their SHA-256 (Whistle, D205; pictures on this device, D251): from the cache
// Transformers.js keeps its own in, apart from app versions, or else downloaded, checked and kept.
// For workers as well as the page: web-standard APIs only.

/** A file's bytes, from the cache, or else downloaded and checked. @param {string} url @param {string} hash @param {(bytes: number) => void} progress */
export async function download(url, hash, progress) {
  const cache = await caches.open('transformers-cache')
  const kept = await cache.match(url)
  if (kept) return kept.arrayBuffer()
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`)
  let bytes = 0
  const counted = new TransformStream({ transform: (chunk, next) => (progress((bytes += chunk.length)), next.enqueue(chunk)) })
  const data = await new Response(response.body.pipeThrough(counted)).arrayBuffer()
  const sum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (sum !== hash) throw new Error(`${url}: not the expected file`)
  await cache.put(url, new Response(data))
  return data
}
