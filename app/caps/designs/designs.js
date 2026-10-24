// Designs (D572): an invitation, a poster, a flyer or a post, laid out by Jean and finished by the user. A design is a
// file of the project's, `designs/<ulid>-<slug>.svg`, named once and never renamed: a drawing any program shows, holding
// the design as JSON, which is all Jean reads (./format.js). The brain gives the facts by their role with `design`, and
// Jean lays them out three ways from its own layouts (./layout.js), the first open beside the conversation, where the user
// picks a take and finishes it by hand (./view.js); its picture is made as Pictures makes one, once found, else the user's
// own photo fills its frame. `design_change` changes parts, Jean's version of each for the user to accept or reject (D505),
// waiting in `designs/.suggested/<file>.json`. Its designs are creations, which @ lists and the brain knows from <designs>;
// while one is on show, each message comes with a note of its parts and the one the user points at. Written at each change
// from a page drawn out of sight (./page.js), so the file's lines are those the browser laid out.
import { nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register, loaded } from '../../ui/caps.js'
import { app, conversationOf } from '../../ui/state.js'
import { styleSheet } from '../../ui/sheet.js'
import { noteRecord } from '../../core/events.js'
import { slug } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { useStrings, locale } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { page, ask, reread as listed } from '../../ui/creations.js'
import { languageOf } from '../../ui/language.js'
import { xmpOf } from '../pictures/mark.js'
import { BRAND } from '../../brand.js'
import { DESIGN, CHANGE, LINES, RULE, VOICES, repair } from './tool.js'
import { designOf, changed, withParts, textOf, marksOf } from './layout.js'
import { toSvg, fromSvg, designOfPng } from './format.js'
import { laidOut, pageOf } from './page.js'
import '../../ui/shown.js'

/** @import { Design, Part, Book } from './layout.js' */
/**
 * A design read: its project, its place there, the design as the user has it, and Jean's changes waiting for them (D505):
 * its version of each part it changes (null: taken away), the voice it chose and its few words for each.
 * @typedef {{ dir: string, path: string, design: Design, side: Side | null }} Kept
 * @typedef {{ parts: Record<string, Part | null>, voice?: string, notes: Record<string, string> }} Side
 */

const [book] = await Promise.all([/** @type {Promise<Book>} */ (fetch(new URL('layouts.json', import.meta.url)).then((response) => response.json())), useStrings('designs'),
  styleSheet(new URL('designs.css', import.meta.url))])
export { book }
/** How many of the project's designs the brain's <designs> names. */
const LISTED = 20
const PLACE = /^designs\/[^/]+\.svg$/
/** Save's menu, once its module is in (./export.js). @type {import('@preact/signals-core').Signal<((file: { uri: string }) => unknown) | null>} */
const saving = signal(null)

/** The design on show in the preview, which its view draws and the brain hears of, and the part the user points at. */
export const shown = signal(/** @type {Kept | null} */ (null)), picked = signal('')

/** Where Jean's changes left to decide wait (D505). @param {string} path */
const waiting = (path) => path.replace(/^designs\//, 'designs/.suggested/').replace(/\.svg$/, '.json')
/** The design as Jean would have it, its changes taken. @param {Kept} one */
export const suggested = ({ design, side }) => (side ? { ...withParts(design, side.parts), ...(side.voice && { voice: side.voice }) } : design)

/** A design of a project, read from its file's JSON alone; null when there is none, or it isn't one. @param {string} path @param {string} [dir] @returns {Promise<Kept | null>} */
export async function load(path, dir = app.projectDir) {
  const text = PLACE.test(path) && await app.fs.read(`${dir}/${path}`), design = text ? fromSvg(text) : null
  if (!design) return null
  let side = null
  try { side = JSON.parse((await app.fs.read(`${dir}/${waiting(path)}`)) ?? 'null') } catch {}
  return { dir, path, design, side }
}

/** The writes, one after the other, so that none is lost under another. */
let writing = /** @type {Promise<unknown>} */ (Promise.resolve())
/**
 * A design written: fitted and drawn out of sight, its lines into its file, with Jean's changes waiting beside it, and shown
 * as written where nothing changed it meanwhile. @param {Kept} one @param {Kept} [base] what it was made from @returns {Promise<Kept>} as written
 */
export const write = (one, base = one) => /** @type {Promise<Kept>} */ (writing = writing.catch(() => {}).then(async () => {
  const { design, lines } = await laidOut(one.design, book), theirs = one.side && (await laidOut(suggested(one), book)).design
  // Jean's version of each part fitted too, as it would be once accepted.
  const side = one.side && { ...one.side, parts: Object.fromEntries(Object.entries(one.side.parts).map(([id, part]) => [id, part && (theirs?.parts.find((each) => each.id === id) ?? part)])) }
  await app.fs.write(`${one.dir}/${one.path}`, toSvg(design, lines, { xmp: xmpOf(BRAND.name) }))
  await (side ? app.fs.write(`${one.dir}/${waiting(one.path)}`, JSON.stringify(side)) : app.fs.remove(`${one.dir}/${waiting(one.path)}`))
  const now = shown.peek(), written = { ...one, design, side }
  if (now && (now === one || now === base)) shown.value = written
  return written
}))

/**
 * A design changed, as it is by then: the one on show, else its file. @param {string} path @param {(one: Kept) => Kept} change
 * @param {string} [dir] @returns {Promise<Kept | null>}
 */
export async function update(path, change, dir = app.projectDir) {
  const now = shown.peek(), one = now?.path === path && now.dir === dir ? now : await load(path, dir)
  return one && write(change(one), one)
}

/**
 * The pictures a design asks for made as Pictures makes them (its checks, its marks: D251, D275, D324), once found, each into
 * its part or Jean's version of it; what it says of them, for the brain. @param {Kept} one @param {string[]} ids
 * @param {import('../../core/loop.js').ToolContext} ctx
 */
async function paint(one, ids, ctx) {
  if (!ids.length) return ''
  if (!loaded.peek().has('pictures')) return ' Its picture is a frame for a photo of the user\'s own: Pictures isn\'t on, which you may offer.'
  const { make } = await import('../pictures/pictures.js'), said = []
  for (const id of ids) {
    const part = suggested(one).parts.find((each) => each.id === id), [, , w, h] = part?.box ?? [1, 1, 1, 1], made = /** @type {import('../../core/loop.js').ToolContext} */ ({ ...ctx, meta: {}, progress: () => {} })
    try {
      await make('picture', { description: part?.words, shape: w / h > 1.2 ? 'wide' : h / w > 1.2 ? 'tall' : 'square', name: one.design.name }, made)
    } catch (error) {
      said.push(` Its picture wasn't made: ${error instanceof Error ? error.message : error}`)
      continue
    }
    const { uri } = made.meta.picture, bitmap = await createImageBitmap(new Blob([/** @type {BlobPart} */ (await app.fs.readBytes(`${one.dir}/${uri}`))]))
    const fill = (/** @type {Part} */ each) => ({ ...each, file: uri, px: [bitmap.width, bitmap.height] })
    ctx.meta.made ??= made.meta.made
    one = (await update(one.path, (now) => (now.side?.parts[id] ? { ...now, side: { ...now.side, parts: { ...now.side.parts, [id]: fill(/** @type {Part} */ (now.side.parts[id])) } } }
      : { ...now, design: { ...now.design, parts: now.design.parts.map((each) => (each.id === id ? fill(each) : each)) } }), one.dir)) ?? one
  }
  return said.join('')
}

/** A design, open beside the conversation once it is on show. @param {Kept} one */
async function open(one) {
  if (shown.peek()?.path === one.path) return
  ;(await import('../../ui/preview.js')).preview({ uri: one.path, name: `${one.design.name}.svg`, mimeType: 'image/svg+xml' })
  for (let wait = 0; wait < 100 && shown.peek()?.path !== one.path; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
}

/** Whether the call's task is the one on screen, where a design opens. @param {import('../../core/loop.js').ToolContext} ctx */
const here = (ctx) => conversationOf(ctx.signal)?.path === app.current.peek()?.path

/** A design's parts as the brain reads them: each id and its words, a picture's description. @param {Design} design */
const partsOf = (design) => design.parts.filter((part) => part.role !== 'shape').map((part) => `${part.id} "${part.text ?? part.words ?? ''}"`).join(', ')

/** What Jean's marks say, for the brain to tell the user. @param {Design} design */
function marksSaid(design) {
  const said = marksOf(design, new Date()).map((mark) => ({ gap: design.parts.find((part) => part.id === mark.part)?.role === 'picture' ? `${mark.part} is a frame still to fill with a picture` : `${mark.part} has a gap, ${mark.gap}`, weekday: `the weekday in ${mark.part} isn't its date's ("${mark.fix}" would be)`,
    reply: `${mark.part} asks for a reply after the event`, faint: `${mark.part} is faint`, soft: `${mark.part} will print soft`, margin: `${mark.part} is in the printer's margin` })[mark.kind])
  return said.length ? ` Marked for the user to look at before printing: ${said.join('; ')}.` : ''
}

/** A design the brain names by its place; throws with the project's designs when there is none. @param {unknown} path */
async function named(path) {
  const one = await load(String(path ?? '')).catch(() => null)
  if (one) return one
  const all = (await kept()).map((item) => `${item.name}: ${item.path}`)
  throw new Error(`There is no design ${path}.${all.length ? ` The project's designs: ${all.join('; ')}.` : ' Make one with design.'}`)
}

/** @type {import('../../core/loop.js').Tool} */
const designTool = {
  spec: DESIGN,
  kind: 'edit',
  title: (args) => `Design ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const fixed = repair(args, locale.peek())
    if (!fixed) throw new Error('Give the design its words by their role: its title at least.')
    // In the language of its words, the user's own where it is theirs.
    const base = languageOf(Object.values(fixed.facts.words).join('\n'), locale.peek()), lang = locale.peek().split('-')[0] === base ? locale.peek() : base
    const path = `designs/${ulid()}-${slug(fixed.facts.name) || 'design'}.svg`, now = new Date().toISOString()
    let one = await write({ dir: app.projectDir, path, side: null, design: designOf(book, fixed.facts, { lang, now, by: 'jean' }) })
    ctx.meta.files = [{ uri: path, name: `${one.design.name}.svg`, mimeType: 'image/svg+xml', size: (await app.fs.readBytes(`${one.dir}/${path}`))?.length ?? 0 }]
    if (here(ctx)) await open(one)
    listed()
    const pictures = await paint(one, one.design.parts.filter((part) => part.role === 'picture' && !part.file).map((part) => part.id), ctx)
    one = (await load(path, one.dir)) ?? one
    return `Made ${one.design.name}, at ${path}: three takes beside the conversation, for the user to pick one and finish by hand. Its parts: ${partsOf(one.design)}.${pictures}${marksSaid(one.design)} Change it with design_change.`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: CHANGE,
  kind: 'edit',
  title: (args) => `Change ${args?.design ?? ''}`,
  run: async (args, ctx) => {
    const one = await named(args?.design)
    if (!here(ctx)) return 'The user is in another task: change the design once they are back in this one.'
    const { parts, notes, paint: ids } = changed(suggested(one), Array.isArray(args?.changes) ? args.changes : [], new Date().toISOString())
    const voice = VOICES.includes(args?.voice) ? args.voice : one.side?.voice
    const side = { parts: { ...one.side?.parts, ...parts }, notes: { ...one.side?.notes, ...notes }, ...(voice && { voice }) }
    await open(one)
    const now = (await update(one.path, (was) => ({ ...was, side }), one.dir)) ?? one
    const pictures = await paint(now, ids, ctx)
    return `${Object.keys(parts).length} changes to ${one.design.name}, on the design for the user to accept or reject.${pictures}`
  },
}

/**
 * The designs a project keeps (the open one's unless named), the latest made first, with their words, how to open them, and the
 * design itself for a card. @param {string} [dir]
 */
export async function kept(dir = app.projectDir) {
  const files = (await app.fs.list(`${dir}/designs`)).flatMap(({ kind, name }) => (kind === 'file' && name.endsWith('.svg') ? [`designs/${name}`] : [])).sort().reverse()
  const all = await Promise.all(files.map((path) => load(path, dir).catch(() => null)))
  return all.flatMap((one) => (one ? [{ path: one.path, name: one.design.name, changed: one.design.changed, created: one.design.created, pinned: one.design.pinned === true, text: textOf(one.design),
    design: one.design, link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: one.path, name: `${one.design.name}.svg`, mimeType: 'image/svg+xml' }) }] : []))
}

/** What the preview's address names: a design by its name, as the file it downloads as. @param {string} path */
export async function metaOf(path) {
  const one = await load(path).catch(() => null)
  return one ? { name: `${one.design.name}.svg`, mimeType: 'image/svg+xml' } : null
}

/** The design's file as it goes out: its faces and pictures inside it, so that it shows the same anywhere (./export.js). @param {string} path */
export const bytesOf = async (path) => (await import('./export.js')).fileOf(path)

/** A design's view, for the preview (ui/preview.js): drawn from the design on show, let go with the view. @param {{ uri: string }} file @param {(() => void)[]} holds */
export async function editor(file, holds) {
  const one = await load(file.uri)
  if (!one) return null
  shown.value = one
  const { view } = await import('./view.js'), box = view(holds)
  // After the view's own, which writes what is left to write.
  holds.push(() => { if (shown.peek()?.path === one.path) { shown.value = null; picked.value = '' } })
  return box
}

/**
 * A design's picture shared in the box opens as that design again, a copy the user's, a picture this project doesn't hold left as a
 * frame to fill. @param {{ uri: string, mimeType?: string }} file
 */
async function reopen(file) {
  const design = file.mimeType === 'image/png' && designOfPng((await app.fs.readBytes(`${app.projectDir}/${file.uri}`)) ?? new Uint8Array())
  if (!design) return
  const now = new Date().toISOString(), parts = await Promise.all(design.parts.map(async (part) => (part.file && !(await app.fs.exists(`${app.projectDir}/${part.file}`)) ? { ...part, file: undefined } : part)))
  await open(await write({ dir: app.projectDir, path: `designs/${ulid()}-${slug(design.name) || 'design'}.svg`, side: null, design: { ...design, parts, author: 'user', created: now, changed: now } }))
  listed()
}

/** Pinned or renamed from the Creations page (D544). @param {{ path: string }} item @param {{ pinned?: boolean, name?: string }} edit */
const amend = ({ path }, { pinned, name }) => update(path, (one) => ({ ...one, design: { ...one.design, ...(name && { name }), ...(pinned !== undefined && { pinned: pinned || undefined }) } }))
/** A copy, the user's, by the name given. @param {{ path: string }} item @param {string} name */
async function copy({ path }, name) {
  const one = await load(path), now = new Date().toISOString(), to = `designs/${ulid()}-${slug(name) || 'design'}.svg`
  if (!one) throw new Error(`There is no design ${path}.`)
  const { pinned, ...design } = one.design
  await write({ dir: one.dir, path: to, side: null, design: { ...design, name, author: 'user', created: now, changed: now } })
  return to
}

/**
 * The note a message comes with while a design is on show and the brain hasn't heard of it as it is now: its place, its size,
 * its parts with their words, and the one the user points at. @param {import('../../core/types.js').Envelope[]} records
 */
function notes(records) {
  const one = shown.peek()
  if (!one) return []
  const design = suggested(one), text = `The design ${design.name} (${one.path}) is open beside the conversation, ${design.size}. Its parts: ${partsOf(design)}.${picked.peek() ? ` The user points at its part ${picked.peek()}.` : ''} Change it with design_change.`
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'design')
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'design', uri: one.path })]
}

register({
  id: 'designs',
  tools: [designTool, changeTool],
  lines: LINES,
  rules: [RULE],
  hooks: [{ on: 'file.add', run: (e, next) => { if (!e.routine) reopen(e.file).catch(console.warn); return next(e) } }],
  // The project's designs, the latest made first, by name and place, as <documents> names documents (D488).
  sections: async () => {
    const all = (await kept()).map(({ path, name }) => `- ${name}: ${path}`)
    return all.length ? { designs: [...all.slice(0, LISTED), ...(all.length > LISTED ? [`- and ${all.length - LISTED} older ones`] : [])].join('\n') } : {}
  },
  slots: { modes: { at: 11, draw: () => null, notes },
    head: { at: 2, draw: (/** @type {{ uri: string }} */ file) => (PLACE.test(file.uri) ? (saving.value ?? (import('./export.js').then((module) => { saving.value = module.saveMenu }), () => nothing))(file) : nothing) },
    creations: { id: 'designs', at: 3, draw: () => icons.palette, kept, mention: 'design', preview: (/** @type {{ design: Design }} */ item) => pageOf(item.design),
    make: () => ask('designs.ask', 'designs.example'), pin: (/** @type {{ path: string }} */ item, /** @type {boolean} */ pinned) => amend(item, { pinned }),
    rename: (/** @type {{ path: string }} */ item, /** @type {string} */ name) => amend(item, { name }), copy,
    remove: (/** @type {{ path: string }} */ { path }) => Promise.all([path, waiting(path)].map((one) => app.fs.remove(`${app.projectDir}/${one}`))) }, main: page },
})

