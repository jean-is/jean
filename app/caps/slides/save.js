// Save (D591, D593): the deck beside the conversation, as it is on show, taken out four ways: as PowerPoint, made in the browser
// from the deck as drawn (deck's toPptx, PptxGenJS loaded only then), its words, lists, tables and charts PowerPoint's own, a
// layout of PowerPoint's for each of the deck's; as a PDF, printed a slide a page, on a page of a slide's size; as its file, a
// page any browser presents, its pictures inside it (caps/skills/decks.js); or as a link to a copy (Share, D361).
import { html, nothing } from 'lit-html'
import { createDeck } from '@codename/deck'
import { app, notify } from '../../ui/state.js'
import { save } from '../../ui/save.js'
import { act } from '../../ui/acts.js'
import { loaded } from '../../ui/caps.js'
import { icons } from '../../ui/menu-icons.js'
import { t } from '../../core/i18n.js'
import { BLOCKS } from './slides.js'

/** The deck on show beside the conversation. */
const here = () => /** @type {(HTMLElement & { view: ReturnType<typeof import('@codename/deck').createDeck> | null, resolve: (src: string) => string | null }) | null} */ (document.querySelector('app-preview app-slides.beside'))

/** Printed alone, a slide a page, drawn for the printer out of sight, then gone, the room's own page size given back. @param {ReturnType<typeof import('@codename/deck').createDeck>} view */
async function print(view) {
  const holder = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'deck-print' }))
  const printed = createDeck(holder, { source: view.source, kit: view.kit, scheme: 'light', blocks: BLOCKS, resolve: here()?.resolve, headings: 'aria', editable: false })
  for (const slide of printed.slides()) slide.querySelectorAll('.deck-step').forEach((step) => step.classList.add('is-on'))
  // Its pictures, which deck reads when they come near the screen, read now, out of sight as they are.
  for (const picture of holder.querySelectorAll('img')) picture.loading = 'eager'
  const page = new CSSStyleSheet()
  page.replaceSync('@page { size: 13.333in 7.5in; margin: 0 }')
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, page]
  document.documentElement.classList.add('is-printing-deck')
  // Its charts drawn and still, its diagrams and pictures in, its faces too, a few seconds at most.
  const blocks = () => [...holder.querySelectorAll('.deck-block, .deck-picture')]
  for (let wait = 0; wait < 60 && blocks().some((box) => !(/** @type {any} */ (box).chart || box.querySelector('img')?.complete || box.classList.contains('is-failed'))); wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  for (const box of blocks()) /** @type {any} */ (box).chart?.setOption({ animation: false })
  await document.fonts.ready
  printed.fitAll()
  addEventListener('afterprint', () => { document.documentElement.classList.remove('is-printing-deck'); document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== page); printed.destroy(); holder.remove() }, { once: true })
  window.print()
}

/** What Save does with each choice. @param {string} how @param {{ uri: string, name: string }} file */
async function out(how, file) {
  const view = here()?.view
  if (!view) return
  try {
    if (how === 'pptx') {
      const [{ toPptx }, { default: PptxGenJS }] = await Promise.all([import('@codename/deck'), import(new URL('../../vendor/pptxgenjs/pptxgen.mjs', import.meta.url).href)])
      save((await toPptx(view, { PptxGenJS, JSZip: /** @type {any} */ (globalThis).JSZip })).blob, `${file.name}.pptx`)
    } else if (how === 'pdf') await print(view)
    else if (how === 'file') save(new Blob([/** @type {BlobPart} */ (await (await import('../skills/decks.js')).bytesOf(file.uri, view.source))], { type: 'text/html' }), `${file.name}.deck.html`)
    else {
      const task = app.current.peek()?.path ?? (await (await import('../skills/decks.js')).load(file.uri))?.meta.source
      if (!task) return
      const { openShare } = await import('../share/share.js')
      return openShare({ path: task, title: file.name, item: { text: `\`\`\`\`deck\n${view.source}\n\`\`\`\`` } }, document.querySelector('.slides-save'))
    }
    act('file.save', { task: app.current.peek()?.path, path: file.uri, format: how })
  } catch (error) {
    console.warn('Save', error)
    notify(t('slides.notSaved'))
  }
}

/** Save and its menu, at the top of the pane while a deck is on show. @param {{ uri: string, name: string }} file */
export function saveMenu(file) {
  const item = (/** @type {string} */ how, /** @type {unknown} */ glyph, /** @type {string} */ label, /** @type {string} */ about) => html`<button type="button" popovertarget="slides-save" popovertargetaction="hide"
    @click=${() => out(how, file)}>${glyph}<span><b>${label}</b><small>${about}</small></span></button>`
  return html`<button type="button" class="button slides-save" popovertarget="slides-save">${t('slides.save')}${icons.chevron}</button>
    <div id="slides-save" class="menu slides-out" role="menu" popover>
      ${item('pptx', icons.slides, t('slides.out.pptx'), t('slides.out.pptxAbout'))}
      ${item('pdf', icons.print, t('slides.out.pdf'), t('slides.out.pdfAbout'))}
      ${item('file', icons.download, t('slides.out.file'), t('slides.out.fileAbout'))}
      ${loaded.value.has('share') ? item('share', icons.share, t('slides.out.share'), t('slides.out.shareAbout')) : nothing}
    </div>`
}
