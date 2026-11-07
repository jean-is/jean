// The tools a brain is given in npm run sites (Sites' phase 0): `site` and `site_change`, as Sites would declare them,
// each keeping the site in the run's folder and returning its check, and `skill`, which reads Jean's own skills as
// own-skills does, the draft "Make a site" among them, from test/sites/skill/.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { check, told, TYPES } from './check.js'

/** @import { Tool } from '../../app/core/loop.js' */
/** @typedef {import('./check.js').Report} Report */
/** @typedef {{ name: 'site' | 'site_change', place: string, report: Report }} Call  each call, in order */

const DIRECTORY = new URL('../../app/caps/skills/directory/', import.meta.url)
const DRAFT = new URL('./skill/', import.meta.url)

export const LINES = [{ name: 'site', line: 'make a website of a few pages, or replace one whole; each call checks it and says what to fix' },
  { name: 'site_change', line: 'change a site by exact passages; it is checked again' }]

const FILE = { type: 'object', properties: {
  path: { type: 'string', description: 'Its path in the site: index.html, style.css, fr/index.html, photos/dunes.jpg' },
  text: { type: 'string', description: 'The whole file, for a page, a style sheet, a script or a drawing' },
  from: { type: 'string', description: 'For a picture: the name of a file the user shared' } }, required: ['path'] }

/** @type {import('../../app/core/types.js').ToolSpec} */
export const SITE = {
  name: 'site',
  description: 'Make a website of a few pages, or replace a site whole. Read the skill site first. Give every file: the pages as HTML, one style.css, a site.js only if needed, pictures from the files the user shared. Each call checks every page at 320 and 1280 pixels, for screen readers and for search engines, and says what to fix: fix it and call again.',
  parameters: { type: 'object', properties: {
    name: { type: 'string', description: "The site's name, in the user's language" },
    site: { type: 'string', description: "A site's place, to replace it whole" },
    files: { type: 'array', items: FILE } }, required: ['name', 'files'] },
}

/** @type {import('../../app/core/types.js').ToolSpec} */
export const CHANGE = {
  name: 'site_change',
  description: 'Change a site by exact passages of its files, each found once; add or replace whole files with files, take some away with remove. It is checked again and said, as site does.',
  parameters: { type: 'object', properties: {
    site: { type: 'string', description: 'Its place, as site gave it' },
    changes: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
    files: { type: 'array', items: FILE },
    remove: { type: 'array', items: { type: 'string' } } }, required: ['site'] },
}

/** A file's path in a site, as given, or why it can't be one. @param {unknown} path */
function pathIn(path) {
  const clean = String(path ?? '').trim().replace(/^\.?\/+/, '')
  if (!clean || clean.split('/').some((part) => part === '..' || part === '') || /^[a-z]+:/i.test(clean)) throw new Error(`"${path}" isn't a path in the site: write one such as index.html or fr/index.html`)
  if (!TYPES[clean.toLowerCase().split('.').pop() ?? '']) throw new Error(`${clean}: a site holds pages, style sheets, scripts, drawings and pictures, not .${clean.split('.').pop()} files`)
  return clean
}

/** A slug of a name, in any script. @param {string} name */
const slug = (name) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site'

/**
 * The tools of one run: each site kept in `dir`/sites/<n>-<slug>/, checked in `browser`, its calls in `calls`.
 * @param {{ dir: string, browser: import('@playwright/test').Browser, shared: Map<string, Uint8Array>, calls: Call[] }} at
 * @returns {Tool[]}
 */
export function siteTools({ dir, browser, shared, calls }) {
  /** @type {Map<string, { name: string, files: Map<string, Uint8Array> }>} */
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

  /** Writes a site out, checks it and keeps the call. @param {'site' | 'site_change'} name @param {string} place */
  const kept = async (name, place) => {
    const one = /** @type {{ name: string, files: Map<string, Uint8Array> }} */ (sites.get(place))
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
    calls.push({ name, place, report })
    return told(report, { name: one.name, place })
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
      sites.set(place, { name, files: made })
      return kept('site', place)
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
      const files = new Map(one.files)
      const failed = /** @type {string[]} */ ([])
      for (const { path, old, new: next } of Array.isArray(args?.changes) ? args.changes : []) {
        const at = pathIn(path), bytes = files.get(at)
        if (!bytes) { failed.push(`${at} isn't in the site`); continue }
        const text = new TextDecoder().decode(bytes), count = String(old ?? '') ? text.split(String(old)).length - 1 : 0
        if (count !== 1) { failed.push(`${at}: the passage "${String(old ?? '').slice(0, 60)}" is found ${count} times, not once`); continue }
        files.set(at, encode(text.replace(String(old), () => String(next ?? ''))))
      }
      if (failed.length) throw new Error(`Nothing changed: ${failed.join('; ')}. Quote each passage exactly as it is in the file.`)
      for (const file of Array.isArray(args?.files) ? args.files : []) files.set(...bytesOf(file))
      for (const path of Array.isArray(args?.remove) ? args.remove : []) files.delete(pathIn(path))
      sites.set(place, { ...one, files })
      return kept('site_change', place)
    },
  }

  return [make, change, skillTool]
}

/** The steps of one of Jean's own skills, or of a sheet beside them, without the front matter. @param {string} named */
async function skillText(named) {
  const [name, sheet] = named.replace(/\.md$/, '').split('/')
  const base = name === 'site' ? DRAFT : new URL(`${name}/`, DIRECTORY)
  const text = await readFile(new URL(sheet ? `${sheet}.md` : 'SKILL.md', base), 'utf8').catch(() => null)
  return text?.replace(/^---\n[\s\S]*?\n---\n/, '').trim() ?? null
}

/** Jean's own skills' names, as own-skills' line lists them, with the draft's. */
export const ownSkills = async () => [...(await readdir(DIRECTORY, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name), 'site'].sort()

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
export const skillLine = async () => ({ name: 'skill', line: `read the steps of a skill before following it: ${(await ownSkills()).join(', ')}` })
