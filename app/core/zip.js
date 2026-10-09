// Zip files with the platform's own (de)compression streams: reading Office files
// (DOCX, XLSX and PPTX are zips of XML) and writing backups. No zip64, no encryption.
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

/** @typedef {{ name: string, size: number, read: () => Promise<Uint8Array> }} ZipEntry */

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const UTF8_NAMES = 0x800
const STORE = 0
const DEFLATE = 8

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Lists the entries of a zip from its central directory. Folders are skipped. @param {Uint8Array} bytes @returns {ZipEntry[]} */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = findEnd(view)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  /** @type {ZipEntry[]} */
  const entries = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('Damaged zip: bad central directory')
    const method = view.getUint16(at + 10, true)
    const compressed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (compressed === 0xffffffff || offset === 0xffffffff) throw new Error('Zip64 files are not supported')
    entries.push({
      name,
      size,
      read: async () => {
        if (view.getUint32(offset, true) !== LOCAL) throw new Error(`Damaged zip: ${name}`)
        const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
        const data = bytes.subarray(start, start + compressed)
        if (method === STORE) return data.slice()
        if (method === DEFLATE) return transform(data, new DecompressionStream('deflate-raw'))
        throw new Error(`Unsupported zip compression (${method}): ${name}`)
      },
    })
  }
  return entries
}

/** @param {DataView} view */
function findEnd(view) {
  // The end record is 22 bytes plus a comment of up to 65535 bytes.
  for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === END) return at
  }
  throw new Error('Not a zip file')
}

/** Builds a zip. Entries are deflated when the platform can and it makes them smaller. @param {{ name: string, bytes: Uint8Array }[]} files @param {Date} [date] @returns {Promise<Uint8Array>} */
export async function writeZip(files, date = new Date()) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  /** @type {Uint8Array[]} */
  const parts = []
  /** @type {Uint8Array[]} */
  const central = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.bytes)
    const deflated = await deflate(file.bytes)
    const method = deflated && deflated.length < file.bytes.length ? DEFLATE : STORE
    const data = method === DEFLATE && deflated ? deflated : file.bytes
    const fields = { method, time, day, crc, compressed: data.length, size: file.bytes.length, nameLength: name.length }
    const local = header(30, LOCAL, fields)
    parts.push(local, name, data)
    const entry = header(46, CENTRAL, fields)
    new DataView(entry.buffer).setUint32(42, offset, true)
    central.push(entry, name)
    offset += local.length + name.length + data.length
  }
  const size = central.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  view.setUint32(0, END, true)
  view.setUint16(8, files.length, true)
  view.setUint16(10, files.length, true)
  view.setUint32(12, size, true)
  view.setUint32(16, offset, true)
  return concat([...parts, ...central, end])
}

/**
 * Local and central headers share their fields; the central one is shifted by 2 bytes
 * (it starts with "version made by").
 * @param {number} length @param {number} signature
 * @param {{ method: number, time: number, day: number, crc: number, compressed: number, size: number, nameLength: number }} f
 */
function header(length, signature, f) {
  const out = new Uint8Array(length)
  const view = new DataView(out.buffer)
  const shift = signature === CENTRAL ? 2 : 0
  view.setUint32(0, signature, true)
  if (shift) view.setUint16(4, 20, true)
  view.setUint16(4 + shift, 20, true)
  view.setUint16(6 + shift, UTF8_NAMES, true)
  view.setUint16(8 + shift, f.method, true)
  view.setUint16(10 + shift, f.time, true)
  view.setUint16(12 + shift, f.day, true)
  view.setUint32(14 + shift, f.crc, true)
  view.setUint32(18 + shift, f.compressed, true)
  view.setUint32(22 + shift, f.size, true)
  view.setUint16(26 + shift, f.nameLength, true)
  return out
}

/** @param {Uint8Array} bytes @returns {Promise<Uint8Array | null>} null when deflate-raw is unavailable */
async function deflate(bytes) {
  let stream
  try {
    stream = new CompressionStream('deflate-raw')
  } catch {
    return null // Firefox before 113
  }
  return transform(bytes, stream)
}

/** @param {Uint8Array} bytes @param {TransformStream<any, any>} stream */
async function transform(bytes, stream) {
  const piped = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

/** @param {Uint8Array[]} parts */
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** @type {Uint32Array | null} */
let table = null

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
