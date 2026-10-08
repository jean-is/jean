// Whistle (D205): Cactus Compute's speech to text, 16.9 MB of weights on its own engine, 0.9 MB of
// WebAssembly. Jean loads the engine itself, with only the calls below, so it gets no files and no
// network. Both files come from the weights host at a pinned revision, are checked against their
// SHA-256, and are kept with the other weights in Transformers.js's cache. The engine's import and
// export names belong to this build: another build means new names here.

/** @type {Array<[string, string, number]>} path on the weights host, SHA-256, bytes */
const FILES = [
  ['Cactus-Compute/needle3/resolve/2ae11323dc000f5e70c49f7403efa6af12ba9e67/wasm/needle.wasm', 'c43f48e11f302087250d1e406024956781cd2f02595a5e343b3d7ddd5ef707fa', 923348],
  ['Cactus-Compute/whistle/resolve/b358ddadd89b7a713b5aa131f23032d3cca1b251/whistle.cact', 'b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb', 16919407],
]
/** The longest clip the engine takes: 30 s at 16 kHz. */
export const LONGEST = 480_000
const OUT = 1 << 16

/**
 * The engine with Whistle loaded, as a function from 16 kHz mono audio and a language ("fr") to what
 * was said, "" for silence. @param {string} host @param {(loaded: number, total: number) => void} progress
 */
export async function whistle(host, progress) {
  const [got, total] = [FILES.map(() => 0), FILES.reduce((sum, [, , bytes]) => sum + bytes, 0)]
  const [wasm, cact] = await Promise.all(FILES.map(([path, hash], i) => download(new URL(path, host).href, hash, (bytes) => progress((got[i] = bytes, got.reduce((a, b) => a + b)), total))))
  /** @type {WebAssembly.Memory} */
  let memory
  const view = () => new DataView(memory.buffer)
  const [stop, none] = [() => { throw new Error('Whistle stopped') }, () => -52]
  /** @type {Record<string, (...args: any[]) => any>} The C runtime's calls, by this build's names: no files, an empty environment, output dropped, a clock, more memory. */
  const calls = {
    a: stop, e: stop, f: () => 0, b: none, d: none, g: none, h: none, i: none, n: none, o: none, p: none, j: () => 0,
    k: (count, size) => (view().setUint32(count, 0, true), view().setUint32(size, 0, true), 0),
    c: (fd, iov, count, written) => (view().setUint32(written, Array.from({ length: count }, (_, i) => view().getUint32(iov + i * 8 + 4, true)).reduce((a, b) => a + b, 0), true), 0),
    l: (clock, precision, at) => (view().setBigUint64(at, BigInt(Math.round(performance.now() * 1e6)), true), 0),
    m: (size) => { try { return memory.grow(Math.ceil(((size >>> 0) - memory.buffer.byteLength) / 65536)), 1 } catch { return 0 } },
  }
  const engine = /** @type {any} */ ((await WebAssembly.instantiate(wasm, { a: calls })).instance.exports)
  memory = engine.q
  engine.r()
  /** @param {ArrayBufferView} data */
  const put = (data) => {
    const at = engine.E(data.byteLength)
    new Uint8Array(memory.buffer, at, data.byteLength).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    return at
  }
  const text = (/** @type {number} */ at) => {
    const bytes = new Uint8Array(memory.buffer, at)
    return new TextDecoder().decode(bytes.slice(0, bytes.indexOf(0)))
  }
  // needle_load reads the weights in place: they stay.
  if (engine.y(put(new Uint8Array(cact)), BigInt(cact.byteLength)) < 0) throw new Error(text(engine.s()))
  const out = engine.E(OUT)
  return (/** @type {Float32Array} */ audio, /** @type {string} */ language) => pieces(audio).map((piece) => {
    const made = [put(piece), put(new TextEncoder().encode(`${language}\0`))]
    const words = engine.x(made[0], piece.length, made[1], 0, 0, out, OUT)
    made.forEach((at) => engine.D(at))
    if (words < 0) throw new Error(text(engine.s()))
    return String(JSON.parse(text(out)).text ?? '').trim()
  }).filter(Boolean).join(' ')
}

/** A file's bytes, from the cache, or else downloaded and checked. @param {string} url @param {string} hash @param {(bytes: number) => void} progress */
async function download(url, hash, progress) {
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

/**
 * Audio cut into clips the engine takes, each at most 30 s, at the quietest tenth of a second in
 * the last 5 s before each limit, so a cut falls between words. @param {Float32Array} audio
 */
export function pieces(audio) {
  const cut = []
  let from = 0
  while (audio.length - from > LONGEST) {
    let [at, quietest] = [from + LONGEST, Infinity]
    for (let start = from + LONGEST - 80_000; start + 1600 <= from + LONGEST; start += 800) {
      const energy = audio.subarray(start, start + 1600).reduce((sum, x) => sum + x * x, 0)
      if (energy < quietest) [at, quietest] = [start + 800, energy]
    }
    cut.push(audio.subarray(from, at))
    from = at
  }
  return [...cut, audio.subarray(from)]
}
