// The tools a brain is given in npm run sites (Sites' phase 0): `site` and `site_change`, as Sites would declare them,
// each keeping the site in the run's folder, dressed in its look as Sites does (D739: three dealt, no project's here, the
// brain's colours worn), and returning its check, and `skill`, which reads Jean's own skills as own-skills does, "Make a
// site" (app/caps/skills/directory/site/) among them.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { check } from './check.js'
import { told } from '../../app/caps/sites/check.js'
import { pathIn, changed } from '../../app/caps/sites/file.js'
import { LINES, SITE, CHANGE } from '../../app/caps/sites/tool.js'
import { dealt, worn as wear, saidOf } from '../../app/caps/sites/look.js'

export { LINES } from '../../app/caps/sites/tool.js'

/** @import { Tool } from '../../app/core/loop.js' */
/** @typedef {import('./check.js').Report} Report */
/** @typedef {import('../../app/caps/sites/look.js').Look} Look */
/** @typedef {{ name: 'site' | 'site_change', place: string, report: Report, files: Map<string, Uint8Array>, looks: Look[], look: Look }} Call  each call, in order, its site's files and looks */
/** @typedef {{ name: string, files: Map<string, Uint8Array>, kept?: { id: string, voice: string, own?: import('../../app/caps/sites/look.js').Own } }} Kept */

const DIRECTORY = new URL('../../app/caps/skills/directory/', import.meta.url)
const { palettes } = JSON.parse(await readFile(new URL('../../app/caps/designs/layouts.json', import.meta.url), 'utf8'))

/** A slug of a name, in any script. @param {string} name */
const slug = (name) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site'

/**
 * The tools of one run: each site kept in `dir`/sites/<n>-<slug>/, checked in `browser`, its calls in `calls`.
 * @param {{ dir: string, browser: import('@playwright/test').Browser, shared: Map<string, Uint8Array>, calls: Call[] }} at
 * @returns {Tool[]}
 */
export function siteTools({ dir, browser, shared, calls }) {
  /** @type {Map<string, Kept>} */
  const sites = new Map()
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

  /** Writes a site out in its look, checks it and keeps the call. @param {'site' | 'site_change'} name @param {string} place @param {any} [given] the brain's look */
  const kept = async (name, place, given) => {
    const was = /** @type {Kept} */ (sites.get(place)), worn = dealt({ files: was.files, seed: place, palettes, kept: was.kept, given }), { looks, look } = worn
    const dressed = wear(was.files, look), said = saidOf(dressed), one = { ...was, files: dressed.files, kept: worn.kept }
    sites.set(place, one)
    const folder = join(dir, place)
    await rm(folder, { recursive: true, force: true })
    for (const [path, bytes] of one.files) {
      await mkdir(dirname(join(folder, path)), { recursive: true })
      await writeFile(join(folder, path), bytes)
    }
    // Each call's site is kept too, so that it can be seen or judged again as it was then.
    for (const [path, bytes] of one.files) {
      await mkdir(dirname(join(dir, 'calls', String(calls.length + 1), path)), { recursive: true })
      await writeFile(join(dir, 'calls', String(calls.length + 1), path), bytes)
    }
    const report = await check(one.files, browser)
    report.problems = [...new Set([...report.problems, ...said.problems])]
    calls.push({ name, place, report, files: one.files, looks, look })
    return [told(report, { name: one.name, place }), said.line].filter(Boolean).join(' ')
  }

  /** @type {Tool} */
  const make = {
    spec: SITE, kind: 'edit',
    title: (args) => `Site ${args?.name ?? ''}`,
    run: async (args) => {
      const files = Array.isArray(args?.files) ? args.files : []
      if (!files.length) throw new Error('Give the site its files: index.html first, then style.css and the other pages')
      const made = new Map(files.map(bytesOf))
      const name = String(args?.name ?? '').trim() || 'Site'
      const place = typeof args?.site === 'string' && sites.has(args.site) ? args.site : `sites/${sites.size + 1}-${slug(name)}`
      sites.set(place, { ...sites.get(place), name, files: made })
      return kept('site', place, args?.look)
    },
  }

  /** @type {Tool} */
  const change = {
    spec: CHANGE, kind: 'edit',
    title: (args) => `Change the site ${args?.site ?? ''}`,
    run: async (args) => {
      const place = String(args?.site ?? '')
      const one = sites.get(place)
      if (!one) throw new Error(`There is no site at "${place}". Sites here: ${[...sites.keys()].join(', ') || 'none'}.`)
      const done = changed(one.files, Array.isArray(args?.changes) ? args.changes : [])
      if ('error' in done) throw new Error(done.error)
      const files = done.files
      for (const file of Array.isArray(args?.files) ? args.files : []) files.set(...bytesOf(file))
      for (const path of Array.isArray(args?.remove) ? args.remove : []) files.delete(pathIn(path))
      sites.set(place, { ...one, files })
      return kept('site_change', place, args?.look)
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

/** Jean's own skills' names, as own-skills' line lists them, with the draft's. */
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
