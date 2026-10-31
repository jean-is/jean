// A Numbers spreadsheet made here, for files.test.js and files.spec.js: its .iwa parts, each one
// chunk of Snappy literals holding protobuf messages, with a sheet, a table of cells of every kind read
// and a text box.
import { writeZip } from '../../app/core/zip.js'

const enc = new TextEncoder()

/** A protobuf varint. @param {number | bigint} n */
const varint = (n) => {
  const out = []
  for (let v = BigInt(n); ; v >>= 7n) {
    if (v < 128n) return [...out, Number(v)]
    out.push(Number(v & 127n) | 128)
  }
}
/** A protobuf message from [field, value] pairs: a number is a varint, a string or bytes length-delimited. @param {[number, number | string | Uint8Array | number[]][]} fields */
const pb = (fields) => new Uint8Array(fields.flatMap(([field, value]) => {
  if (typeof value === 'number') return [...varint(field * 8), ...varint(value)]
  const bytes = typeof value === 'string' ? enc.encode(value) : [...value]
  return [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes]
}))
const reference = (/** @type {number} */ id) => pb([[1, id]])
/** An .iwa part: each object an ArchiveInfo and its message, in one chunk of Snappy literals. @param {[number, number, Uint8Array][]} objects id, type, message */
const iwa = (objects) => {
  const raw = objects.flatMap(([id, type, data]) => {
    const info = pb([[1, id], [2, pb([[1, type], [3, data.length]])]])
    return [...varint(info.length), ...info, ...data]
  })
  const snappy = [...varint(raw.length), 61 << 2, (raw.length - 1) & 255, (raw.length - 1) >> 8, ...raw]
  return new Uint8Array([0, snappy.length & 255, (snappy.length >> 8) & 255, snappy.length >> 16, ...snappy])
}
/** A cell in storage version 5: its type, its flags and the values they say. @param {number} type @param {number} flags @param {...Uint8Array} values */
const cell = (type, flags, ...values) => new Uint8Array([5, type, 0, 0, 0, 0, 0, 0, flags & 255, flags >> 8, 0, 0, ...values.flatMap((v) => [...v])])
const u32 = (/** @type {number} */ n) => new Uint8Array(new Uint32Array([n]).buffer)
const f64 = (/** @type {number} */ n) => new Uint8Array(new Float64Array([n]).buffer)
/** A Decimal128: its digits, its power of ten and its sign. @param {number} digits @param {number} power */
const d128 = (digits, power, negative = false) => {
  const view = new DataView(new ArrayBuffer(16))
  view.setBigUint64(0, BigInt(digits), true)
  view.setBigUint64(8, (negative ? 1n << 63n : 0n) | (BigInt(power + 6176) << 49n), true)
  return new Uint8Array(view.buffer)
}
/** A tile's row: its cells one after another, and where each starts, 0xffff for none. @param {number} index @param {(Uint8Array | null)[]} cells */
const tileRow = (index, cells) => {
  let at = 0
  const offsets = cells.flatMap((c) => (c ? [at & 255, (at += c.length) - c.length >> 8] : [255, 255]))
  return pb([[1, index], [6, new Uint8Array(cells.flatMap((c) => (c ? [...c] : [])))], [7, offsets]])
}

/** What `numbersFile()` reads as, page by page. */
export const numbersPages = [
  'Sheet: Budget 2026, table: Costs\nRent\t1200.5\t2026-01-15\n\t-0.25\tTRUE\nNote here\t1:30:00',
  'Sheet: Budget 2026\nPlan B',
]

/** The sheet "Budget 2026": its table "Costs" (text, decimals, a date, an empty cell, a boolean, rich text, a duration) and a text box. */
export function numbersFile() {
  const seconds = (Date.UTC(2026, 0, 15) - Date.UTC(2001, 0, 1)) / 1000
  const store = pb([[3, pb([[1, pb([[1, 0], [2, reference(5)]])], [2, 256]])], [4, reference(6)], [17, reference(8)]])
  const document = iwa([
    [1, 1, pb([[1, reference(2)]])],
    [2, 2, pb([[1, 'Budget 2026'], [2, reference(3)], [2, reference(7)]])],
    [3, 6000, pb([[2, reference(4)]])],
    [4, 6001, pb([[4, store], [8, 'Costs']])],
    [7, 2011, pb([[2, reference(11)]])],
    [11, 2001, pb([[3, 'Plan B']])],
  ])
  const tables = iwa([
    [5, 6002, pb([
      [5, tileRow(0, [cell(3, 8, u32(1)), cell(2, 1, d128(12005, -1)), cell(5, 4, f64(seconds))])],
      [5, tileRow(1, [null, cell(2, 1, d128(25, -2, true)), cell(6, 2, f64(1))])],
      [5, tileRow(2, [cell(9, 16, u32(1)), cell(7, 2, f64(5400))])],
    ])],
    [6, 6005, pb([[3, pb([[1, 1], [3, 'Rent']])]])],
    [8, 6005, pb([[3, pb([[1, 1], [9, reference(9)]])]])],
    [9, 6218, pb([[1, reference(10)]])],
    [10, 2001, pb([[3, 'Note\nhere']])],
  ])
  return writeZip([{ name: 'Index/Document.iwa', bytes: document }, { name: 'Index/Tables/Tile-5.iwa', bytes: tables }, { name: 'preview.jpg', bytes: new Uint8Array([0xff, 0xd8]) }])
}
