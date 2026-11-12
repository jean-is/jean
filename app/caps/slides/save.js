// SPDX-License-Identifier: MIT
// How a deck leaves (D591, D593, D683), through the pane's one button (ui/out.js), as it is on show: as a link to a copy (Share, D361);
// as PowerPoint, made in the browser from the deck as drawn (deck's toPptx and PptxGenJS, loaded only then), its words, lists, tables and
// charts PowerPoint's own, a layout of PowerPoint's for each of the deck's; as its file, a page any browser presents, its pictures inside it
// (caps/skills/decks.js); or printed as a PDF, a slide a page, on a page of a slide's size.
import { createDeck } from '@codename/deck'
import { notify } from '../../ui/state.js'
import { save, printAlone, copyDrawing } from '../../ui/save.js'
import { icons } from '../../ui/menu-icons.js'
import { t } from '../../core/i18n.js'
import { BLOCKS } from './slides.js'

/** The deck in a pane. @param {Element} pane */
const here = (pane) => /** @type {(HTMLElement & { view: ReturnType<typeof import('@codename/deck').createDeck>, resolve: (src: string) => string | null, picture: () => Promise<Blob> }) | null} */ (pane.querySelector('app-slides.beside'))

/** Printed alone, a slide a page, drawn for the printer out of sight, then gone, the room's own page size given back. @param {ReturnType<typeof import('@codename/deck').createDeck>} view @param {(src: string) => string | null} [resolve] */
async function print(view, resolve) {
  const holder = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'deck-print' }))
  const printed = createDeck(holder, { source: view.source, kit: view.kit, scheme: 'light', blocks: BLOCKS, resolve, headings: 'aria', editable: false })
  for (const slide of printed.slides()) slide.querySelectorAll('.deck-step').forEach((step) => step.classList.add('is-on'))
  // Its pictures, which deck reads when they come near the screen, read now, out of sight as they are.
  for (const picture of holder.querySelectorAll('img')) picture.loading = 'eager'
  // Its charts drawn and still, its diagrams and pictures in, its faces too.
  const blocks = () => [...holder.querySelectorAll('.deck-block, .deck-picture')]
  await printAlone(holder, 'is-printing-deck', { page: '@page { size: 13.333in 7.5in; margin: 0 }', drawing: () => blocks().some((box) => !(/** @type {{ chart?: import('echarts').ECharts | null }} */ (box).chart || box.querySelector('img')?.complete || box.classList.contains('is-failed'))),
    ready: () => { for (const box of blocks()) /** @type {{ chart?: import('echarts').ECharts | null }} */ (box).chart?.setOption({ animation: false }); printed.fitAll() }, gone: () => printed.destroy() })
}

/** What a deck can do (ui/out.js): the one in this pane, as it is on show when pressed. @param {{ uri: string, name: string }} file @param {Element} pane @returns {import('../../ui/out.js').Ways | null} */
export function ways(file, pane) {
  const shown = () => /** @type {NonNullable<ReturnType<typeof here>>} */ (here(pane)), page = async () => /** @type {BlobPart} */ (await (await import('../skills/decks.js')).bytesOf(file.uri, shown().view.source)), named = `${file.name}.deck.html`
  return { share: () => ({ text: `\`\`\`\`deck\n${shown().view.source}\n\`\`\`\`` }), thing: { kind: /** @type {const} */ ('deck'), uri: file.uri }, page,
    send: { file: named, type: 'text/html', make: async () => ({ title: file.name, files: [new File([await page()], named, { type: 'text/html' })] }) },
    copy: { id: 'copy', label: t('slides.out.copy'), run: () => copyDrawing(shown().view.source, shown().picture()).then(() => notify(t('toast.copied'))) },
    files: [{ id: 'pptx', glyph: icons.slides, label: t('slides.out.pptx'), run: async () => {
      const [{ toPptx }, { default: PptxGenJS }, { withNames }] = await Promise.all([import(new URL('../../vendor/deck/pptx.mjs', import.meta.url).href), import(new URL('../../vendor/pptxgenjs/pptxgen.mjs', import.meta.url).href), import('./kit.js')]), { view } = shown()
      save((await toPptx({ ...view, kit: withNames(view.kit) }, { PptxGenJS, JSZip: /** @type {any} */ (globalThis).JSZip })).blob, `${file.name}.pptx`)
    } }, { id: 'file', glyph: icons.download, label: t('out.webPage'), run: async () => save(new Blob([await page()], { type: 'text/html' }), named) }],
    print: { id: 'pdf', run: () => print(shown().view, shown().resolve) }, kit: true }
}
