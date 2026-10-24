// Designs' phase 0: does the file draw what the view drew? For Léa's invitation in eight languages and
// two takes, in Chromium, WebKit and Firefox: the view is laid out by the browser; each text part's lines
// are measured from it (their words, their middle, their baseline) and written as SVG text (format.js),
// the faces embedded; the SVG is then drawn as a picture, and as a PNG through a canvas, as Jean's export
// does (pictureOf), and each is compared with the view, pixel by pixel, where there is ink. Each line's
// width in SVG is compared with the view's too. Then two A5s to an A4 sheet and four A6s to one, printed
// to PDF (Chromium alone prints from Playwright), read back for their size, their words and their fonts.
// Needs scripts/designs-faces.js run first, and Playwright's browsers. Writes spikes/designs/out/.
// Usage: node scripts/designs-render.js [--only chromium,webkit] [--samples en-1,ar-3] [--nudge dx,dy]
import { chromium, webkit, firefox } from 'playwright'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { viewHtml, SAMPLES, BALLOONS } from '../spikes/designs/view.js'
import { toSvg, fromSvg } from '../spikes/designs/format.js'

/** @import { FaceFile } from '../spikes/designs/view.js' */
/** @import { Line, Design } from '../spikes/designs/format.js' */

const HERE = fileURLToPath(new URL('../spikes/designs/', import.meta.url))
const OUT = `${HERE}out/`
const HOST = 'http://design.test'
// The view's size in CSS pixels; drawn at twice that, as A5 at 254 dpi.
const W = 740
const H = 1050
const GROUND = [255, 244, 218]

/** The Friendly voice (Nunito, Rubik for Arabic) and the Calm one (Inter, or Source Sans 3 as first measured), from designs-faces.js's files. */
async function voiceFiles() {
  const faces = JSON.parse(await readFile(`${HERE}.faces/faces.json`, 'utf8'))
  /** @type {(FaceFile & { path: string })[]} */
  const files = []
  for (const face of faces) {
    const family = { Nunito: 'Friendly', Rubik: 'Friendly', 'Source Sans 3': 'Calm', Inter: 'Calm' }[/** @type {string} */ (face.family)]
    if (!family) continue
    for (const one of face.files) {
      const name = `${face.voice.toLowerCase()}-${face.dir}-${one.subset}.woff2`
      files.push({ family, url: `${HOST}/faces/${name}`, range: one.range, path: `${HERE}.faces/voices/${name}` })
    }
  }
  return files
}

/**
 * In the page: each text part's lines as the browser laid them out, grapheme by grapheme, grouped by
 * the top of their boxes: the words, the line's middle, its baseline (its box's top and the face's
 * ascent), the type; and the picture's box. Positions are the view's own CSS pixels.
 */
function measure() {
  const root = /** @type {HTMLElement} */ (document.getElementById('page'))
  const page = root.getBoundingClientRect()
  const pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
  const segmenter = new Intl.Segmenter(document.documentElement.lang, { granularity: 'grapheme' })
  /** @type {Record<string, { text: string, x: number, y: number, width: number, family: string, size: number, weight: number, fill: string, dir: string }[]>} */
  const lines = {}
  /** @type {number[]} */
  let picture = []
  for (const element of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-part]'))) {
    const box = element.getBoundingClientRect()
    if (element.dataset.role === 'picture') {
      picture = [box.left - page.left, box.top - page.top, box.width, box.height]
      continue
    }
    const style = getComputedStyle(element)
    const size = parseFloat(style.fontSize)
    pen.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
    const ascent = pen.measureText('Hg').fontBoundingBoxAscent
    const range = document.createRange()
    /** @type {{ top: number, left: number, right: number, text: string }[]} */
    const found = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = /** @type {Text} */ (node)
      for (const { segment, index } of segmenter.segment(text.data)) {
        range.setStart(text, index)
        range.setEnd(text, index + segment.length)
        const rect = [...range.getClientRects()].find((one) => one.width > 0)
        if (!rect) {
          if (found.length) found[found.length - 1].text += segment
          continue
        }
        let line = found.find((one) => Math.abs(one.top - rect.top) < size * 0.5)
        if (!line) found.push(line = { top: rect.top, left: rect.left, right: rect.right, text: '' })
        line.text += segment
        line.left = Math.min(line.left, rect.left)
        line.right = Math.max(line.right, rect.right)
      }
    }
    // The part's opacity goes into its colour, as SVG text takes it.
    const opacity = Number(style.opacity)
    const fill = opacity < 1 ? style.color.replace(/^rgb\((.*)\)$/, `rgba($1, ${opacity})`) : style.color
    lines[/** @type {string} */ (element.dataset.part)] = found.map((one) => ({
      text: one.text.trim(), x: (one.left + one.right) / 2 - page.left, y: one.top - page.top + ascent, width: one.right - one.left,
      family: style.fontFamily.split(',')[0].replaceAll('"', '').trim(), size, weight: Number(style.fontWeight), fill, dir: style.direction,
    }))
  }
  return { lines, picture }
}

/**
 * In the page: how two pictures of the same size differ, where either has ink (a pixel apart from
 * the ground): the share of those pixels that differ by more than 48 in a channel, and a picture of
 * where, in red.
 * @param {[string, string, number[]]} args
 */
async function compare([one, other, ground]) {
  const load = async (/** @type {string} */ src) => {
    const image = new Image()
    image.src = src
    await image.decode()
    const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight })
    const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
    pen.drawImage(image, 0, 0)
    return pen.getImageData(0, 0, canvas.width, canvas.height)
  }
  const [a, b] = await Promise.all([load(one), load(other)])
  if (a.width !== b.width || a.height !== b.height) return { size: `${a.width}×${a.height} against ${b.width}×${b.height}` }
  const marked = new ImageData(a.width, a.height)
  let ink = 0
  let differ = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const away = (/** @type {Uint8ClampedArray} */ data) => Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - ground[c]))) > 48
    if (!away(a.data) && !away(b.data)) continue
    ink++
    const apart = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])))
    if (apart > 48) {
      differ++
      marked.data.set([220, 30, 30, 255], i)
    } else marked.data.set([180, 180, 180, 255], i)
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: a.width, height: a.height })
  const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  pen.putImageData(marked, 0, 0)
  return { share: ink ? differ / ink : 0, ink, differ, picture: canvas.toDataURL('image/png') }
}

/** @param {string} data a data: address @param {string} path */
const saveData = (data, path) => writeFile(path, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'))

/** @param {string[]} argv */
async function main(argv) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const engines = flag('--only')?.split(',') ?? ['chromium', 'webkit', 'firefox']
  const samples = flag('--samples')?.split(',') ?? [...Object.keys(SAMPLES).map((lang) => `${lang}-1`), 'en-3', 'ar-3']
  await mkdir(OUT, { recursive: true })
  const files = await voiceFiles()
  const embedded = await Promise.all(files.map(async (one) => ({ family: one.family, range: one.range, weight: '100 900', src: `data:font/woff2;base64,${(await readFile(one.path)).toString('base64')}` })))
  /** @type {Map<string, string>} */
  const pages = new Map()
  const results = []
  for (const name of engines) {
    const engine = { chromium, webkit, firefox }[name]
    if (!engine) continue
    let browser
    try {
      browser = await engine.launch()
    } catch (error) {
      results.push({ engine: name, error: /** @type {Error} */ (error).message.split('\n')[0] })
      continue
    }
    const context = await browser.newContext({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 2 })
    await context.route(`${HOST}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.startsWith('/faces/')) {
        const file = files.find((one) => one.url.endsWith(path))
        return file ? route.fulfill({ body: await readFile(file.path), headers: { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' } }) : route.fulfill({ status: 404 })
      }
      const body = pages.get(path)
      return body ? route.fulfill({ body, headers: { 'content-type': 'text/html; charset=utf-8' } }) : route.fulfill({ status: 404 })
    })
    const page = await context.newPage()
    for (const sample of samples) {
      const [lang, take] = sample.split('-')
      pages.set(`/view/${sample}.html`, viewHtml({ lang, take: take === '3' ? 3 : 1, faces: files }))
      await page.goto(`${HOST}/view/${sample}.html`)
      await page.evaluate(() => document.fonts.ready)
      const { lines, picture } = await page.evaluate(measure)
      const view = `data:image/png;base64,${(await page.locator('#page').screenshot()).toString('base64')}`
      /** @type {Design} */
      const design = {
        format: 1, author: 'jean', created: '2026-10-24T00:00:00.000Z', changed: '2026-10-24T00:00:00.000Z', size: 'a5', page: { w: W, h: H }, lang, layout: take === '3' ? 'bold-start' : 'picture-top', voice: 'friendly', ground: '#fff4da',
        parts: [{ id: 'picture', role: 'picture', file: 'balloons', words: 'Balloons', box: picture }, ...Object.keys(lines).map((role) => ({ id: role, role, text: SAMPLES[lang][role] }))],
      }
      // --nudge dx,dy moves every line, to find an engine's own offset of SVG text from HTML.
      const [dx, dy] = (flag('--nudge') ?? '0,0').split(',').map(Number)
      /** @type {Record<string, Line[]>} */
      const written = Object.fromEntries(Object.entries(lines).map(([part, list]) => [part, list.map((one) => ({ ...one, x: one.x + dx, y: one.y + dy, anchor: /** @type {const} */ ('middle'), dir: /** @type {'ltr' | 'rtl'} */ (one.dir) }))]))
      const svg = toSvg(design, written, { faces: embedded, pictures: { balloons: BALLOONS } })
      const kept = JSON.stringify(fromSvg(svg)) === JSON.stringify(design)
      const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      // Each line's width as SVG lays it, against the view's.
      const widths = await page.evaluate((markup) => {
        const holder = document.createElement('div')
        holder.style.cssText = 'position:absolute;inset-inline-start:-4000px;inline-size:740px'
        holder.innerHTML = markup
        document.body.append(holder)
        return [.../** @type {NodeListOf<SVGTextElement>} */ (holder.querySelectorAll('text'))].map((text) => text.getComputedTextLength())
      }, svg)
      const measured = Object.values(lines).flat()
      const apart = measured.map((one, i) => Math.abs(one.width - widths[i]))
      // Drawn as a picture, then as a PNG through a canvas at twice the size, as the export does.
      pages.set(`/img/${sample}.html`, `<!doctype html><html><body style="margin:0"><img id="page" width="${W}" height="${H}" src="${source}"></body></html>`)
      await page.goto(`${HOST}/img/${sample}.html`)
      await page.evaluate(() => /** @type {HTMLImageElement} */ (document.getElementById('page')).decode())
      const asPicture = `data:image/png;base64,${(await page.locator('#page').screenshot()).toString('base64')}`
      const throughCanvas = await page.evaluate(async ([src, w, h]) => {
        const image = new Image()
        image.src = /** @type {string} */ (src)
        await image.decode()
        const canvas = Object.assign(document.createElement('canvas'), { width: Number(w), height: Number(h) })
        const pen = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
        pen.drawImage(image, 0, 0, Number(w), Number(h))
        try {
          return canvas.toDataURL('image/png')
        } catch (error) {
          return `tainted: ${/** @type {Error} */ (error).message}`
        }
      }, [source, W * 2, H * 2])
      const picturedDiff = await page.evaluate(compare, /** @type {[string, string, number[]]} */ ([view, asPicture, GROUND]))
      const canvasDiff = throughCanvas.startsWith('data:') ? await page.evaluate(compare, /** @type {[string, string, number[]]} */ ([view, throughCanvas, GROUND])) : { error: throughCanvas }
      const stem = `${OUT}${name}-${sample}`
      await writeFile(`${stem}.svg`, svg)
      await saveData(view, `${stem}-view.png`)
      if (throughCanvas.startsWith('data:')) await saveData(throughCanvas, `${stem}-png.png`)
      if ('picture' in picturedDiff && picturedDiff.picture) await saveData(picturedDiff.picture, `${stem}-diff.png`)
      results.push({
        engine: name, sample, kept, lines: measured.length, partsLines: Object.fromEntries(Object.entries(lines).map(([part, list]) => [part, list.length])),
        widthApartMax: Math.round(Math.max(...apart) * 100) / 100, widthApartOver1px: apart.filter((one) => one > 1).length,
        svgVsView: 'share' in picturedDiff ? Math.round(/** @type {number} */ (picturedDiff.share) * 10000) / 100 : picturedDiff,
        pngVsView: 'share' in canvasDiff ? Math.round(/** @type {number} */ (canvasDiff.share) * 10000) / 100 : canvasDiff,
      })
      console.log(JSON.stringify(results[results.length - 1]))
    }
    if (name === 'chromium') {
      for (const [sheet, width, size, copies] of /** @type {[string, string, string, number][]} */ ([['a5-on-a4', '148mm', 'A4 landscape', 2], ['a6-on-a4', '104mm', 'A4', 4]])) {
        pages.set(`/sheet/${sheet}.html`, viewHtml({ lang: 'fr', faces: files, width, sheet: { size, copies, columns: 2 } }))
        await page.goto(`${HOST}/sheet/${sheet}.html`)
        await page.evaluate(() => document.fonts.ready)
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
        await writeFile(`${OUT}${sheet}.pdf`, pdf)
        const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
        const read = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise
        const first = await read.getPage(1)
        const text = await first.getTextContent()
        const words = text.items.map((item) => ('str' in item ? item.str : '')).join(' ')
        // The fonts the page sets, and whether each is inside the PDF.
        const operators = await first.getOperatorList()
        const ids = new Set(operators.fnArray.flatMap((fn, i) => (fn === OPS.setFont ? [operators.argsArray[i][0]] : [])))
        const set = [...ids].map((id) => first.commonObjs.get(id))
        const fonts = `${set.length}, ${set.filter((font) => !font.missingFile).length} embedded`
        results.push({
          engine: name, sheet, pages: read.numPages, points: first.view.map((n) => Math.round(n * 10) / 10), mm: first.view.slice(2).map((n) => Math.round(n / 72 * 25.4)),
          words: words.length, fonts, bytes: pdf.length, sample: words.slice(0, 80),
        })
        console.log(JSON.stringify(results[results.length - 1]))
      }
    }
    await browser.close()
  }
  await writeFile(`${OUT}results.json`, JSON.stringify(results, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`render: ${error.stack}`)
  process.exit(1)
})
