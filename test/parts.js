// SPDX-License-Identifier: MIT
// The browser tests in parts, SHARD=<part>/<parts> (CI's matrix, D724): every spec of every engine, the longest first, goes to
// the part with the least time so far, by how long it took on CI (test/durations.json, which scripts/durations.js writes; a
// spec it doesn't know takes its engine's median). Playwright's own --shard splits by how many tests, in the files' order, and
// its parts took from seven minutes to fourteen.

/**
 * Each engine's specs in one part.
 * @param {string} shard  as 2/8 @param {Record<string, string[]>} engines  each engine's specs
 * @param {Record<string, Record<string, number>>} durations  each engine's seconds by spec
 * @returns {Record<string, string[]>}
 */
export function part(shard, engines, durations) {
  const match = /^(\d+)\/(\d+)$/.exec(shard)
  const [index, parts] = match ? [Number(match[1]), Number(match[2])] : [0, 0]
  if (!index || index > parts) throw new Error(`SHARD=${shard}: one part of them, as 2/8`)
  const specs = Object.entries(engines).flatMap(([engine, names]) => {
    const known = Object.values(durations[engine] ?? {}).sort((a, b) => a - b)
    const median = known[Math.floor(known.length / 2)] ?? 1
    return names.map((name) => ({ engine, name, seconds: durations[engine]?.[name] ?? median }))
  })
  // In the same order on every runner, so that the parts add up to the suite: by time, then by name, never by locale.
  specs.sort((a, b) => b.seconds - a.seconds || (`${a.engine} ${a.name}` < `${b.engine} ${b.name}` ? -1 : 1))
  const loads = Array.from({ length: parts }, () => 0)
  /** @type {Record<string, string[]>} */
  const mine = Object.fromEntries(Object.keys(engines).map((engine) => [engine, []]))
  for (const spec of specs) {
    const least = loads.indexOf(Math.min(...loads))
    loads[least] += spec.seconds
    if (least === index - 1) mine[spec.engine].push(spec.name)
  }
  return mine
}
