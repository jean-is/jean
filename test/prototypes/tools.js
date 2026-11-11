// The tools a brain is given in npm run prototypes (D742): `prototype` and `prototype_change`, as Prototypes declares them
// (app/caps/prototypes/tool.js), each keeping the prototype in the run's folder, dressed in its look as a site is (D739), and
// returning its check (./check.js), pressed through in Chromium; and `skill`, which reads Jean's own skills as own-skills does,
// "Make a prototype" among them.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { check, told } from './check.js'
import { pathIn, changed } from '../../app/caps/sites/file.js'
import { PROTOTYPE, CHANGE } from '../../app/caps/prototypes/tool.js'
import { dealt, worn as wear, saidOf } from '../../app/caps/sites/look.js'

/** @import { Tool } from '../../app/core/loop.js' */
/** @typedef {import('./check.js').Report} Report */
/** @typedef {import('../../app/caps/sites/look.js').Look} Look */
/** @typedef {{ name: 'prototype' | 'prototype_change', place: string, report: Report, files: Map<string, Uint8Array>, look: Look, given: boolean }} Call  each call, in order */
/** @typedef {{ name: string, files: Map<string, Uint8Array>, kept?: { id: string, voice: string, own?: import('../../app/caps/sites/look.js').Own } }} Kept */

const DIRECTORY = new URL('../../app/caps/skills/directory/', import.meta.url)
const { palettes } = JSON.parse(await readFile(new URL('../../app/caps/designs/layouts.json', import.meta.url), 'utf8'))

export { LINES } from '../../app/caps/prototypes/tool.js'

/** A slug of a name, in any script. @param {string} name */
const slug = (name) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'prototype'

/**
 * The tools of one run: each prototype kept in `dir`/prototypes/<n>-<slug>/, checked in `browser`, its calls in `calls`.
 * @param {{ dir: string, browser: import('@playwright/test').Browser, shared: Map<string, Uint8Array>, calls: Call[] }} at
 * @returns {Tool[]}
 */
export function prototypeTools({ dir, browser, shared, calls }) {
  /** @type {Map<string, Kept>} */
  const made = new Map()
  const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)

  /** A file of the call, its bytes from its text or from a shared file. @param {any} file */
  const bytesOf = (file) => {
    const path = pathIn(file?.path)
    if (typeof file?.text === 'string') return /** @type {const} */ ([path, encode(file.text)])
    const from = String(file?.from ?? '')
    const found = shared.get(from) ?? [...shared].find(([name]) => name.normalize() === from.normalize() || name.endsWith(`/${from}`))?.[1]
    if (!found) throw new Error(from ? `There is no shared file named "${from}". Shared: ${[...shared.keys()].join(', ') || 'none'}.` : `${path} has neither text nor from`)
    return /** @type {const} */ ([path, found])
  }

  /** Writes a prototype out in its look, checks it and keeps the call. @param {'prototype' | 'prototype_change'} name @param {string} place @param {any} [given] the brain's look */
  const kept = async (name, place, given) => {
    const was = /** @type {Kept} */ (made.get(place)), worn = dealt({ files: was.files, seed: place, palettes, kept: was.kept, given }), { look } = worn
    const dressed = wear(was.files, look), colours = saidOf(dressed), one = { ...was, files: dressed.files, kept: worn.kept }
    made.set(place, one)
    for (const folder of [join(dir, place), join(dir, 'calls', String(calls.length + 1))]) {
      await rm(folder, { recursive: true, force: true })
      for (const [path, bytes] of one.files) {
        await mkdir(dirname(join(folder, path)), { recursive: true })
        await writeFile(join(folder, path), bytes)
      }
    }
    const report = await check(one.files, browser)
    report.problems = [...new Set([...report.problems, ...colours.problems])]
    calls.push({ name, place, report, files: one.files, look, given: !!given })
    return [told(report, { name: one.name, place }), colours.line].filter(Boolean).join(' ')
  }

  /** @type {Tool} */
  const make = {
    spec: PROTOTYPE, kind: 'edit',
    title: (args) => `Prototype ${args?.name ?? ''}`,
    run: async (args) => {
      const files = Array.isArray(args?.files) ? args.files : []
      if (!files.length) throw new Error('Give the prototype its files: index.html first, then style.css and the other screens')
      const given = new Map(files.map(bytesOf))
      const name = String(args?.name ?? '').trim() || 'Prototype'
      const place = typeof args?.prototype === 'string' && made.has(args.prototype) ? args.prototype : `prototypes/${made.size + 1}-${slug(name)}`
      made.set(place, { ...made.get(place), name, files: given })
      return kept('prototype', place, args?.look)
    },
  }

  /** @type {Tool} */
  const change = {
    spec: CHANGE, kind: 'edit',
    title: (args) => `Change the prototype ${args?.prototype ?? ''}`,
    run: async (args) => {
      const place = String(args?.prototype ?? '')
      const one = made.get(place)
      if (!one) throw new Error(`There is no prototype at "${place}". Prototypes here: ${[...made.keys()].join(', ') || 'none'}.`)
      const done = changed(one.files, Array.isArray(args?.changes) ? args.changes : [])
      if ('error' in done) throw new Error(done.error.replace('the site', 'the prototype'))
      const files = done.files
      for (const file of Array.isArray(args?.files) ? args.files : []) files.set(...bytesOf(file))
      for (const path of Array.isArray(args?.remove) ? args.remove : []) files.delete(pathIn(path))
      made.set(place, { ...one, files })
      return kept('prototype_change', place, args?.look)
    },
  }

  return [make, change, skillTool]
}

/** The steps of one of Jean's own skills, or of a sheet beside them, without the front matter. @param {string} named */
async function skillText(named) {
  const [name, sheet] = named.replace(/\.md$/, '').split('/')
  const base = new URL(`${name}/`, DIRECTORY)
  const text = await readFile(new URL(sheet ? `${sheet}.md` : 'SKILL.md', base), 'utf8').catch(() => null)
  return text?.replace(/^---\n[\s\S]*?\n---\n/, '').trim() ?? null
}

/** Jean's own skills' names, as own-skills' line lists them. */
export const ownSkills = async () => (await readdir(DIRECTORY, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

/** @type {Tool} As own-skills declares it. */
const skillTool = {
  spec: { name: 'skill', description: 'Read the steps of a skill.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  kind: 'read',
  title: (args) => `Skill ${args?.name ?? ''}`,
  run: async (args) => {
    const named = String(args?.name ?? '').trim().toLowerCase()
    const text = named && await skillText(named)
    if (!text) throw new Error(`There is no skill named "${named}".`)
    return text
  },
}

/** The skill's line, as own-skills writes it before Skills is found. */
export const skillLine = async () => ({ name: 'skill', line: `read the steps of a skill before asking the user anything for it or following it: ${(await ownSkills()).join(', ')}` })
