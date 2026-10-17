// A task saved as a web page (D305): the conversation's own file, its JSONL as it is, in a data
// block, the pictures it made beside it, and the few lines that draw its requests and answers when
// the page is opened in a browser. Where the render package can come, it then draws the task as Jean
// does (ui/reader.js), every module it loads checked by its hash; where it can't, or none is named,
// those lines stay.
import { save } from './save.js'
import { t, locale, dir } from '../core/i18n.js'
import { callsIn, filesMade } from '../core/events.js'

const STYLE = ':root>body{max-width:46rem;margin:auto;padding:1rem}:root{color-scheme:light dark;font:1rem/1.5 system-ui,sans-serif}h1{font-size:1.5rem}' +
  'section{margin-block:1.5rem}section p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}section time{display:block;font-size:.8rem;opacity:.75}' +
  '.you{width:fit-content;max-width:80%;margin-inline-start:auto;padding:.75rem 1rem;border-radius:1rem;background:#8882}.made{display:block;max-width:100%;max-height:28rem;margin-block:.5rem;border-radius:.9rem}'

/**
 * Draws the requests and answers in the saved page, each as it was written, with when it was said:
 * an answer's steps one after another, without the follow-ups it suggested, a shared file by its
 * name, and the pictures it made, once each. It runs there, so it uses nothing of Jean's.
 */
function draw() {
  const pictures = JSON.parse(document.getElementById('pictures')?.textContent || '{}')
  const said = []
  const shown = new Set()
  let block, previous
  for (const line of (document.querySelector('[type="application/jsonl"]')?.textContent ?? '').split('\n')) {
    try {
      const { at, step = 0, update: { sessionUpdate, content, rawInput, _meta } } = JSON.parse(line)
      const you = sessionUpdate === 'user_message_chunk'
      const made = [_meta?.picture, _meta?.file, ..._meta?.files ?? []].filter((file) => pictures[file?.uri] && !shown.has(file.uri))
      if (you || sessionUpdate === 'agent_message_chunk' || made.length) {
        // A message's files come before its words, which end it.
        if (!block || block.you !== you || (you && previous !== 'resource_link')) said.push((block = { you, at, step, text: '', made: new Array() }))
        if (step !== block.step) block.text += '\n\n'
        block.step = step
        block.text += content?.text ?? (content?.name ? `📎 ${content.name}\n` : '')
        for (const file of made) shown.add(file.uri), block.made.push({ src: pictures[file.uri], alt: rawInput?.description ?? file.name })
      }
      previous = content?.type ?? sessionUpdate
    } catch {}
  }
  const when = new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' })
  for (const { you, at, text, made } of said) {
    const section = document.body.appendChild(document.createElement('section'))
    const words = section.appendChild(document.createElement('p'))
    for (const picture of made) section.appendChild(Object.assign(document.createElement('img'), picture, { className: 'made' }))
    const time = section.appendChild(document.createElement('time'))
    section.className = you ? 'you' : ''
    words.dir = 'auto'
    words.textContent = you ? text : text.replace(/<suggestions>[\s\S]*/, '').trim()
    time.dateTime = at
    time.textContent = when.format(new Date(at))
  }
}

/**
 * How the page draws itself as Jean does: the render package's address, its entry, an import map
 * that finds Jean's modules there with every one's hash, what the page was saved with, and the map
 * service, when maps were allowed.
 * @typedef {{ base: string, entry: string, imports: Record<string, string>, integrity: Record<string, string>, settings: Record<string, unknown>, sites: string[] }} Reader
 */

/** What a copy draws itself with, unless policy or Settings name another address (`urls.render`), none when '': the render package on jsDelivr, at the version that saved it. */
const RENDER = 'https://cdn.jsdelivr.net/npm/@codename/jean-render@{version}/'
/** Where its scores get their instruments (D338), unless policy or Settings name another address (`urls.sounds`): the sounds package on jsDelivr, at this Jean's version of it. */
const SOUNDS = 'https://cdn.jsdelivr.net/npm/@codename/jean-sounds@{version}/'

/** What a policy allows by its hash. @param {string} text */
const hashOf = async (text) => `'sha256-${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))))}'`

/** Text as HTML. @param {string} text */
const escape = (text) => text.replace(/[&<>"]/g, (mark) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[mark]};`)

/** JSON in a script block, which nothing in it can end. @param {unknown} value */
const block = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')

/**
 * Without the package, its own style and lines alone, by their hashes, and its pictures. With it, inline scripts too,
 * which the relay of a page in an answer is, and that page's own (a hash would turn that keyword off,
 * as in preview.html), and its blobs and data, all from the package and nowhere else, maps from their
 * service, a score's instruments from theirs, decoded in WebAssembly (D338); never a form or another base address.
 * @param {string} drawing @param {Reader | null} reader
 */
async function policyOf(drawing, reader) {
  if (!reader) return `default-src 'none'; img-src data:; style-src ${await hashOf(STYLE)}; script-src ${await hashOf(drawing)}`
  const { base, sites } = reader
  return [`default-src 'none'`, `script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob: ${base}`, `style-src 'unsafe-inline' ${base}`, `img-src data: blob: ${base}`,
    `font-src data: ${base}`, `connect-src ${[base, ...sites].join(' ')}`, 'worker-src blob:', "base-uri 'none'", "form-action 'none'"].join('; ')
}

/**
 * The page: a conversation's file, every `<` in it written `\u003c`, which leaves each line the same
 * JSON and the block nothing to end it with, under the task's name, in a language, the pictures it
 * made by their addresses in the project, then the render package when there is one.
 * @param {string} file the conversation's JSONL @param {string} title @param {string} lang
 * @param {{ reader?: Reader | null, pictures?: Record<string, string> }} [more] pictures: `data:` addresses
 */
export async function pageOf(file, title, lang, { reader = null, pictures = {} } = {}) {
  const drawing = `(${draw})()`
  const name = escape(title)
  return `<!doctype html>
<html lang="${lang}" dir="${dir(lang)}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escape(await policyOf(drawing, reader))}">
<title>${name}</title>
<style>${STYLE}</style>
<h1 dir="auto">${name}</h1>
<script type="application/jsonl">
${file.replaceAll('<', '\\u003c')}</script>
${Object.keys(pictures).length ? `<script type="application/json" id="pictures">${block(pictures)}</script>\n` : ''}<script>${drawing}</script>
${reader ? `<script type="application/json" id="settings">${block(reader.settings)}</script>
<script type="importmap">${block({ imports: reader.imports, integrity: reader.integrity })}</script>
<script type="module" src="${escape(reader.entry)}" integrity="${reader.integrity[reader.entry]}" crossorigin="anonymous"></script>
` : ''}`
}

/**
 * What a page needs to draw itself with the render package, wherever that package is: its listing in
 * capabilities.json, paths relative to it; Jean's own import map; what it was saved with; the version
 * of the instruments a score plays (D338), and whether maps were allowed.
 * @typedef {{ render: { version: string, entry: string, files: string[], integrity: Record<string, string>, map: Record<string, string> }, imports: Record<string, string>, settings: Record<string, unknown>, sounds?: string, maps?: boolean }} Drawing
 */

/**
 * The reader at a render package's address, for a drawing, with a score's instruments and the map
 * service's styles where they are allowed. @param {string} base @param {Drawing} drawing
 * @param {{ instruments?: string | null, styles?: Record<string, string> | null }} [where] @returns {Reader}
 */
export function readerAt(base, { render, imports, settings }, { instruments = null, styles = null } = {}) {
  /** @param {string} path */
  const at = (path) => new URL(path, base).href
  return {
    base, entry: at(render.entry),
    imports: Object.fromEntries([...Object.entries(imports).map(([name, path]) => [name, at(path)]), ...Object.entries(render.map).map(([path, standIn]) => [at(path), at(standIn)])]),
    integrity: Object.fromEntries(render.files.map((path) => [at(path), render.integrity[path]])),
    settings: { ...settings, ...(styles && { mapStyles: styles }), ...(instruments && { urls: { sounds: instruments } }) },
    sites: [...(styles ? Object.values(styles).map((address) => new URL(address).origin) : []), ...(instruments ? [instruments] : [])],
  }
}

/**
 * This Jean's drawing (D305), from capabilities.json, which lists the render package's modules and
 * their hashes, and the map service's styles when maps are allowed; null when this Jean lists none.
 * @returns {Promise<{ drawing: Drawing, styles: Record<string, string> | null } | null>}
 */
export async function drawingOf() {
  const [{ app, effective }, { declared }, { pageRights, mapStyles }] = await Promise.all([import('./state.js'), import('./markdown.js'), import('./csp.js')])
  const [{ render }, sounds] = await Promise.all(['../capabilities.json', '../vendor/sounds/package.json'].map((path) => fetch(new URL(path, import.meta.url)).then((response) => response.json()).catch(() => ({}))))
  if (!render) return null
  const { settings } = effective.peek()
  const { allows } = pageRights(settings, app.policy)
  const styles = allows.maps ? mapStyles(/** @type {any} */ (settings), app.policy) : null
  const imports = JSON.parse(document.querySelector('script[type="importmap"]')?.textContent ?? '{}').imports ?? {}
  // Its pages offline, as Jean's are unless Settings say otherwise, and maps as they were.
  return { drawing: { render, imports, settings: { look: app.look.peek(), kinds: [...declared.peek()], pages: { ...allows, web: false, network: false } }, sounds: sounds.version, maps: Boolean(styles) }, styles }
}

/**
 * The render package for this Jean (D305), at the address Settings or policy give it; null when they
 * give none, or this Jean lists none.
 * @returns {Promise<Reader | null>}
 */
async function readerOf() {
  const [found, { app, effective }] = await Promise.all([drawingOf(), import('./state.js')])
  if (!found) return null
  const { drawing, styles } = found
  const urls = /** @type {Record<string, string>} */ (effective.peek().settings.urls ?? {})
  const base = String(app.policy.urls?.render ?? urls.render ?? RENDER).replace('{version}', drawing.render.version)
  const instruments = drawing.sounds && String(app.policy.urls?.sounds ?? urls.sounds ?? SOUNDS).replace('{version}', drawing.sounds)
  return base ? readerAt(base, drawing, { instruments, styles }) : null
}

/** A file's bytes as a `data:` address. @param {Uint8Array} bytes @param {string} type @returns {Promise<string>} */
const dataOf = (bytes, type) => new Promise((resolve, reject) => {
  const reader = Object.assign(new FileReader(), { onload: () => resolve(String(reader.result)), onerror: reject })
  reader.readAsDataURL(new Blob([/** @type {BlobPart} */ (bytes)], { type }))
})

/**
 * The pictures a task made (D251), and those its brain or its computer wrote, each as it was kept in
 * the project, by its address there: in the page, they show without the project.
 * @param {import('../core/types.js').FS} fs @param {string} path the conversation's @param {string} file
 */
export async function picturesOf(fs, path, file) {
  const project = path.slice(0, path.lastIndexOf('/conversations/'))
  const records = file.split('\n').flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
  const made = filesMade(callsIn(records)).filter((one) => one.mimeType.startsWith('image/'))
  const read = await Promise.all(made.map(async ({ uri, mimeType }) => {
    const bytes = await fs.readBytes(`${project}/${uri}`)
    return bytes ? [[uri, await dataOf(bytes, mimeType)]] : []
  }))
  return Object.fromEntries(read.flat())
}

/**
 * Saves a task as a web page named after it, in the language Jean speaks now, from its ⋮ menu.
 * @param {import('../core/types.js').FS} fs @param {{ path: string, title: string }} task
 */
export async function saveTask(fs, { path, title }) {
  const file = await fs.read(path)
  const name = title || t('conversation.untitled')
  if (file !== null) save(new Blob([await pageOf(file, name, locale.value, { reader: await readerOf(), pictures: await picturesOf(fs, path, file) })], { type: 'text/html' }), `${name}.html`)
}
