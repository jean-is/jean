// The look a project's things share (D594, D601, D602): the person's design system, kit.json at the root of their files, under
// the organisation's kit in policy (`kit`), under the project's own, its `kit.json`, else one made from its colour. Decks are
// drawn with it over Jean's own (caps/slides/kit.js); Designs deal their first take in it (caps/designs/designs.js); the Word
// files and prints Jean makes take its colour and voice (caps/made/). Without one, each keeps its own look. Settings ›
// Appearance › Design system writes them (caps/slides/kit-page.js).
import { app } from './state.js'
import { COLOURS } from './touches.js'
import { readable } from './colour.js'

/** A colour as `#rrggbb`, whatever CSS calls it (an accent or a project's colour is oklch()), read back from a pixel. @param {string} colour */
export function hexOf(colour) {
  if (/^#[\da-f]{6}$/i.test(colour)) return colour
  const pen = /** @type {CanvasRenderingContext2D} */ (Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true }))
  Object.assign(pen, { fillStyle: colour }).fillRect(0, 0, 1, 1)
  return `#${[...pen.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Each kit.json, read once a visit, and again once written. @type {Map<string, Promise<{ tokens?: Record<string, any>, layouts?: Record<string, any> } | null>>} */
const files = new Map()
/** @param {string} path */
const read = (path) => files.get(path) ?? /** @type {Promise<any>} */ (files.set(path, app.fs.read(path).then((text) => (text ? JSON.parse(text) : null)).catch(() => null)).get(path))
/** Where a kit is kept: the person's at the root of their files, a project's in its folder. @param {string | null} dir null for the person's */
export const kitPath = (dir) => (dir === null ? 'kit.json' : `${dir}/kit.json`)

/** A kit as its file holds it, or none, as in a saved task's page. @param {string | null} dir null for the person's */
export const kitFile = async (dir) => (app.fs ? read(kitPath(dir)) : null)

/** A kit kept: its file written, or taken away when nothing is left in it. @param {string | null} dir null for the person's @param {object | null} kit */
export async function keepKit(dir, kit) {
  const path = kitPath(dir), empty = !kit || !Object.values(kit).some((part) => part && (typeof part !== 'object' || Object.keys(part).length))
  files.set(path, Promise.resolve(empty ? null : kit))
  await (empty ? app.fs.remove(path).catch(() => {}) : app.fs.write(path, `${JSON.stringify(kit, null, 2)}\n`))
}

/** The project's kit: its kit.json, else one of its colour, else none, as in a saved task's page. @param {string} [dir] */
export async function projectKit(dir = app.projectDir) {
  if (!app.fs) return null
  const own = await read(kitPath(dir))
  const colour = app.project.peek().dir === dir && app.project.peek().data.colour
  return own ?? (typeof colour === 'string' && colour !== COLOURS[0][1] ? { tokens: { primary: hexOf(colour) } } : null)
}

/** The look here, its flat tokens (`primary`, `paper`, `ink`, `voice`…): the person's, the organisation's, the project's, or none. @param {string} [dir] */
export async function lookHere(dir) {
  const tokens = { ...(await kitFile(null))?.tokens, ...app.policy.kit?.tokens, ...(await projectKit(dir))?.tokens }
  return tokens.primary || tokens.voice ? /** @type {Record<string, any>} */ (tokens) : null
}

/** The look here on white paper, as a Word file or a print wears it: its colour deepened until words read on it, its voice. @param {string} [dir] */
export const onPaper = async (dir) => ((look) => look && { colour: look.primary ? readable(hexOf(look.primary), '#ffffff') : undefined, voice: look.voice })(await lookHere(dir))
