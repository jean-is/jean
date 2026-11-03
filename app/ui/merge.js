// What two versions of a text make together, from the one both came from (D157): line by line, lined up by
// the longest run of lines they share (`steps`, which Jean's changes in a document use too). A part changed
// on one side alone takes that side's; changed on both, the same, it is taken once; changed on both apart,
// both stay, this side's first, so nothing anyone wrote is lost. Sync merges a Markdown file changed on two
// computers with it (caps/sync/mirror.js), and a document's editor what came in as it was typed in. Pure.

/**
 * How two lists line up (their longest common subsequence): [i, j] the same in both, [i, -1] or [-1, j] in one only.
 * @template T @param {T[]} a @param {T[]} b @param {(x: T, y: T) => boolean} eq @returns {Array<[number, number]>}
 */
export function steps(a, b, eq) {
  const rows = a.length + 1, cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = eq(a[i], b[j]) ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  /** @type {Array<[number, number]>} */
  const out = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && eq(a[i], b[j])) out.push([i++, j++])
    else if (j >= b.length || (i < a.length && table[(i + 1) * cols + j] >= table[i * cols + j + 1])) out.push([i++, -1])
    else out.push([-1, j++])
  }
  return out
}

/**
 * The text this side's version and the other's make from the version both came from; null when what lies between the
 * lines all three share at their start and end is too long to line up here (a few thousand lines each way).
 * @param {string} base @param {string} mine @param {string} theirs @returns {string | null}
 */
export function merge3(base, mine, theirs) {
  if (mine === base || mine === theirs) return theirs
  if (theirs === base) return mine
  const all = [base, mine, theirs].map((text) => text.split('\n')), short = Math.min(...all.map((lines) => lines.length))
  let start = 0, end = 0
  while (start < short && all.every((lines) => lines[start] === all[0][start])) start++
  while (end < short - start && all.every((lines) => lines.at(-1 - end) === all[0].at(-1 - end))) end++
  const [o, a, b] = all.map((lines) => lines.slice(start, lines.length - end))
  if (o.length * Math.max(a.length, b.length) > 4e6) return null
  // Where each line of the base is on each side that kept it; one both kept, and the end, closes the part before it.
  const [inA, inB] = [a, b].map((side) => new Map(steps(o, side, (x, y) => x === y).filter(([i, j]) => i >= 0 && j >= 0)))
  const same = (/** @type {string[]} */ x, /** @type {string[]} */ y) => x.length === y.length && x.every((line, n) => line === y[n])
  const out = all[0].slice(0, start)
  let i = 0, ja = 0, jb = 0
  for (let k = 0; k <= o.length; k++) {
    if (k < o.length && !(inA.has(k) && inB.has(k))) continue
    const [ea, eb] = k < o.length ? [Number(inA.get(k)), Number(inB.get(k))] : [a.length, b.length]
    const [was, x, y] = [o.slice(i, k), a.slice(ja, ea), b.slice(jb, eb)]
    out.push(...(same(x, was) ? y : same(y, was) || same(x, y) ? x : [...x, ...(x.length && y.length ? [''] : []), ...y]), ...o.slice(k, k + 1))
    i = k + 1, ja = ea + 1, jb = eb + 1
  }
  return [...out, ...all[0].slice(all[0].length - end)].join('\n')
}
