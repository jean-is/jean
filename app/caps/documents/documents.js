// Documents you keep (D473, D474, D485): a document is a Markdown file of the project's, `documents/<ulid>-<slug>.md`,
// named once and never renamed, its name, author and times in its front matter. Jean's brain makes one with
// `document`, and it opens in the preview beside the conversation, in an editor that runs in a frame of the
// preview's kind (ui/view.js): an opaque origin under the policy of a page whose scripts are data, its modules
// (ProseMirror, marked and the editor's own) as data: addresses under an import map, Jean's display face as data
// too, since nothing reaches it from anywhere. It speaks MCP Apps (2026-01-26) with Jean, which hosts it here:
// Jean calls its `open`, `suggest` and `read`; it calls Jean's `save` after each change, written through
// core/fs.js, and tells Jean what is selected (`ui/update-model-context`), which the brain reads with the next
// message, with the document as it is now when it changed. The brain changes it with `suggest`, its whole new
// text, shown in the document as suggestions the person keeps or undoes. The theme, the room's colours and type
// and the frame's words, in Jean's language, go in with the host's context, and again as they change. What the
// frame hands back as Jean's (`jean/key`, `jean/files`): a key it leaves, pressed again on the frame, so that
// Escape and Jean's shortcuts work from it, and the files dropped on it, shared in the conversation.
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, theme, conversationOf, assistantName } from '../../ui/state.js'
import { PAGE_SANDBOX, pagePolicy } from '../../ui/csp.js'
import { encode } from '../../ui/seal.js'
import { noteRecord } from '../../core/events.js'
import { parseFrontMatter, stringifyFrontMatter, slug } from '../../core/settings.js'
import { ulid } from '../../core/ulid.js'
import { t, locale, dir, useStrings } from '../../core/i18n.js'

await useStrings('documents')

const FRAME = new URL('../../preview.html', import.meta.url).href
const VENDOR = new URL('../../vendor/', import.meta.url)
/** The editor's modules, by their names under its import map. */
const OWN = ['ui', 'markdown', 'suggest', 'slash', 'bubble', 'blocks', 'editor']
/** Its scripts run, as a page's whose scripts are data; nothing comes from the web or goes to it, whatever Settings let pages do. */
const POLICY = pagePolicy({ scripts: true, fullscreen: false, downloads: false, web: false, network: false, maps: false }, [], true)
/** The frame's words: those a number changes, by their forms. */
const WORDS = ['document', 'blocks', 'text', 'heading1', 'heading2', 'heading3', 'bullets', 'numbers', 'tasks', 'quote', 'codeBlock', 'table', 'divider', 'noMatch', 'choice', 'handle',
  'blockMenu', 'moveUp', 'moveDown', 'remove', 'format', 'bold', 'italic', 'strike', 'link', 'linkAddress', 'applyLink', 'removeLink', 'review', 'change', 'previous', 'next', 'keep',
  'undoChange', 'keepAll', 'undoAll', 'kept', 'undone', 'done']
const COUNTED = ['suggests', 'blocksSelected']
/** A number of each form a language's plurals have, to read each form with. */
const SAMPLES = [0, 1, 2, 3, 5, 11, 100, 1e6, 0.5]
/** MCP Apps' standard variables, from the room's own: the pane's colours, and the room's type. */
const VARIABLES = Object.entries({ 'color-background-primary': 'room-2', 'color-text-primary': 'ink', 'color-text-secondary': 'ink-soft', 'color-text-info': 'flame', 'color-text-danger': 'danger',
  'color-border-primary': 'line-strong', 'color-ring-primary': 'flame', 'font-sans': 'sans', 'font-mono': 'mono', 'font-display': 'display' })

/** @param {URL} url @param {string} type */
const data = async (url, type) => `data:${type};base64,${encode(new Uint8Array(await (await fetch(url)).arrayBuffer()))}`
/** @type {Promise<{ imports: Record<string, string>, css: string }> | undefined} */
let made
/** What every editor's page holds, read once: its modules, each package of ProseMirror's one module, and its style with Jean's display face. */
function parts() {
  made ??= (async () => {
    const prosemirror = await data(new URL('prosemirror/prosemirror.mjs', VENDOR), 'text/javascript')
    /** @type {Record<string, string>} */
    const imports = { marked: await data(new URL('marked.esm.js', VENDOR), 'text/javascript') }
    for (const name of OWN) {
      const text = (await (await fetch(new URL(`${name}.js`, import.meta.url))).text()).replace(/(\bfrom\s*|\bimport\s*)(["'])\.\/([\w-]+\.js)\2/g, '$1$2documents/$3$2')
      for (const [, used] of text.matchAll(/\bfrom\s*["'](prosemirror-[\w-]+)["']/g)) imports[used] = prosemirror
      imports[`documents/${name}.js`] = `data:text/javascript;base64,${encode(new TextEncoder().encode(text))}`
    }
    const sheets = [...['prosemirror', 'tables', 'gapcursor'].map((name) => new URL(`prosemirror/${name}.css`, VENDOR)), new URL('editor.css', import.meta.url)]
    const css = (await Promise.all(sheets.map(async (url) => (await fetch(url)).text()))).join('\n')
    const face = await data(new URL('../../fonts/display.woff2', import.meta.url), 'font/woff2')
    return { imports, css: `@font-face { font-family: Display; font-weight: 100 900; src: url(${face}) format('woff2'); }\n${css}` }
  })()
  return made
}

/** The host's context: light or dark, the room's colours and type, the language, and the frame's words in it. */
function context() {
  const style = getComputedStyle(document.documentElement)
  const variables = Object.fromEntries(VARIABLES.map(([name, own]) => [`--${name}`, style.getPropertyValue(`--${own}`).trim()]))
  const lang = locale.peek()
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const word = (key, values) => t(`documents.${key}`, { name: assistantName(), ...values })
  const rules = new Intl.PluralRules(lang)
  const forms = (/** @type {string} */ key) => Object.fromEntries(rules.resolvedOptions().pluralCategories.map((form) => [form, word(key, { count: SAMPLES.find((n) => rules.select(n) === form) ?? 0 })]))
  const strings = Object.fromEntries([...WORDS.map((key) => [key, word(key)]), ...COUNTED.map((key) => [key, forms(key)])])
  const shade = `color-mix(in oklab, ${variables['--color-text-primary']} 7%, transparent)`
  return { theme: theme.peek(), locale: lang, displayMode: 'inline', platform: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'web',
    styles: { variables: { ...variables, '--color-background-secondary': shade, '--border-radius-md': '0.5rem' } }, 'jean/strings': strings }
}

/**
 * An editor open, in its frame: the document it shows, its front matter and text as last saved, what the
 * person selected, and how it is reached.
 * @typedef {{ frame: HTMLIFrameElement, path: string, name: string, head: Record<string, any>, body: string, context: string, ready: Promise<void>,
 *   send: (message: object) => void, call: (name: string, args: object) => Promise<any> }} Editor
 */
/** @type {Set<Editor>} */
const editors = new Set()
/** The document on show in the preview, which the brain hears of. @type {Editor | null} */
let shown = null

/**
 * A document's editor, for the preview (ui/preview.js): its frame, which reads the file, and is let go with
 * the view. @param {{ uri: string, name: string }} file @param {(() => void)[]} holds
 */
export async function editor(file, holds) {
  const path = file.uri
  const { data: head, body } = parseFrontMatter((await app.fs.read(`${app.projectDir}/${path}`)) ?? '')
  const frame = /** @type {HTMLIFrameElement} */ (Object.assign(document.createElement('iframe'), { className: 'view-frame is-document', title: String(head.name ?? file.name) }))
  frame.setAttribute('sandbox', PAGE_SANDBOX)
  frame.setAttribute('allow', 'clipboard-write *')
  let id = 0
  /** @type {Map<number, (message: any) => void>} */
  const waiting = new Map()
  /** @type {() => void} */
  let started = () => {}
  /** @param {string} name @param {object} args @returns {Promise<any>} */
  const request = (name, args) => new Promise((resolve, reject) => {
    waiting.set(++id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)))
    one.send({ id, method: 'tools/call', params: { name, arguments: args } })
  })
  /** @type {Editor} */
  const one = {
    frame, path, name: String(head.name ?? file.name), head, body, context: '', ready: new Promise((resolve) => { started = resolve }),
    send: (message) => frame.contentWindow?.postMessage({ jsonrpc: '2.0', ...message }, '*'),
    call: (name, args) => one.ready.then(() => request(name, args)),
  }
  /** @param {any} message */
  const heard = async (message) => {
    if (message.method === undefined) return waiting.get(message.id)?.(message)
    /** @param {any} result */
    const answer = (result) => message.id !== undefined && one.send({ id: message.id, result })
    if (message.method === 'ui/initialize') answer({ protocolVersion: '2026-01-26', hostInfo: { name: 'jean', version: '1.0.0' }, hostContext: context(),
      hostCapabilities: { openLinks: {}, serverTools: {}, updateModelContext: { text: {}, structuredContent: {} } } })
    else if (message.method === 'ui/notifications/initialized') {
      await request('open', { name: one.name, markdown: one.body }).catch(() => {})
      started()
    } else if (message.method === 'tools/call' && message.params?.name === 'save') {
      const text = String(message.params.arguments?.markdown ?? '')
      if (text !== one.body) {
        one.body = text
        one.head = { ...one.head, changed: new Date().toISOString() }
        await app.fs.write(`${app.projectDir}/${path}`, stringifyFrontMatter(one.head, text))
      }
      answer({ content: [{ type: 'text', text: 'Saved.' }] })
    } else if (message.method === 'ui/update-model-context') {
      one.context = (message.params?.content ?? []).map((/** @type {any} */ part) => String(part?.text ?? '')).join('\n')
      answer({})
    } else if (message.method === 'ui/open-link') {
      const url = String(message.params?.url ?? '')
      if (/^(https?|mailto):/i.test(url)) open(url, '_blank', 'noopener,noreferrer')
      answer({})
    } else if (message.method === 'jean/key') {
      // Escape, or a key with ⌘ or Ctrl: nothing else of what is typed there is Jean's.
      const { key, code, metaKey, ctrlKey, shiftKey, altKey } = message.params ?? {}
      if (key === 'Escape' || metaKey || ctrlKey) frame.dispatchEvent(new KeyboardEvent('keydown', { key: String(key), code: String(code), metaKey: Boolean(metaKey), ctrlKey: Boolean(ctrlKey), shiftKey: Boolean(shiftKey), altKey: Boolean(altKey), bubbles: true, cancelable: true }))
    } else if (message.method === 'jean/files') {
      const files = /** @type {unknown[]} */ (message.params?.files ?? []).filter((item) => item instanceof File)
      if (files.length) (await import('../../ui/composer.js')).attachFiles(/** @type {File[]} */ (files))
    } else if (message.id !== undefined) one.send({ id: message.id, error: { code: -32601, message: `No method ${message.method}` } })
  }
  /** Its window, which stays the same once the frame is gone, when its last save comes. @type {Window | null} */
  let own = null
  /** @param {MessageEvent} event */
  const listen = ({ source, data: message }) => { if (source && source === own && message?.jsonrpc === '2.0') heard(message) }
  addEventListener('message', listen)
  editors.add(one)
  shown = one
  holds.push(() => {
    setTimeout(() => removeEventListener('message', listen), 2000)
    editors.delete(one)
    if (shown === one) shown = null
  })
  frame.addEventListener('load', async () => {
    own = frame.contentWindow
    const { imports, css } = await parts()
    const lang = locale.peek()
    const page = /* html */ `<html lang="${lang}" dir="${dir(lang)}" style="color-scheme: ${theme.peek()}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css.replace(/<\//g, '<\\/')}</style><script type="importmap">${JSON.stringify({ imports })}</script><script type="module">import 'documents/editor.js'</script><body></body>`
    frame.contentWindow?.postMessage({ page, policy: POLICY }, '*')
  }, { once: true })
  frame.src = FRAME
  return frame
}

// Each change of the room reaches the editors open: light or dark, its look's colours and type, its language.
effect(() => {
  void [theme.value, app.look.value, locale.value]
  requestAnimationFrame(() => { for (const one of editors) one.ready.then(() => one.send({ method: 'ui/notifications/host-context-changed', params: context() })) })
})

/** The document at a place in the project, in the preview, once its editor has opened it. @param {string} path */
async function show(path) {
  if (shown?.path === path) return shown.ready.then(() => /** @type {Editor} */ (shown))
  ;(await import('../../ui/preview.js')).preview({ uri: path, name: (await metaOf(path))?.name ?? '', mimeType: 'text/markdown' })
  for (let wait = 0; wait < 100 && shown?.path !== path; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  if (!shown || shown.path !== path) throw new Error('The document could not be opened.')
  await shown.ready
  return shown
}

/** What the preview's address names: a document by its name, none when there is no such document. @param {string} path */
export async function metaOf(path) {
  const text = /^documents\/[^/]+\.md$/.test(path) && await app.fs.read(`${app.projectDir}/${path}`)
  return text ? { name: `${parseFrontMatter(text).data.name ?? 'Document'}.md`, mimeType: 'text/markdown' } : null
}

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
    const text = stringifyFrontMatter({ format: 1, name, author: 'jean', created: now, changed: now }, `${String(args?.markdown ?? '').replace(/\n*$/, '')}\n`)
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
    description: 'Change a document the user keeps: give its whole text as it is now, with your changes. Each change shows in the document for the user to keep or undo.',
    parameters: { type: 'object', required: ['document', 'markdown'],
      properties: { document: { type: 'string', description: 'Its place, as document gave it' }, markdown: { type: 'string', description: 'Its whole new text, in Markdown' } } },
  },
  kind: 'edit',
  title: (args) => `Suggest changes to ${args?.document ?? ''}`,
  run: async (args, ctx) => {
    const path = String(args?.document ?? '')
    if (!/^documents\/[^/]+\.md$/.test(path) || !(await app.fs.exists(`${app.projectDir}/${path}`))) throw new Error(`There is no document ${path}: make one with document.`)
    if (conversationOf(ctx.signal)?.path !== app.current.peek()?.path) return 'The user is in another task: suggest the changes once they are back in this one.'
    const result = await (await show(path)).call('suggest', { markdown: String(args?.markdown ?? '') })
    return String(result?.content?.[0]?.text ?? '')
  },
}

register({
  id: 'documents',
  tools: [documentTool, suggestTool],
  lines: [
    { name: 'document', line: 'make a document the user keeps and edits beside the conversation' },
    { name: 'suggest', line: 'change a document, each change for the user to keep or undo' },
  ],
  rules: ['Writing the user will go on changing is a document; change it with suggest.'],
  slots: { modes: { at: 9, draw: () => null, notes } },
})
