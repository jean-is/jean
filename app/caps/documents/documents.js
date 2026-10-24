// Documents (D473, D474, D485), Docs for short: a document is a Markdown file of the project's, `documents/<ulid>-<slug>.md`,
// named once and never renamed, its name, author and times in its front matter. Jean's brain makes one with
// `document`, and it opens in the preview beside the conversation, in its editor (./editor.js), in Jean's own
// document, ProseMirror and the editor's modules loaded with the first one. Each change is written through
// core/fs.js a moment later; what the person selects in it, or did with Jean's suggestions, the brain reads
// with the next message, with the document as it is now when it changed. The brain changes it with `suggest`,
// its whole new text and a few words for each change, which the person accepts or rejects (D505). From any task, @ in
// the box lists the project's documents (ui/complete.js, D488), and the brain knows them from its <documents>
// section; one it changes unseen opens first, unchanged, its text the brain's to read. One the user makes from
// Creations (D502) has no name: it goes by its title.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register, slots } from '../../ui/caps.js'
import { app, conversationOf } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { page, prose, reread } from '../../ui/creations.js'
import { styleSheet } from '../../ui/sheet.js'
import { noteRecord } from '../../core/events.js'
import { parseFrontMatter, stringifyFrontMatter, slug } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { t, useStrings } from '../../core/i18n.js'

await Promise.all([useStrings('documents'), ...['prosemirror/prosemirror', 'prosemirror/tables', 'prosemirror/gapcursor'].map((name) => styleSheet(new URL(`../../vendor/${name}.css`, import.meta.url))),
  styleSheet(new URL('editor.css', import.meta.url))])

/** How many of the project's documents the brain's <documents> names. */
const LISTED = 20

/**
 * An editor open: the document it shows, its front matter and text as last saved, what the person selected
 * in it, and its editor.
 * @typedef {{ path: string, name: string, head: Record<string, any>, body: string, context: string, editor: ReturnType<typeof import('./editor.js').create> }} Editor
 */
/** The document on show in the preview, which the brain hears of. @type {Editor | null} */
export let shown = null

/** A document's name: the brain's, else its title. @param {{ data: Record<string, any>, body: string }} read */
const nameOf = ({ data, body }) => String(data.name ?? /^# +(.*\S)/.exec(body)?.[1] ?? t('documents.untitled'))
/** Where Jean's changes left to decide wait (D505). @param {string} path */
const waiting = (path) => path.replace(/^documents\//, 'documents/.suggested/').replace(/\.md$/, '.json')

/**
 * A document's editor, for the preview (ui/preview.js): its box, which reads the file, let go with the view.
 * @param {{ uri: string, name: string }} file @param {(() => void)[]} holds
 */
export async function editor(file, holds) {
  const path = file.uri
  // Its project's, where it is saved as it goes, whichever the room is by then.
  const project = app.projectDir, saved = await app.fs.read(`${project}/${path}`), now = new Date().toISOString()
  let unwritten = saved === null
  // One the user made from Creations isn't written until they write in it, or accept what Jean suggests (D544).
  const { data: head, body } = unwritten ? { data: { format: 1, author: 'user', created: now, changed: now }, body: '' } : parseFrontMatter(saved ?? '')
  const box = Object.assign(document.createElement('div'), { className: 'document' })
  const { create } = await import('./editor.js')
  const one = /** @type {Editor} */ ({ path, name: nameOf({ data: head, body }), head, body, context: '' })
  const side = `${project}/${waiting(path)}`
  let held = null
  try { held = JSON.parse((await app.fs.read(side)) ?? 'null') } catch {}
  one.editor = create(box, {
    name: one.name, path, markdown: body, pictures: String(head.pictures ?? ''),
    write: async (text, pictures) => {
      const { pictures: _, ...rest } = one.head
      one.body = text
      one.name = nameOf({ data: one.head, body: text })
      one.head = { ...rest, changed: new Date().toISOString(), ...(pictures && { pictures }) }
      await app.fs.write(`${project}/${path}`, stringifyFrontMatter(one.head, text))
      if (unwritten) (unwritten = false), reread()
    },
    // A picture pasted, kept in the project as the box keeps one (caps/files, D573), its place from the document's folder.
    keep: async (file) => {
      const [{ fitPicture }, { addFile }] = await Promise.all([import('../files/pictures.js'), import('../../core/files.js')]), fit = await fitPicture(file)
      return fit && `../${(await addFile(app.fs, { projectDir: project, ...fit, pages: [''], by: app.deviceId })).uri}`
    },
    tell: (context) => { one.context = context },
    held,
    hold: (left) => (left ? app.fs.write(side, JSON.stringify({ format: 1, author: 'jean', changed: new Date().toISOString(), ...left }))
      : app.fs.exists(side).then((there) => (there ? app.fs.remove(side) : undefined))),
  })
  shown = one
  holds.push(() => {
    one.editor.destroy()
    if (shown === one) shown = null
  })
  return box
}

/** The document at a place in the project, in the preview, once its editor has opened it. @param {string} path */
async function show(path) {
  if (shown?.path === path) return shown
  ;(await import('../../ui/preview.js')).preview({ uri: path, name: (await metaOf(path))?.name ?? `${t('documents.untitled')}.md`, mimeType: 'text/markdown' })
  for (let wait = 0; wait < 100 && shown?.path !== path; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  if (!shown || shown.path !== path) throw new Error('The document could not be opened.')
  return shown
}

/** Whether the preview's pane is full screen, with what floats over the document inside it, since nothing else shows there. */
const full = signal(false)
document.addEventListener('fullscreenchange', () => {
  full.value = Boolean(document.fullscreenElement?.matches('.preview'))
  for (const one of document.querySelectorAll('.slash, .bubble, .block-handle, .block-menu, .marquee')) (document.fullscreenElement ?? document.body).append(one)
})

/**
 * At the top of the pane of the document on show (ui/preview.js): Share, once sharing is found, which shares it as it
 * is when pressed, drawn as an answer is (D361); and Full screen, where the browser has it. @param {{ uri: string }} file
 */
function head(file) {
  if (shown?.path !== file.uri) return nothing
  const { editor } = shown, item = { get text() { return editor.markdown() } }
  return html`${slots('drawn').map((part) => part.draw(item))}${document.fullscreenEnabled ? html`<button class="icon-button" aria-label=${t(full.value ? 'documents.exitFullscreen' : 'documents.fullscreen')}
    @click=${(/** @type {Event} */ event) => (document.fullscreenElement ? document.exitFullscreen() : /** @type {HTMLElement} */ (event.currentTarget).closest('.pane')?.requestFullscreen())?.catch(() => {})}>${icons[full.value ? 'exit-fullscreen' : 'fullscreen']}</button>` : nothing}`
}

/** What the preview's address names: a document by its name, none when there is no such document. @param {string} path */
export async function metaOf(path) {
  const text = /^documents\/[^/]+\.md$/.test(path) && await app.fs.read(`${app.projectDir}/${path}`)
  return text ? { name: `${nameOf(parseFrontMatter(text))}.md`, mimeType: 'text/markdown' } : null
}

/**
 * The documents a project keeps (the open one's unless named), the latest made first, with their text and how to open
 * them, read again each time as skills are: what @ offers, its creations (D497), and the brain's <documents>. @param {string} [dir] the project's
 */
export async function kept(dir = app.projectDir) {
  const paths = (await app.fs.list(`${dir}/documents`)).flatMap(({ kind, name }) => (kind === 'file' && name.endsWith('.md') ? [`documents/${name}`] : [])).sort().reverse()
  return Promise.all(paths.map(async (path) => {
    const read = parseFrontMatter((await app.fs.read(`${dir}/${path}`)) ?? ''), name = nameOf(read)
    return { path, name, changed: String(read.data.changed ?? ''), created: String(read.data.created ?? ''), pinned: read.data.pinned === true, text: read.body,
      link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: path, name: `${name}.md`, mimeType: 'text/markdown' }) }
  }))
}

/** The user's new document (D502), beside the task, the caret on its title, written once they write (D544). */
async function blank() {
  const one = await show(`documents/${ulid()}-document.md`)
  requestAnimationFrame(() => one.editor.view.focus())
}

// From the Creations page (D544): pinned, renamed with its title line (D502), copied or deleted, the one on show through its editor.
/** @typedef {{ path: string }} Kept @param {string} body @param {string} name */
const titled = (body, name) => (/^# /.test(body) ? body.replace(/^.*/, () => `# ${name}`) : `# ${name}\n\n${body}`)
/** @param {string} path */
const current = async (path) => (shown?.path === path ? { data: shown.head, body: shown.editor.markdown() } : parseFrontMatter((await app.fs.read(`${app.projectDir}/${path}`)) ?? ''))
/** @param {Kept} item @param {boolean} [pinned] @param {string} [name] */
async function amend({ path }, pinned, name) {
  const read = await current(path), { pinned: was, ...data } = read.data
  const head = { ...data, ...(name && data.name !== undefined && { name }), ...(name && { changed: new Date().toISOString() }), ...((pinned ?? was) && { pinned: true }) }
  if (shown?.path === path) { shown.head = head; if (name) shown.editor.retitle(name) }
  await app.fs.write(`${app.projectDir}/${path}`, stringifyFrontMatter(head, name ? titled(read.body, name) : read.body))
}
/** @param {Kept} item @param {string} name */
async function copy({ path }, name) {
  const read = await current(path), { pinned, ...data } = read.data, now = new Date().toISOString(), to = `documents/${ulid()}-${slug(name) || 'document'}.md`
  await app.fs.write(`${app.projectDir}/${to}`, stringifyFrontMatter({ ...data, ...(data.name !== undefined && { name }), author: 'user', created: now, changed: now }, titled(read.body, name)))
  return to
}
/** @param {Kept} item */
const remove = ({ path }) => Promise.all([path, waiting(path)].map((one) => app.fs.remove(`${app.projectDir}/${one}`)))

/**
 * The note a message comes with while a document is on show and the brain hasn't read it as it is now: its place,
 * what the person selected in it or did with Jean's suggestions, and its text.
 * @param {import('../../core/types.js').Envelope[]} records
 */
function notes(records) {
  if (!shown) return []
  const text = `The document ${shown.name} (${shown.path}) is open beside the conversation. It reads:\n\n${shown.body}${shown.context ? `\n\n${shown.context}` : ''}`
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'document' && update.data.uri === shown?.path)
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'document', uri: shown.path })]
}

/** @type {import('../../core/loop.js').Tool} */
const documentTool = {
  spec: {
    name: 'document',
    description: "Make a document the user keeps: a letter, notes, a plan… It opens beside the conversation, where the user edits it, and you change it with suggest. Write it in Markdown, in the user's language.",
    parameters: { type: 'object', required: ['name', 'markdown'],
      properties: { name: { type: 'string', description: "Its name, in the user's language, without an extension" }, markdown: { type: 'string', description: 'What it says' } } },
  },
  kind: 'edit',
  title: (args) => `Document ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const name = String(args?.name ?? '').trim().replace(/\.md$/i, '') || 'Document'
    const path = `documents/${ulid()}-${slug(name) || 'document'}.md`
    const now = new Date().toISOString()
    // Its first line is its title (D574): the brain's, else its name.
    const markdown = String(args?.markdown ?? '').trim(), body = /^# /.test(markdown) ? markdown : titled(markdown, name).trim()
    const text = stringifyFrontMatter({ format: 1, name, author: 'jean', created: now, changed: now }, `${body}\n`)
    await app.fs.write(`${app.projectDir}/${path}`, text)
    ctx.meta.files = [{ uri: path, name: `${name}.md`, mimeType: 'text/markdown', size: new TextEncoder().encode(text).length }]
    if (conversationOf(ctx.signal)?.path === app.current.peek()?.path) await show(path).catch(() => {})
    return `Made ${name}, at ${path}, open beside the conversation. Change it with suggest.`
  },
}

/** @type {import('../../core/loop.js').Tool} */
const suggestTool = {
  spec: {
    name: 'suggest',
    description: 'Change a document the user keeps: give its whole text as it is now, with your changes, and what each change does. Each change shows in the document for the user to accept or reject.',
    parameters: { type: 'object', required: ['document', 'markdown'],
      properties: { document: { type: 'string', description: 'Its place, as document gave it' }, markdown: { type: 'string', description: 'Its whole new text, in Markdown' },
        notes: { type: 'array', items: { type: 'string' }, description: "What you did, in a few words in the user's language, for each block you change, add or take away, in order" } } },
  },
  kind: 'edit',
  title: (args) => `Suggest changes to ${args?.document ?? ''}`,
  run: async (args, ctx) => {
    const path = String(args?.document ?? '')
    if (!/^documents\/[^/]+\.md$/.test(path) || (shown?.path !== path && !(await app.fs.exists(`${app.projectDir}/${path}`)))) throw new Error(`There is no document ${path}: make one with document.`)
    if (conversationOf(ctx.signal)?.path !== app.current.peek()?.path) return 'The user is in another task: suggest the changes once they are back in this one.'
    // One that wasn't on show opens as it is, which the brain reads before it changes it (D488).
    if (shown?.path !== path) return show(path).then((one) => `${one.name} is open beside the conversation now, unchanged. It reads:\n\n${one.body}\n\nSuggest your changes to this text.`)
    return (await show(path)).editor.suggest(String(args?.markdown ?? ''), Array.isArray(args?.notes) ? args.notes.map(String) : [])
  },
}

register({
  id: 'documents',
  tools: [documentTool, suggestTool],
  lines: [
    { name: 'document', line: 'make a document the user keeps and edits beside the conversation' },
    { name: 'suggest', line: 'change a document, each change for the user to accept or reject' },
  ],
  rules: ['Writing the user will go on changing is a document; change it with suggest.'],
  // The project's documents, the latest made first, by name and place (D488): a change to them reaches a task as a note.
  sections: async () => {
    const all = (await kept()).map(({ path, name }) => `- ${name}: ${path}`)
    return all.length ? { documents: ['suggest with one that is not open beside the conversation opens it there, unchanged, and gives you its text.', ...all.slice(0, LISTED),
      ...(all.length > LISTED ? [`- and ${all.length - LISTED} older ones`] : [])].join('\n') } : {}
  },
  slots: { modes: { at: 9, draw: () => null, notes }, head: { at: 1, draw: head }, creations: { id: 'documents', at: 1, draw: () => icons.file, kept, mention: 'document', preview: (/** @type {{ text: string }} */ item) => prose(item.text),
    make: blank, pin: amend, rename: (/** @type {Kept} */ item, /** @type {string} */ name) => amend(item, undefined, name), copy, remove }, main: page },
})
