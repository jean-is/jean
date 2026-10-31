// A look on paper and on screen (D601, D663, D664): what Word files and prints wear of the design system, the organisation's kit and
// the project's (ui/kit.js), an answer's as a document's: words in its ink and faces, headings and links in its colour, and its logo in its
// corner, in place of Jean's mark on a print. On white paper always, its colours deepened to read there: a page's own colour stays in Word's
// window and leaves a printer's ink alone. A document's or a collection's pane shows it too, on its own paper by day and by night, as a style
// sheet over the room's colours. Save, at the top of either's pane, takes it out as what it is, a Markdown file or a workbook; as Word, a
// document's pictures and what it draws inside; or printed alone, as it reads and without what Jean suggests. A collection inside either goes
// as its rows, as its view keeps them, its view being made for changing it. Save's menu ends with the way to the design system's page.
import { html, nothing, render } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app, theme } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { act } from '../../ui/acts.js'
import { icons } from '../../ui/menu-icons.js'
import { onPaper, onScreen, kits, projectKit } from '../../ui/kit.js'
import { contrast, mix } from '../../ui/colour.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, useStrings } from '../../core/i18n.js'

// The cards' style sheet and Things Jean made's own words come with them, not with the first screen (D126).
await Promise.all([useStrings('made'), styleSheet(new URL('made.css', import.meta.url))])

/** Each voice's faces on paper, the device's own as a deck's are, its headings' then its words', where calm keeps the room's. */
const FACES = /** @type {Record<string, string[]>} */ ({ elegant: ['ui-serif, "Iowan Old Style", Georgia, serif'], bold: ['"Avenir Next Condensed", "Arial Narrow", sans-serif'],
  friendly: ['ui-rounded, "SF Pro Rounded", "Trebuchet MS", sans-serif', 'ui-rounded, "SF Pro Rounded", "Trebuchet MS", sans-serif'] })
/** The user's own faces, as a deck writes them, then the room's, for a device that has none of them, by value: the sheet sets that variable. @param {string[]} faces @param {string} under */
const stack = (faces, under) => `${faces.map((face) => (/^[\w-]+$/.test(face) ? face : `"${String(face).replace(/["\\\s]+/g, ' ')}"`)).join(', ')}, ${getComputedStyle(document.documentElement).getPropertyValue(under)}`
/** A look's faces, its headings' then its words'. @param {{ fonts?: { heading: string[], body: string[] }, voice?: string }} look */
export const facesOf = ({ fonts, voice }) => (fonts ? [stack(fonts.heading, '--display'), stack(fonts.body, '--sans')] : FACES[voice ?? ''] ?? [])
/** @param {{ logo?: string, logoAt?: string }} look */
const logoOf = ({ logo, logoAt = 'top-end' }) => Object.assign(new Image(), { src: logo, alt: '', className: `paper-logo ${logoAt}` })
/** Under `root`, a look's colours and faces, the room's variables among them, and `also`. @param {string} root @param {Awaited<ReturnType<typeof onPaper>> & {}} look @param {string} [also] */
const worn = (root, look, also = '') => ((colour, [head, body]) => `${root} { ${look.ink ? `--ink: ${look.ink}; color: ${look.ink};` : ''}${look.muted ? `--ink-soft: ${look.muted};` : ''}${colour ? `--flame: ${colour};` : ''}${body ? `--sans: ${body}; font-family: ${body};` : ''}${head ? `--display: ${head};` : ''}${also} } ${root} :is(h1, h2, h3, h4, h5, h6) { ${colour ? `color: ${colour};` : ''}${head ? `font-family: ${head};` : ''} }${colour ? ` ${root} th { border-block-end-color: ${colour}; }` : ''}`)(look.colour, facesOf(look))
/** A document's or a collection's pane, and what shows in it. */
const PANE = '.view:has(> :is(.document, app-table))'

/** On screen, what `worn` leaves: its paper, lines from its words, its pale fill, a collection's heads, a document's logo in its corner, a centimetre tall. @param {NonNullable<Awaited<ReturnType<typeof onScreen>>>} look */
async function inPane(look) {
  const { paper, ink, ground, colour, soft, logo, logoAt = 'top-end', plate } = look, image = Object.assign(new Image(), { src: logo ?? '' }), foot = logoAt.startsWith('bottom')
  if (logo) await image.decode().catch(() => {})
  return worn(PANE, look, `${paper ? `--room: ${paper}; --room-2: ${paper}; background: ${paper}; color-scheme: ${contrast('#000000', paper) > contrast('#ffffff', paper) ? 'light' : 'dark'};` : ''}${ink ? `--ink-faint: ${look.muted}; --line: ${mix(ink, ground, 0.82)}; --line-strong: ${mix(ink, ground, 0.65)};` : ''}`)
    + `${soft ? ` ${PANE} .prose pre { background: ${soft}; }` : ''}${colour ? ` ${PANE} .table-grid th { color: ${colour}; }` : ''}`
    + (logo ? ` ${PANE} .doc-wrap::${foot ? 'after' : 'before'} { content: ''; flex: none; block-size: 1cm; inline-size: min(4cm, ${(image.naturalHeight && image.naturalWidth / image.naturalHeight) || 4}cm); margin-block: ${foot ? '1rem 0' : '0 1rem'}; ${logoAt.endsWith('end') ? 'margin-inline-start: auto;' : ''} background: url("${logo}") center / contain no-repeat; ${plate ? 'background-color: #fff; border-radius: 0.1rem; box-shadow: 0 0 0 0.25rem #fff;' : ''} }` : '')
}

let paper = /** @type {CSSStyleSheet | null} */ (null)
/** Whatever prints, by Print or the browser's own, and a document's or a collection's pane, in the look here: `.prose`, Jean's mark. */
export async function dress() {
  const [look, shown] = await Promise.all([onPaper(), onScreen()])
  if (!look && !shown && !paper) return look
  const mark = document.querySelector('.print-mark')
  mark?.querySelector('.paper-logo')?.remove()
  if (look?.logo) mark?.prepend(logoOf(look))
  if (!paper) document.adoptedStyleSheets = [...document.adoptedStyleSheets, (paper = new CSSStyleSheet())]
  paper.replaceSync(`${look ? `@media print { ${worn('.prose', look)} }` : ''}${shown ? ` @media screen { ${await inPane(shown)} }` : ''}`)
  return look
}
// Again for the project shown, by day or by night, and each kit kept.
effect(() => { void app.project.value; void theme.value; void kits.value; void dress() })

/**
 * A picture as Word takes it, a PNG or a JPEG as it is, another kind drawn as a PNG, four times as fine as it shows if it's the logo.
 * @param {Blob | string} picture a file's, or a logo's data: address @param {(width: number, height: number) => number[]} [fit] the size it shows at
 * @returns {Promise<import('./formats.js').Picture>}
 */
async function forWord(picture, fit = (width, height) => [width, height]) {
  const logo = typeof picture === 'string', image = Object.assign(new Image(), { src: logo ? picture : URL.createObjectURL(picture) }), kept = !logo && /^image\/(png|jpeg)$/.exec(picture.type)?.[1]
  await image.decode()
  if (!logo) URL.revokeObjectURL(image.src)
  const [width, height] = fit(image.naturalWidth || 256, image.naturalHeight || 256), fine = logo ? 4 : 1
  if (!logo && kept) return { bytes: new Uint8Array(await picture.arrayBuffer()), type: /** @type {'png' | 'jpeg'} */ (kept), width, height }
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(width * fine), height: Math.ceil(height * fine) })
  ;/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = /** @type {Blob} */ (await new Promise((resolve) => canvas.toBlob(/** @type {BlobCallback} */ (resolve), 'image/png')))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png', width, height }
}

/** The look here for a Word file: its logo at most a centimetre tall and four wide. */
export async function wordLook() {
  const look = await onPaper()
  return look && { ...look, logo: look.logo ? await forWord(look.logo, (width, height) => [width, height].map((side) => side * Math.min(151 / width, 38 / height))).catch(() => undefined) : undefined }
}

/** A picture of the project's, as a document names one. */
const KEPT = /!\[[^\]]*\]\((\.\.\/files\/sha256-[\da-f]{64}\.(\w+))\)/g
/** What a Word file holds as pictures, by what its Markdown says of each: the project's it names, and what's drawn on the page, by its code. @param {string} source @param {Element} [page] */
const picturesIn = async (source, page) => new Map(/** @type {[string, import('./formats.js').Picture][]} */ ((await Promise.all(/** @type {Promise<any[]>[]} */ ([
  ...[...source.matchAll(KEPT)].map(async ([, at, kind]) => [at, await forWord(new Blob([/** @type {BlobPart} */ (await app.fs.readBytes(`${app.projectDir}/${at.slice(3)}`))], { type: `image/${kind.replace('jpg', 'jpeg')}` }))]),
  // Drawn twice as fine as they show.
  ...[...page?.querySelectorAll('.drawn-form :is(app-chart, app-score, app-slides, app-latex, app-diagram)') ?? []].map(async (one) => [one.getAttribute('source'), await forWord(await /** @type {any} */ (one).picture(), (width, height) => [width / 2, height / 2])]),
]).map((entry) => entry.catch((error) => console.warn('Word', error) ?? [])))).filter((entry) => entry.length)))

/** A collection in a document's Markdown, each as its rows under its name, in Word's Markdown. @param {string} source */
async function withRows(source) {
  let words = source
  for (const [block, folder] of source.matchAll(/^```table\n(collections\/[^\n]+)\n```$/gm)) {
    const grid = await (await import('../tables/tables.js')).gridIn(folder), line = (/** @type {string[]} */ cells) => `| ${cells.map((cell) => cell.replace(/[\\`*_[\]<>|~$&]/g, '\\$&').replace(/\s*\n\s*/g, ' ')).join(' | ')} |`
    if (grid) words = words.replace(block, () => [`### ${grid.name}`, '', line(grid.rows[0]), `| ${grid.right.map((right) => (right ? '---:' : '---')).join(' | ')} |`, ...grid.rows.slice(1).map(line)].join('\n'))
  }
  return words
}

/**
 * Markdown as a Word file, named by its title, on the paper of the user's country, a reference to a creation (D575) by its name, code left as it is.
 * @param {string} source @param {string} title @param {{ made?: boolean, page?: Element }} [options] whether a trained model made it; the page it is drawn on
 */
export async function downloadWord(source, title, { made, page } = {}) {
  const { makeFile, paperFor } = await import('./formats.js')
  const words = (await withRows(source)).replace(/^(`{3,}|~{3,})[^]*?^\1|`[^`\n]*`|\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/gm, (all, _, place, name) => (place ? name ?? place : all))
  const { name, mimeType, bytes } = await makeFile(`${title}.docx`, words, { paper: paperFor(navigator.language), look: await wordLook(), pictures: await picturesIn(source, page), made })
  save(new Blob([/** @type {BlobPart} */ (bytes)], { type: mimeType }), name)
}

/** A collection as a page says it, under its name, for a print. @param {string} folder */
async function rowsOf(folder) {
  const grid = await (await import('../tables/tables.js')).gridIn(folder), box = document.createElement('div')
  const cells = (/** @type {string[]} */ row, /** @type {(cell: string, right: boolean) => unknown} */ draw) => row.map((cell, i) => draw(cell, Boolean(grid?.right[i])))
  if (grid) render(html`<h3 dir="auto">${grid.name}</h3><table><thead><tr>${cells(grid.rows[0], (cell, right) => html`<th dir="auto" class=${right ? 'paper-end' : nothing}>${cell}</th>`)}</tr></thead>
    <tbody>${grid.rows.slice(1).map((row) => html`<tr>${cells(row, (cell, right) => html`<td dir="auto" class=${right ? 'paper-end' : nothing}>${cell}</td>`)}</tr>`)}</tbody></table>`, box)
  return box
}

/**
 * A document printed alone, what it draws drawn again out of sight at a page's width, a few seconds at most, then gone: as it reads, what
 * Jean suggests left out and a block being written drawn; its logo once, at its start, or at its end for a corner at the foot. Within a Word file's
 * margins, on whichever paper the print dialog holds, the words filling its width and a chart scaled to it in proportion.
 * @param {HTMLElement} dom its editor's
 */
export async function printPage(dom) {
  const look = await dress(), holder = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'document paper-print' })), page = /** @type {HTMLElement} */ (dom.cloneNode(true))
  for (const one of page.querySelectorAll('.suggest')) one.remove()
  for (const one of page.querySelectorAll('.suggest-old, .is-editing')) one.classList.remove('suggest-old', 'is-editing')
  for (const one of page.querySelectorAll('app-table')) one.replaceWith(await rowsOf(one.getAttribute('folder') ?? ''))
  // What draws itself does so again as it joins the page, beside its copy if that stayed.
  for (const one of page.querySelectorAll('*')) if (one.localName.startsWith('app-')) one.replaceChildren()
  page.removeAttribute('id'), page.removeAttribute('role'), page.setAttribute('contenteditable', 'false')
  holder.append(page)
  if (look?.logo) holder[look.logoAt?.startsWith('bottom') ? 'append' : 'prepend'](logoOf(look))
  const margins = new CSSStyleSheet()
  margins.replaceSync('@page { margin: 2.54cm }')
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, margins]
  document.documentElement.classList.add('is-printing-paper')
  const drawing = () => [...holder.querySelectorAll('app-shared, app-chart, app-score, app-diagram, app-latex')].some((one) => !one.querySelector('img, svg, canvas, table, .latex-page')) || [...holder.querySelectorAll('img')].some((one) => !one.complete)
  for (let wait = 0; wait < 60 && drawing(); wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  await document.fonts.ready
  for (const chart of holder.querySelectorAll('.chart')) /** @type {HTMLElement} */ (chart).style.aspectRatio = `${/** @type {HTMLElement} */ (chart).offsetWidth} / ${/** @type {HTMLElement} */ (chart).offsetHeight}`
  addEventListener('afterprint', () => { document.documentElement.classList.remove('is-printing-paper'); document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== margins); holder.remove() }, { once: true })
  print()
}

/**
 * Save and its menu, at the top of a pane, the design system's page last. @param {{ uri: string, name: string, title: string }} file @param {string} name
 * @param {(told: (format: string) => void) => [unknown, string, () => Promise<unknown>][][]} groups its choices: each one's glyph, words and what it does
 */
function menu(file, name, groups) {
  const id = `save-${file.uri}`, told = (/** @type {string} */ format) => act('file.save', { task: app.current.peek()?.path, path: file.uri, format })
  return html`<button class="icon-button" popovertarget=${id} aria-label=${t('made.save', { name })}>${icons.download}</button>
    <div id=${id} class="menu answer-menu" popover>${[...groups(told), [toKit()]].map((group, i) => html`${i ? html`<hr>` : nothing}${group.map(([glyph, label, run]) => html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${run}>${glyph}<span dir="auto">${label}</span></button>`)}`)}</div>`
}
/** The file itself, as the pane's own Save gave it. @param {{ uri: string, name: string, title: string }} file @returns {[unknown, string, () => Promise<unknown>]} */
const asItIs = (file) => [icons.download, t('made.save', { name: file.name }), () => import('../../ui/preview.js').then((preview) => preview.download(file))]
/** The design system's page: the project's where it has a look of its own, which goes over the person's, so that a change shows in the pane. @returns {[unknown, string, () => Promise<unknown>]} */
const toKit = () => [icons.palette, t('made.kit'), async () => (await import('../../ui/dialogs.js')).openSettings(app.project.peek().data.default !== true && await projectKit() ? 'appearance/kit-project' : 'appearance/kit')]

/** A document's. @param {{ uri: string, name: string, title: string }} file @param {{ name: string, head: Record<string, any>, editor: { markdown: () => string, view: { dom: HTMLElement } } }} one the document on show */
export const saveMenu = (file, { name, head, editor }) => menu(file, name, (told) => [[[icons.file, t('made.docxTitle'), () => downloadWord(editor.markdown().trim() || `# ${name}`, name, { made: head.author === 'jean', page: editor.view.dom }).then(() => told('docx'))], asItIs(file)],
  [[icons.print, t('made.print'), () => printPage(editor.view.dom).then(() => told('print'))]]])

/** A collection's. @param {{ uri: string, name: string, title: string }} file */
export const collectionMenu = (file) => menu(file, file.title, (told) => [[asItIs({ ...file, name: `${file.title}.xlsx` })], [[icons.print, t('made.print'), async () => {
  const page = Object.assign(document.createElement('div'), { className: 'doc prose' })
  page.append(await rowsOf(file.uri))
  await printPage(page).then(() => told('print'))
}]]])
