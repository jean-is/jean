// Apple Numbers' spreadsheets, as Numbers has saved them since 2013: a zip of .iwa parts, each a run of
// Snappy-compressed chunks holding protobuf messages that point at each other by id. No schema ships:
// the few fields read here are named where they are read, after Apple's own messages (TN, TST, TSWP).
// Loaded by extract.js only when a .numbers file comes.

/** @typedef {import('../../core/zip.js').ZipEntry} ZipEntry */
/** @typedef {Map<number, (number | Uint8Array)[]>} Message */

/** A varint: its value and where it ends. @param {Uint8Array} bytes @param {number} pos @returns {[number, number]} */
function varint(bytes, pos) {
  let value = 0
  for (let shift = 1; ; shift *= 128) {
    const byte = bytes[pos++] ?? 0
    value += (byte & 127) * shift
    if (byte < 128) return [value, pos]
  }
}

/** Snappy's raw format, which an .iwa chunk holds without the framing format's checksums. @param {Uint8Array} src */
export function unsnappy(src) {
  let [size, pos] = varint(src, 0)
  const out = new Uint8Array(size)
  let at = 0
  /** @param {number} n little-endian bytes */
  const le = (n) => {
    let value = 0
    for (let i = 0; i < n; i++) value += src[pos++] * 256 ** i
    return value
  }
  while (pos < src.length && at < out.length) {
    const tag = src[pos++]
    if ((tag & 3) === 0) {
      const length = (tag >> 2 < 60 ? tag >> 2 : le((tag >> 2) - 59)) + 1
      out.set(src.subarray(pos, pos + length), at)
      pos += length
      at += length
      continue
    }
    const length = (tag & 3) === 1 ? ((tag >> 2) & 7) + 4 : (tag >> 2) + 1
    const offset = (tag & 3) === 1 ? ((tag >> 5) << 8) | src[pos++] : le((tag & 3) === 2 ? 2 : 4)
    for (let i = 0; i < length; i++, at++) out[at] = out[at - offset]
  }
  return out
}

/** A protobuf message's fields by number: varints as numbers, everything else as its bytes. @param {Uint8Array} bytes @returns {Message} */
export function message(bytes) {
  /** @type {Message} */
  const fields = new Map()
  for (let pos = 0, key = 0, n = 0; pos < bytes.length;) {
    ;[key, pos] = varint(bytes, pos)
    const wire = key % 8
    if (wire === 0 || wire === 2) [n, pos] = varint(bytes, pos)
    else if (wire !== 1 && wire !== 5) break
    const value = wire === 0 ? n : bytes.subarray(pos, (pos += wire === 2 ? n : wire === 1 ? 8 : 4))
    fields.set(Math.floor(key / 8), [...(fields.get(Math.floor(key / 8)) ?? []), value])
  }
  return fields
}

/** @param {Message | undefined} m @param {number} field */
const one = (m, field) => m?.get(field)?.[0]
/** @param {Message | undefined} m @param {number} field */
const sub = (m, field) => message(/** @type {Uint8Array} */ (one(m, field) ?? new Uint8Array()))
/** @param {Message | undefined} m @param {number} field */
const subs = (m, field) => (m?.get(field) ?? []).map((bytes) => message(/** @type {Uint8Array} */ (bytes)))
/** The id a TSP.Reference in this field points at. @param {Message | undefined} m @param {number} field */
const ref = (m, field) => /** @type {number | undefined} */ (one(sub(m, field), 1))
/** @param {Message | undefined} m @param {number} field */
const text = (m, field) => new TextDecoder().decode(/** @type {Uint8Array} */ (one(m, field) ?? new Uint8Array()))

/**
 * Every object of every part, by id, as its first message's type and fields. A part is chunks of a
 * zero, a 24-bit length and Snappy's bytes; unpacked, each object is an ArchiveInfo (its id, and
 * each message's type and length) and then those messages.
 * @param {ZipEntry[]} entries
 */
async function objects(entries) {
  /** @type {Map<number, { type: number, data: Message }>} */
  const found = new Map()
  for (const entry of entries.filter((e) => /\.iwa$/i.test(e.name))) {
    const bytes = await entry.read()
    /** @type {Uint8Array[]} */
    const chunks = []
    for (let pos = 0; pos + 4 <= bytes.length; pos += 4 + (bytes[pos + 1] | (bytes[pos + 2] << 8) | (bytes[pos + 3] << 16))) {
      chunks.push(unsnappy(bytes.subarray(pos + 4, pos + 4 + (bytes[pos + 1] | (bytes[pos + 2] << 8) | (bytes[pos + 3] << 16)))))
    }
    const all = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0))
    chunks.reduce((at, chunk) => (all.set(chunk, at), at + chunk.length), 0)
    for (let pos = 0, length = 0; pos < all.length;) {
      ;[length, pos] = varint(all, pos)
      const info = message(all.subarray(pos, (pos += length)))
      const [first, ...rest] = subs(info, 2)
      const size = (/** @type {Message} */ m) => Number(one(m, 3) ?? 0)
      found.set(Number(one(info, 1)), { type: Number(one(first, 1)), data: message(all.subarray(pos, pos + size(first))) })
      pos += size(first) + rest.reduce((n, m) => n + size(m), 0)
    }
  }
  return found
}

/** A Decimal128 as written, exactly: 113 bits of digits and a power of ten. @param {DataView} view @param {number} at */
function decimal(view, at) {
  const high = view.getBigUint64(at + 8, true)
  const digits = ((high & 0x1ffffffffffffn) << 64n | view.getBigUint64(at, true)).toString()
  const power = Number((high >> 49n) & 0x3fffn) - 6176
  const whole = power >= 0 ? digits + '0'.repeat(power) : digits.padStart(1 - power, '0')
  const point = power >= 0 ? whole : `${whole.slice(0, power)}.${whole.slice(power)}`.replace(/\.?0+$/, '')
  return (high >> 63n ? '-' : '') + point
}

/** A date: seconds since 2001 began, as Numbers counts them. @param {number} seconds */
const date = (seconds) => new Date(Date.UTC(2001, 0, 1) + seconds * 1000).toISOString().slice(0, seconds % 86400 ? 16 : 10).replace('T', ' ')

/** A duration's seconds as hours, minutes and seconds. @param {number} seconds */
const duration = (seconds) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n, i) => (i ? String(Math.round(n)).padStart(2, '0') : n)).join(':')

/**
 * A cell, in storage version 5: its version and type, then from byte 8 the flags saying which
 * values follow, in this order: a decimal, a double, a date, a string's key, a rich text's key.
 * @param {Uint8Array} cell @param {(key: number) => string} string @param {(key: number) => string} rich
 */
export function cellText(cell, string, rich) {
  const view = new DataView(cell.buffer, cell.byteOffset, cell.byteLength)
  const flags = view.getUint32(8, true)
  let at = 12
  const take = (/** @type {number} */ flag, /** @type {number} */ size) => (flags & flag ? (at += size) - size : -1)
  const [d128, double, seconds, key, richKey] = [take(1, 16), take(2, 8), take(4, 8), take(8, 4), take(16, 4)]
  const number = d128 >= 0 ? decimal(view, d128) : double >= 0 ? String(view.getFloat64(double, true)) : ''
  switch (cell[1]) {
    case 2: case 10: return number
    case 3: return key >= 0 ? string(view.getUint32(key, true)) : ''
    case 5: return seconds >= 0 ? date(view.getFloat64(seconds, true)) : ''
    case 6: return double >= 0 ? (view.getFloat64(double, true) ? 'TRUE' : 'FALSE') : ''
    case 7: return double >= 0 ? duration(view.getFloat64(double, true)) : ''
    case 8: return '#ERROR'
    case 9: return richKey >= 0 ? rich(view.getUint32(richKey, true)) : ''
    default: return ''
  }
}

/**
 * Each sheet's tables (TN.SheetArchive's drawables that are a TST.TableInfoArchive) as named rows
 * of tab-separated cells, and the words of its text boxes as one more, without rows' tabs.
 * @param {ZipEntry[]} entries @returns {Promise<{ title: string, rows: string[] }[]>}
 */
export async function numbersTables(entries) {
  const all = await objects(entries)
  const get = (/** @type {number | undefined} */ id) => all.get(id ?? -1)
  // A TSWP.StorageArchive's words.
  const words = (/** @type {number | undefined} */ id) => (get(id)?.data.get(3) ?? []).map((bytes) => new TextDecoder().decode(/** @type {Uint8Array} */ (bytes))).join('')
  /** @type {{ title: string, rows: string[] }[]} */
  const tables = []
  for (const sheet of (get(1)?.data.get(1) ?? []).map((bytes) => get(Number(one(message(/** @type {Uint8Array} */ (bytes)), 1))))) {
    const name = text(sheet?.data, 1)
    /** @type {string[]} */
    const boxes = []
    for (const drawable of (sheet?.data.get(2) ?? []).map((bytes) => get(Number(one(message(/** @type {Uint8Array} */ (bytes)), 1))))) {
      if (drawable?.type === 2011) boxes.push(words(ref(drawable.data, 2)).trim())
      const model = drawable?.type === 6000 ? get(ref(drawable.data, 2))?.data : undefined
      if (!model) continue
      // TST.TableDataStore: its tiles (3), its strings (4) and its rich texts (17), lists of entries by key.
      const store = sub(model, 4)
      const list = (/** @type {number} */ field) => new Map(subs(get(ref(store, field))?.data, 3).map((entry) => [one(entry, 1), entry]))
      const strings = list(4)
      const richTexts = list(17)
      const string = (/** @type {number} */ key) => text(strings.get(key), 3)
      const rich = (/** @type {number} */ key) => words(ref(get(ref(richTexts.get(key), 9))?.data, 1))
      const tileSize = Number(one(sub(store, 3), 2) ?? 256)
      /** @type {string[][]} */
      const grid = []
      for (const tile of subs(sub(store, 3), 1)) {
        for (const row of subs(get(ref(tile, 2))?.data, 5)) {
          // A row's cells (6) and where each starts (7), in 16-bit words of 4 bytes when wide (8), 0xffff for none.
          const cells = /** @type {Uint8Array | undefined} */ (one(row, 6))
          const offsets = /** @type {Uint8Array | undefined} */ (one(row, 7))
          if (!cells || !offsets) continue
          const index = Number(one(tile, 1) ?? 0) * tileSize + Number(one(row, 1) ?? 0)
          const line = /** @type {string[]} */ (grid[index] = [])
          for (let column = 0; column * 2 + 1 < offsets.length; column++) {
            const offset = offsets[column * 2] | (offsets[column * 2 + 1] << 8)
            if (offset !== 0xffff) line[column] = cellText(cells.subarray(offset * (one(row, 8) ? 4 : 1)), string, rich).replace(/[\t\n]+/g, ' ')
          }
        }
      }
      const rows = Array.from(grid, (line = []) => Array.from(line, (cell = '') => cell).join('\t').trimEnd())
      while (rows.length && !rows.at(-1)) rows.pop()
      tables.push({ title: `Sheet: ${name}, table: ${text(model, 8)}`, rows })
    }
    if (boxes.some(Boolean)) tables.push({ title: `Sheet: ${name}`, rows: boxes.filter(Boolean).join('\n\n').split('\n') })
  }
  return tables
}
