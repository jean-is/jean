// How caps/designs/fonts/ was made: the nine open faces of the five voices. Fetches each
// family as Google Fonts serves it, variable and split by script, into dist/faces/ (never
// committed); reads its licence in google/fonts for its copyright and Reserved Font Names; then, through
// designs-faces.py (fontTools, from FONTTOOLS_PYTHON), renames each file to its voice and checks it: the
// letters of Vietnamese, Yoruba and Hausa in each Latin face, and the features Arabic and Hebrew need.
// Usage: FONTTOOLS_PYTHON=<a python with fonttools and brotli> node scripts/designs-faces.js
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** @typedef {{ voice: string, family: string, query: string, dir: string, subsets: string[] }} Face */

const OUT = fileURLToPath(new URL('../dist/faces/', import.meta.url))
const AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
/**
 * Each family, the voice its file is named for, and the scripts kept of it: what phase 0 recommends
 * (findings.md). Calm is Inter, the one face of the nine with every letter of Jean's Latin languages,
 * Hausa's and Yoruba's included, and Greek; Source Sans 3, the Fonts board's first choice, lacks
 * Hausa's Ƙ and Ƴ. No Cyrillic or Greek Extended: none of Jean's languages needs them.
 * @type {Face[]}
 */
export const FACES = [
  { voice: 'Friendly', family: 'Nunito', query: 'Nunito:wght@400..900', dir: 'nunito', subsets: ['latin', 'latin-ext', 'vietnamese', 'cyrillic'] },
  { voice: 'Elegant', family: 'Playfair Display', query: 'Playfair+Display:wght@400..900', dir: 'playfairdisplay', subsets: ['latin', 'latin-ext', 'vietnamese', 'cyrillic'] },
  { voice: 'Bold', family: 'Oswald', query: 'Oswald:wght@400..700', dir: 'oswald', subsets: ['latin', 'latin-ext', 'vietnamese', 'cyrillic'] },
  { voice: 'Calm', family: 'Inter', query: 'Inter:wght@400..900', dir: 'inter', subsets: ['latin', 'latin-ext', 'vietnamese', 'cyrillic', 'greek'] },
  { voice: 'Handwritten', family: 'Patrick Hand', query: 'Patrick+Hand', dir: 'patrickhand', subsets: ['latin', 'latin-ext', 'vietnamese'] },
  { voice: 'Friendly', family: 'Rubik', query: 'Rubik:wght@400..900', dir: 'rubik', subsets: ['arabic', 'hebrew'] },
  { voice: 'Elegant', family: 'Markazi Text', query: 'Markazi+Text:wght@400..700', dir: 'markazitext', subsets: ['arabic'] },
  { voice: 'Bold', family: 'Lalezar', query: 'Lalezar', dir: 'lalezar', subsets: ['arabic'] },
  { voice: 'Elegant', family: 'Frank Ruhl Libre', query: 'Frank+Ruhl+Libre:wght@400..900', dir: 'frankruhllibre', subsets: ['hebrew'] },
]

/** @param {string} url @returns {Promise<Response>} */
async function get(url) {
  const response = await fetch(url, { headers: { 'user-agent': AGENT } })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response
}

/**
 * A family's files, each script's woff2 with its unicode-range, and its licence: the copyright line
 * and the Reserved Font Names it declares, if any.
 * @param {Face} face
 */
async function fetchFace(face) {
  const css = await (await get(`https://fonts.googleapis.com/css2?family=${face.query}&display=swap`)).text()
  /** @type {{ subset: string, range: string, url: string }[]} */
  const blocks = []
  for (const [, subset, body] of css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const url = /url\((https:[^)]+)\)/.exec(body)?.[1]
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1] ?? ''
    if (url && face.subsets.includes(subset) && !blocks.some((one) => one.subset === subset)) blocks.push({ subset, range, url })
  }
  const licence = await (await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${face.dir}/OFL.txt`)).text()
  // A family's Reserved Font Names are declared after its copyright, "with Reserved Font Name "Source"";
  // the licence's own definition of the term, "Reserved Font Name" refers to…, declares none.
  const notice = licence.split(/SIL OPEN FONT LICENSE/i)[0]
  const reserved = [...notice.matchAll(/with Reserved Font Names?\s+((?:[“"'][^”"']+[”"'](?:,?\s*(?:and\s+)?)?)+)/gi)].flatMap((match) => [...match[1].matchAll(/[“"']([^”"']+)[”"']/g)].map((name) => name[1]))
  const copyright = notice.split('\n').filter((line) => /copyright/i.test(line)).map((line) => line.trim()).join(' ')
  const files = []
  for (const block of blocks) {
    const bytes = new Uint8Array(await (await get(block.url)).arrayBuffer())
    const path = `${OUT}raw/${face.dir}-${block.subset}.woff2`
    await writeFile(path, bytes)
    files.push({ subset: block.subset, range: block.range, path, bytes: bytes.length })
  }
  return { ...face, copyright, reserved, files, missing: face.subsets.filter((subset) => !blocks.some((one) => one.subset === subset)) }
}

async function main() {
  await mkdir(`${OUT}raw`, { recursive: true })
  await mkdir(`${OUT}voices`, { recursive: true })
  const faces = []
  for (const face of FACES) faces.push(await fetchFace(face))
  await writeFile(`${OUT}faces.json`, JSON.stringify(faces, null, 2))
  const python = process.env.FONTTOOLS_PYTHON
  if (!python) throw new Error('FONTTOOLS_PYTHON: a python with fonttools and brotli, to rename and check the faces')
  execFileSync(python, ['-I', fileURLToPath(new URL('./designs-faces.py', import.meta.url)), OUT], { stdio: 'inherit' })
  const checked = JSON.parse(await readFile(`${OUT}checked.json`, 'utf8'))
  console.log(JSON.stringify(checked.summary, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`faces: ${error.message}`)
    process.exit(1)
  })
}
