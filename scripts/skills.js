// Checks the places Jean looks for skills by default (KNOWN_PLACES in caps/skills/sources.js,
// D122) the way a browser would meet them, from an origin none of them knows: does the index
// answer it (CORS), is it schema 0.2, which skills can Jean use, and is each SKILL.md readable
// from a page and exactly what the index lists? A place that fails, or offers nothing Jean can
// use, is reported, and the command fails. Read-only.
// Usage: npm run skills
import { KNOWN_PLACES, indexURL, parseIndex, fetchSkill } from '../caps/skills/sources.js'

const ORIGIN = 'https://jean.example'

/** A GET from ORIGIN, or null when a browser couldn't read the answer. @param {string} url */
async function get(url) {
  const res = await fetch(url, { headers: { origin: ORIGIN } }).catch(() => null)
  const origin = res?.headers.get('access-control-allow-origin')
  return res?.ok && (origin === '*' || origin === ORIGIN) ? res : null
}

/** @param {string} place @returns {Promise<{ usable: number, other: number, problems: string[] }>} */
async function check(place) {
  const url = /** @type {string} */ (indexURL(place))
  const res = await get(url)
  if (!res) return { usable: 0, other: 0, problems: ['a browser can’t read its index (no answer, or no CORS)'] }
  let entries
  try {
    ({ entries } = parseIndex(await res.json(), res.url || url))
  } catch (error) {
    return { usable: 0, other: 0, problems: [/** @type {Error} */ (error).message] }
  }
  const usable = entries.filter((entry) => entry.type === 'skill-md')
  const problems = (await Promise.all(usable.map(async (entry) => {
    if (!await get(entry.url)) return `${entry.name}: a browser can’t read it`
    return fetchSkill(entry).then(() => '', (error) => `${entry.name}: ${error.message}`)
  }))).filter(Boolean)
  const readable = usable.length - problems.length
  if (!usable.length) problems.push('no skill Jean can use: archives only, or entries without a digest')
  return { usable: readable, other: entries.length - usable.length, problems }
}

let failed = false
for (const place of KNOWN_PLACES) {
  const { usable, other, problems } = await check(place)
  failed ||= problems.length > 0
  console.log(`${problems.length ? '✗' : '✓'} ${place.padEnd(28)} ${String(usable).padStart(3)} usable, ${String(other).padStart(3)} archives${problems.map((problem) => `\n    ${problem}`).join('')}`)
}
if (failed) {
  console.log('\nA place above is not what Jean expects: fix KNOWN_PLACES, or tell its publisher.')
  process.exitCode = 1
}
