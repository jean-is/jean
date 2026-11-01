// How a document and a collection leave Jean (D683), through the pane's one button (ui/out.js): as a link, through the system's sheet, copied
// laid out; a document as Word, with its pictures and what it draws inside, or its own Markdown; a collection as a workbook or as CSV; or
// printed alone, in the look here (./paper.js). And how an answer is copied, the same way a document is. Read as a pane first shows one, or
// with Things Jean made.
import { render } from 'lit-html'
import { app, notify } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { act } from '../../ui/acts.js'
import { markdown } from '../../ui/markdown.js'
import { icons } from '../../ui/menu-icons.js'
import { t } from '../../core/i18n.js'
import { downloadWord, printDrawn, printPage, rowsOf, withRows } from './paper.js'

/** @typedef {{ uri: string, name: string, title: string }} File */

/**
 * What a document can do: as it is on show when pressed, a collection inside it by its rows. @param {File} file @param {{ name: string, head: Record<string, any>, editor: { markdown: () => string, view: { dom: HTMLElement } } }} one
 * @param {Element} pane @returns {import('../../ui/out.js').Ways}
 */
export const documentWays = (file, { name, head, editor }, pane) => ({
  share: async () => ({ text: await withRows(editor.markdown()) }), send: { make: async () => ({ title: name, text: editor.markdown() }) },
  copy: { id: 'copy', about: t('made.out.copyText'), run: () => copyRich(editor.markdown(), pane.querySelector('.view')) },
  files: [{ id: 'docx', glyph: icons.file, label: t('made.out.word'), about: t('made.out.wordAbout'), run: () => downloadWord(editor.markdown().trim() || `# ${name}`, name, { made: head.author === 'jean', page: editor.view.dom }) },
    { id: '', glyph: icons.download, label: t('made.out.markdown'), about: t('made.out.markdownAbout'), run: async () => (await import('../../ui/preview.js')).download(file) }],
  print: { id: 'print', about: t('made.out.printDocument'), run: () => printPage(editor.view.dom) }, kit: true,
})

/** What a collection can do: its rows as its view keeps them, or as they are in a file. @param {File} file @returns {import('../../ui/out.js').Ways} */
export function collectionWays(file) {
  const rows = () => withRows(`\`\`\`table\n${file.uri}\n\`\`\``), made = async (/** @type {'xlsx' | 'csv'} */ kind) => /** @type {NonNullable<Awaited<ReturnType<typeof import('../tables/tables.js').workbook>>>} */ (await (await import('../tables/tables.js')).workbook(file.uri, kind))
  const down = (/** @type {'xlsx' | 'csv'} */ kind) => async () => { const { name, mimeType, bytes } = await made(kind); save(new Blob([/** @type {BlobPart} */ (bytes)], { type: mimeType }), name) }
  return { share: async () => ({ text: await rows() }),
    send: { file: `${file.title}.csv`, type: 'text/csv', make: async () => { const { name, bytes } = await made('csv'); return { title: file.title, files: [new File([/** @type {BlobPart} */ (bytes)], name, { type: 'text/csv' })] } } },
    copy: { id: 'copy', about: t('made.out.copyRows'), run: async () => copyRich(await rows()) },
    files: [{ id: 'xlsx', glyph: icons.table, label: t('made.out.excel'), about: t('made.out.excelAbout'), run: down('xlsx') }, { id: 'csv', glyph: icons.download, label: t('made.out.csv'), about: t('made.out.csvAbout'), run: down('csv') }],
    print: { id: 'print', about: t('made.out.printRows'), run: async () => printDrawn(await rowsOf(file.uri)) }, kit: true }
}

// ─── Rich text ───────────────────────────────────────────────────────────────

/**
 * Copies an answer two ways at once: its Markdown as text, and laid out as rich text, in which a
 * chart, a score, a deck's slide or a LaTeX document (D185, D196, D200) is the picture its widget on screen draws, or else its code, as a page (D289) is.
 * @param {string} source Markdown @param {globalThis.Element | null} [answer] the answer on screen, with its widgets
 */
export async function copyRich(source, answer) {
  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': laidOut(source, answer).then((rich) => new Blob([rich], { type: 'text/html' })),
        'text/plain': new Blob([source], { type: 'text/plain' }),
      })])
    } else await navigator.clipboard.writeText(source)
    // Some apps leave out pictures pasted in rich text (Notion), but take a widget's own copy (D196).
    notify(t(answer?.querySelector('.prose :is(app-chart, app-score) [role="img"], .prose app-slides .deck-slide, .prose app-latex .latex-page, .prose app-diagram') ? 'made.copiedPictures' : 'toast.copied'))
    act('answer.copy', { task: app.current.peek()?.path })
  } catch (error) {
    console.warn('Copy', error)
    notify(t('made.copyFailed'), { alert: true })
  }
}

/** The answer as HTML. @param {string} source @param {globalThis.Element | null | undefined} answer */
async function laidOut(source, answer) {
  const holder = document.createElement('div')
  render(markdown(source), holder)
  // lit-html leaves marker comments; the clipboard doesn't need them.
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT)
  /** @type {ChildNode[]} */
  const comments = []
  while (walker.nextNode()) comments.push(/** @type {ChildNode} */ (walker.currentNode))
  for (const comment of comments) comment.remove()
  // Each widget's twin on screen, the same kind with the same source, draws its picture.
  const shown = [...answer?.querySelectorAll('.prose :is(app-chart, app-score, app-slides, app-latex, app-diagram)') ?? []]
  for (const widget of holder.querySelectorAll('app-chart, app-score, app-slides, app-latex, app-diagram, app-page')) {
    const code = widget.getAttribute('source') ?? ''
    const twin = shown.find((other) => other.localName === widget.localName && other.getAttribute('source') === code)
    if (twin) shown.splice(shown.indexOf(twin), 1)
    widget.replaceWith((twin && await pictureOf(twin)) || Object.assign(document.createElement('pre'), { textContent: code }))
  }
  return new XMLSerializer().serializeToString(holder)
}

/** A widget's picture as an image in the copied HTML, at the size it shows, or null. @param {globalThis.Element} widget */
async function pictureOf(widget) {
  try {
    const blob = await /** @type {{ picture: () => Promise<Blob> }} */ (/** @type {unknown} */ (widget)).picture()
    const reader = new FileReader()
    const read = new Promise((resolve, reject) => Object.assign(reader, { onload: resolve, onerror: reject }))
    reader.readAsDataURL(blob)
    const [{ width }] = await Promise.all([createImageBitmap(blob), read])
    // Drawn twice as fine as it shows.
    return Object.assign(document.createElement('img'), { src: String(reader.result), width: Math.round(width / 2), alt: widget.querySelector('[role="img"], .slide.is-shown')?.getAttribute('aria-label') ?? '' })
  } catch (error) {
    console.warn('Copy', error)
    return null
  }
}

