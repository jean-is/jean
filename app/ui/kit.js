// The look a project's things share (D594, D601): the organisation's kit in policy (`kit`), under the project's own, its
// `kit.json`, else one made from its colour. Decks are drawn with it over Jean's own (caps/slides/kit.js); Designs deal their
// first take in it (caps/designs/designs.js); the Word files and prints Jean makes take its colour and voice (caps/made/).
// Without one, each keeps its own look.
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

/** Each project's kit.json, read once a visit. @type {Map<string, Promise<{ tokens?: Record<string, any> } | null>>} */
const files = new Map()

/** The project's kit: its kit.json, else one of its colour, else none, as in a saved task's page. @param {string} [dir] */
export async function projectKit(dir = app.projectDir) {
  if (!app.fs) return null
  const own = await (files.get(dir) ?? files.set(dir, app.fs.read(`${dir}/kit.json`).then((text) => (text ? JSON.parse(text) : null)).catch(() => null)).get(dir))
  const colour = app.project.peek().dir === dir && app.project.peek().data.colour
  return own ?? (typeof colour === 'string' && colour !== COLOURS[0][1] ? { tokens: { primary: hexOf(colour) } } : null)
}

/** The look here, its flat tokens (`primary`, `paper`, `ink`, `voice`…): the organisation's under the project's, or none. @param {string} [dir] */
export async function lookHere(dir) {
  const tokens = { ...app.policy.kit?.tokens, ...(await projectKit(dir))?.tokens }
  return tokens.primary || tokens.voice ? /** @type {Record<string, any>} */ (tokens) : null
}

/** The look here on white paper, as a Word file or a print wears it: its colour deepened until words read on it, its voice. @param {string} [dir] */
export const onPaper = async (dir) => ((look) => look && { colour: look.primary ? readable(hexOf(look.primary), '#ffffff') : undefined, voice: look.voice })(await lookHere(dir))
