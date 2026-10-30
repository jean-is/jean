// The look a project's things share (D594, D601, D602): the person's design system, kit.json at the root of their files, under
// the organisation's kit in policy (`kit`), under the project's own, its `kit.json`, else one made from its colour. Decks are
// drawn with it over Jean's own (caps/slides/kit.js); Designs deal their first take in it (caps/designs/designs.js); Word files
// and prints, a document's as an answer's, wear its colours, type and logo, and a document's or a collection's pane shows it too (caps/made/paper.js). Without one, each keeps its own look. Settings ›
// Appearance › Design system writes them (caps/slides/kit-page.js).
import { signal } from '@preact/signals-core'
import { app, theme } from './state.js'
import { COLOURS } from './touches.js'
import { contrast, mix, readable } from './colour.js'

/**
 * A colour as `#rrggbb`, whatever CSS calls it (an accent or a project's colour is oklch()), one see-through (rgba()) as it
 * shows on white, read back from a pixel. @param {string} colour
 */
export function hexOf(colour) {
  if (/^#[\da-f]{6}$/i.test(colour)) return colour
  const pen = /** @type {CanvasRenderingContext2D} */ (Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true }))
  Object.assign(pen, { fillStyle: '#ffffff' }).fillRect(0, 0, 1, 1)
  Object.assign(pen, { fillStyle: colour }).fillRect(0, 0, 1, 1)
  return `#${[...pen.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Counts each kit kept, for what wears one. */
export const kits = signal(0)
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
  kits.value++
  await (empty ? app.fs.remove(path).catch(() => {}) : app.fs.write(path, `${JSON.stringify(kit, null, 2)}\n`))
}

/** The project's kit: its kit.json, else one of its colour, else none, as in a saved task's page. @param {string} [dir] */
export async function projectKit(dir = app.projectDir) {
  if (!app.fs) return null
  const own = await read(kitPath(dir))
  const colour = app.project.peek().dir === dir && app.project.peek().data.colour
  return own ?? (typeof colour === 'string' && colour !== COLOURS[0][1] ? { tokens: { primary: hexOf(colour) } } : null)
}

/** The tokens here: the person's, the organisation's, the project's. @param {string} [dir] @returns {Promise<Record<string, any>>} */
const tokensHere = async (dir) => ({ ...(await kitFile(null))?.tokens, ...app.policy.kit?.tokens, ...(await projectKit(dir))?.tokens })

/** The look here, its flat tokens (`primary`, `paper`, `ink`, `voice`…), or none. @param {string} [dir] */
export const lookHere = async (dir) => ((tokens) => (tokens.primary || tokens.voice ? tokens : null))(await tokensHere(dir))

/** A logo inside the kit, the only kind a kit can bring: nothing that could reach the web or leave a style sheet's quotes. */
const LOGO = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/]+=*$/i

/**
 * A look on a ground (D601, D663, D664): its colours for words deepened until they read there, its pale fill where its words read on
 * that, its voice or its own fonts, and its logo, a picture inside the kit alone, in its corner.
 * @param {string} ground #rrggbb @param {Record<string, any>} own its colours there @param {Record<string, any>} tokens the rest
 */
function lookOn(ground, own, { primary, voice, fonts, logoAt }) {
  const on = (/** @type {unknown} */ colour) => (colour && typeof colour === 'string' ? readable(hexOf(colour), ground) : undefined), words = on(own.ink), fill = own.soft && typeof own.soft === 'string' ? hexOf(own.soft) : ''
  return { colour: on(own.primary ?? primary), ink: words, muted: on(own.muted), soft: fill && contrast(words ?? readable('#111111', ground), fill) >= 4.5 ? fill : undefined, voice: /** @type {string | undefined} */ (voice),
    fonts: Array.isArray(fonts?.heading) && Array.isArray(fonts?.body) ? /** @type {{ heading: string[], body: string[] }} */ (fonts) : undefined, logo: LOGO.test(own.logo) ? /** @type {string} */ (own.logo) : undefined, logoAt: /** @type {string | undefined} */ (logoAt) }
}

/** Given tokens on white paper, as a Word file or a print wears them. @param {Record<string, any>} tokens */
export const paperOf = (tokens) => lookOn('#ffffff', tokens, tokens)

/** The look here on white paper, or none. @param {string} [dir] */
export const onPaper = async (dir) => ((look) => (Object.values(look).some(Boolean) ? look : null))(paperOf(await tokensHere(dir)))

/**
 * The look here in a document's or a collection's pane (D664), or none, by day or by night as the room is: on its paper, else the room's, its
 * colours there. With a paper of its own, words that read on it, and quiet ones worked out; by night, a day's logo stands on a plate.
 * @param {string} [dir]
 */
export async function onScreen(dir) {
  const tokens = await tokensHere(dir)
  if (!Object.keys(tokens).length) return null
  const night = theme.peek() === 'dark', own = night ? tokens.dark ?? {} : tokens, room = (/** @type {string} */ name) => hexOf(getComputedStyle(document.documentElement).getPropertyValue(name).trim())
  const ground = own.paper && typeof own.paper === 'string' ? hexOf(own.paper) : room('--room-2'), look = lookOn(ground, { ...own, logo: own.logo ?? tokens.logo }, tokens), ink = look.ink ?? (own.paper ? readable(room('--ink'), ground) : undefined)
  return { ...look, ink, muted: look.muted ?? (ink && readable(mix(ink, ground, 0.3), ground)), ground, paper: own.paper ? ground : undefined, plate: night && !own.logo }
}
