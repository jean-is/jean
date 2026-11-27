// SPDX-License-Identifier: MIT
// A page of parts on its own (D670): how one leaves Jean, downloaded, sent to another app or published as a site, drawn as Jean draws it
// and live wherever it lands. Jean draws it out of sight from its source, what it shows of the project's collections written in (./parts.js's
// frozen()), and writes down what it drew: its parts, its fields as they start, each chart an SVG of itself, each picture inside it, and the
// rules of the room's style sheets that style them, as they are written, with the colours, type and face they read now. Where scripts run,
// ./alive.js keeps it live: on a page of its own, its modules ride inside it, inert, each made a module and named in an import map before it
// starts, as a game's engine does (../games/page.js); on a site, whose host runs its own files alone, they are files beside it. Jean's own
// buttons stay behind, and a form's that would ask the brain, as nothing is sent from such a page.
import { unlock } from '../../ui/caps.js'
import { theme } from '../../ui/state.js'
import { pagePolicy } from '../../ui/csp.js'
import { still } from '../../ui/sheet.js'
import { BRAND } from '../../brand.js'
import { locale, dir, intlLocales } from '../../core/i18n.js'
import { library } from './interactive.js'
import { parse, all } from './parts.js'
import { shared } from './live.js'

/** What keeps it live, by the name each goes by in the page, and where each is beside this module. */
const MODULES = /** @type {Record<string, string>} */ ({ alive: './alive.js', parts: './parts.js', live: './live.js', engine: '../formula/engine.js', formula: '../tables/formula.js', option: '../charts/option.js' })
/** Each read once. @type {Map<string, Promise<string>>} */
const read = new Map()
/** @param {string} path */
const text = (path) => read.get(path) ?? /** @type {Promise<string>} */ (read.set(path, fetch(new URL(path, import.meta.url)).then((response) => response.text())).get(path))
/**
 * A module, the others it imports named as the page finds them: by name, which its import map gives, or as a file beside it (`site`).
 * @param {string} code @param {boolean} [site]
 */
const named = (code, site = false) => code.replace(/(\b(?:from|import)\s*\(?\s*)(['"])(?:\.{1,2}\/(?:[\w-]+\/)*)?([\w-]+)(?:\.m?js)?\2/g,
  (whole, lead, quote, name) => (Object.hasOwn(MODULES, name) || name === 'echarts' ? `${lead}${quote}${site ? `./${name}.js` : name}${quote}` : whole))

/** States a rule may style that the page isn't in as it is drawn, and its pseudo-elements, which no element matches: left out to find whether a rule styles it. */
const STATES = /::?(?:hover|focus(?:-visible|-within)?|active|visited|link|target|checked|indeterminate|disabled|enabled|placeholder-shown|popover-open|open|(?:user-)?(?:in)?valid|autofill|before|after|marker|placeholder|selection|backdrop|first-line|first-letter|file-selector-button|-(?:webkit|moz)-[\w-]+)(?![\w-])/g
/** Whether a selector styles the holder or what it holds. @param {Element} holder @param {string} selector */
const styles = (holder, selector) => [selector, selector.replace(STATES, '')].some((one) => { try { return holder.matches(one) || holder.querySelector(one) !== null } catch { return false } })

/**
 * A style sheet's text as its rules, or a block's: each one's prelude and the block it opens, or null for a statement (`@import …;`), its
 * comments and strings passed over. Read from the text, as Chromium's own text of a rule loses a shorthand that reads a variable once a
 * longhand of it follows. @param {string} css @returns {{ prelude: string, block: string | null }[]}
 */
function rulesIn(css) {
  const found = /** @type {{ prelude: string, block: string | null }[]} */ ([])
  for (let i = 0, start = 0, depth = 0, open = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') i = css.indexOf('*/', i + 2) < 0 ? css.length : css.indexOf('*/', i + 2) + 1
    else if (c === '"' || c === "'") for (i++; i < css.length && css[i] !== c; i += css[i] === '\\' ? 2 : 1);
    else if (c === '{' && !depth++) open = i
    else if (c === '}' && depth && !--depth) (found.push({ prelude: css.slice(start, open), block: css.slice(open + 1, i) }), (start = i + 1))
    else if (c === ';' && !depth) (found.push({ prelude: css.slice(start, i), block: null }), (start = i + 1))
  }
  return found.map(({ prelude, block }) => ({ prelude: prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim(), block }))
}

/**
 * Of a style sheet's text, the rules that style what a holder holds, as they are written, inside their @media, @container and the rest,
 * their addresses made whole from the sheet's; each face it declares put in `faces`. @param {Element} holder @param {string} css @param {string} base
 * @param {string[]} faces @returns {string}
 */
const rulesOf = (holder, css, base, faces) => rulesIn(css).map(({ prelude, block }) => {
  const name = /^@([\w-]+)/.exec(prelude)?.[1], whole = (/** @type {string} */ rule) => rule.replace(/url\((["']?)([^"')]+)\1\)/g, (_, __, url) => `url(${new URL(url, base).href})`)
  if (block === null || (name && !/^(media|supports|container|layer|scope|font-face)$/.test(name))) return ''
  if (name === 'font-face') return void faces.push(whole(`${prelude}{${block}}`)), ''
  if (name) return ((inner) => inner && `${prelude}{${inner}}`)(rulesOf(holder, block, base, faces))
  return styles(holder, prelude) ? whole(`${prelude}{${block}}`) : ''
}).filter(Boolean).join('\n')

/** A file of Jean's as a `data:` address. @param {string} url @returns {Promise<string>} */
const dataOf = (url) => fetch(url).then((response) => response.blob()).then((blob) => new Promise((resolve, reject) => { const reader = Object.assign(new FileReader(), { onload: () => resolve(String(reader.result)), onerror: reject }); reader.readAsDataURL(blob) }))
/** Each file of Jean's a text names, inside it. @param {string} css */
async function inside(css) {
  let done = css
  for (const url of new Set([...css.matchAll(/url\((https?:[^)]+)\)/g)].map(([, url]) => url))) done = done.replaceAll(`url(${url})`, `url(${await dataOf(url).catch(() => '')})`)
  return done
}

/**
 * What the holder's page needs to look as it does here: the rules of the room's style sheets that style it, as written, the room's variables
 * they read as they are now, its type, colour and paper, and the pictures they name, inside it; its faces too with `faced`, as a site's
 * host serves no face from elsewhere. @param {HTMLElement} holder @param {boolean} faced
 */
async function sheetOf(holder, faced) {
  const faces = /** @type {string[]} */ ([]), sheets = [...document.styleSheets, ...document.adoptedStyleSheets].filter((sheet) => !sheet.disabled)
  const texts = await Promise.all(sheets.map(async (sheet) => ({ base: sheet.href ?? location.href, media: sheet.media.mediaText,
    css: sheet.href ? await fetch(sheet.href).then((response) => response.text()).catch(() => '') : sheet.ownerNode?.textContent ?? [...sheet.cssRules].map((rule) => rule.cssText).join('\n') })))
  const own = texts.map(({ css, base, media }) => ((kept) => (kept && media && media !== 'all' ? `@media ${media}{${kept}}` : kept))(rulesOf(holder, css, base, faces))).filter(Boolean).join('\n')
  const style = getComputedStyle(holder), names = new Set([...own.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name))
  const variables = [...names].map((name) => `${name}: ${style.getPropertyValue(name).trim()};`).join(' ')
  const paper = [document.body, document.documentElement].map((one) => getComputedStyle(one).backgroundColor).find((color) => !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(color)) ?? 'Canvas'
  const used = faced ? faces.filter((face) => ((family) => Boolean(family) && (own + variables).includes(String(family)))(/font-family:\s*["']?([^"';]+)/.exec(face)?.[1])) : []
  return inside(`${used.join('\n')}\n:root { color-scheme: ${theme.peek()}; ${variables} }
body { margin: 0; padding: 1.25rem; background: ${paper}; color: ${style.color}; font: ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}; }
main { max-inline-size: 64rem; margin-inline: auto; } app-chart .chart > svg { display: block; inline-size: 100%; block-size: 100%; }
${own}`)
}

/**
 * The page drawn out of sight as Jean draws it, and written down: its fields as they start, each chart an SVG of itself, each picture inside it,
 * without Jean's buttons, nor a form's that would ask the brain; with what it needs to look so, and whether it holds anything that works.
 * @param {string} source with what it shows of the project's collections written in @param {boolean} faced
 */
async function drawn(source, faced) {
  const list = all(parse(source) ?? []), lang = locale.peek()
  if (list.some((part) => part.tag === 'app-chart')) await unlock('charts')
  await import('./view-parts.js')
  const holder = Object.assign(document.createElement('div'), { className: 'prose', inert: true }), page = document.createElement('app-parts')
  holder.style.cssText = 'position: fixed; inset-block-start: 0; inset-inline-start: -300vw; inline-size: min(64rem, 100vw)'
  page.setAttribute('source', source)
  holder.append(page)
  document.body.append(holder)
  try {
    const charts = /** @type {(HTMLElement & { chart?: unknown, svg: () => string })[]} */ ([...page.querySelectorAll('app-chart')])
    for (let wait = 0; wait < 60 && charts.some((one) => !one.chart); wait++) await new Promise((resolve) => setTimeout(resolve, 50))
    const copy = /** @type {HTMLElement} */ (document.createElement('app-parts'))
    copy.append(...[...page.children].map((child) => child.cloneNode(true)))
    // Its fields as they start, which the page set as properties, written as attributes.
    const [was, now] = [page, copy].map((one) => [...one.querySelectorAll('input, select, textarea')])
    was.forEach((field, i) => {
      const twin = now[i]
      if (field instanceof HTMLInputElement) (field.type === 'checkbox' ? twin.toggleAttribute('checked', field.checked) : twin.setAttribute('value', field.value))
      else if (field instanceof HTMLTextAreaElement) twin.textContent = field.value
      else if (field instanceof HTMLSelectElement) [.../** @type {HTMLSelectElement} */ (twin).options].forEach((option, n) => option.toggleAttribute('selected', n === field.selectedIndex))
    })
    copy.querySelectorAll('.drawn-foot').forEach((foot) => foot.remove())
    for (const form of copy.querySelectorAll('form[data-part]')) {
      const to = list[Number(form.getAttribute('data-part'))]?.attrs.to
      if (!list.some((part) => part.tag === 'app-table' && to && part.attrs.id === to)) form.querySelector('button[type="submit"]')?.remove()
    }
    // Each chart's SVG, ECharts' own markup, goes in its box's place once the page is written down.
    const boxes = [...copy.querySelectorAll('app-chart')], pictures = charts.map((chart) => (chart.chart ? chart.svg() : ''))
    pictures.forEach((picture, i) => { if (picture) boxes[i]?.querySelector('.chart')?.replaceChildren(Object.assign(document.createElement('app-svg'), { id: `svg-${i}` })) })
    // What else drew on a canvas, a picture of it; a picture the page holds by a blob, inside it.
    const [canvases, twins] = [page, copy].map((one) => [...one.querySelectorAll('canvas:not(app-chart *)')]), drew = /** @type {HTMLCanvasElement[]} */ (canvases)
    drew.forEach((canvas, i) => { try { twins[i]?.replaceWith(Object.assign(document.createElement('img'), { src: canvas.toDataURL(), alt: '' })) } catch {} })
    for (const image of copy.querySelectorAll('img[src^="blob:"]')) image.setAttribute('src', await dataOf(image.getAttribute('src') ?? '').catch(() => ''))
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT), notes = /** @type {ChildNode[]} */ ([])
    while (walker.nextNode()) notes.push(/** @type {ChildNode} */ (walker.currentNode))
    notes.forEach((note) => note.remove())
    const state = shared(parse(source) ?? [], { given: new Map(), added: new Map(), lang, locales: intlLocales(lang) })
    const html = new XMLSerializer().serializeToString(copy).replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/, '')
      .replace(/<app-svg id="svg-(\d+)"><\/app-svg>/g, (_, i) => ((svg) => (/<svg[^>]*\sviewBox=/.test(svg) ? svg : svg.replace(/<svg([^>]*)\swidth="([\d.]+)"\s+height="([\d.]+)"/, '<svg$1 width="$2" height="$3" viewBox="0 0 $2 $3"')))(pictures[Number(i)]))
    return { html, css: await sheetOf(holder, faced),
      works: state.live || list.some((part) => /^app-(table|form)$/.test(part.tag)), charted: state.live && charts.some((one) => one.chart) }
  } finally {
    holder.remove()
  }
}

/** Text as HTML. @param {string} words */
const escaped = (words) => words.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
/** A module or data inert in a script block, whatever it holds: "</script" and "<!--" written as JavaScript reads them the same. @param {string} code */
const inert = (code) => code.replace(/<(\/script|!--)/gi, '\\x3C$1')
/** What the page's script reads: its source, its language's ways with numbers, whether it is dark and whether it moves, as Motion says here. @param {string} source */
const given = (source) => `<script type="application/json" id="parts">${JSON.stringify({ source, locales: intlLocales(locale.peek()), dark: theme.peek() === 'dark', still: still() }).replace(/</g, '\\u003c')}</script>`

/**
 * The page around what was drawn: the user's language and direction, the room's light or dark and look, its title and styles.
 * @param {string} title @param {{ html: string, css: string }} drawing @param {string} head more of its head @param {string} end what follows it
 */
const pageAround = (title, { html, css }, head, end) => ((lang) => /* html */ `<!doctype html>
<html lang="${lang}" dir="${dir(lang)}" data-theme="${theme.peek()}" data-look="${escaped(document.documentElement.dataset.look ?? '')}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${escaped(BRAND.name)}">${head}
<title>${escaped(title)}</title>
<style>${css.replace(/<\/(style)/gi, '<\\/$1')}</style>
<main class="prose">${html}</main>
${end}`)(locale.peek())

/**
 * A page of parts as a page of its own, for Download and another app: drawn, its styles and faces inside it, and where scripts run, live,
 * its modules inert in it until a few lines make each one a module and name it in an import map. @param {string} source frozen @param {string} title
 */
export async function pageOf(source, title) {
  const drawing = await drawn(source, true), names = [...Object.keys(MODULES), ...(drawing.charted ? ['echarts'] : [])]
  const modules = drawing.works ? await Promise.all(names.map(async (name) => `<script type="text/x-module" data-name="${name}">${inert(name === 'echarts' ? (await library()).text : named(await text(MODULES[name])))}</script>`)) : []
  const boot = `(()=>{const imports={};for(const s of document.querySelectorAll('script[type="text/x-module"]'))imports[s.dataset.name]=URL.createObjectURL(new Blob([s.textContent],{type:'text/javascript'}))
document.head.append(Object.assign(document.createElement('script'),{type:'importmap',textContent:JSON.stringify({imports})}));import('alive')})()`
  const policy = pagePolicy({ scripts: drawing.works, web: false, network: false, downloads: false, fullscreen: false, maps: false }, [], true)
  return pageAround(title, drawing, `\n<meta http-equiv="Content-Security-Policy" content="${policy}">`, drawing.works ? `${given(source)}\n${modules.join('\n')}\n<script>${boot}</script>\n` : '')
}

/**
 * A page of parts as the files of a site (D720), whose host runs its own files alone: the page drawn, and where it holds anything that works,
 * its modules beside it, importing each other by path. @param {string} source frozen @param {string} title @returns {Promise<Map<string, string>>}
 */
export async function siteOf(source, title) {
  const drawing = await drawn(source, false), files = new Map()
  if (drawing.works) for (const name of [...Object.keys(MODULES), ...(drawing.charted ? ['echarts'] : [])]) files.set(`${name}.js`, name === 'echarts' ? (await library()).text : named(await text(MODULES[name]), true))
  return files.set('index.html', pageAround(title, drawing, '', drawing.works ? `${given(source)}\n<script type="module" src="alive.js"></script>\n` : ''))
}
