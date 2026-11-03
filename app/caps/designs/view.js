// A design's view beside the conversation (D572), take 8 of the canvas "Designs proposal": the takes row above the page, deal
// after deal of three with no brain, more as it scrolls to its end, a take picked again putting moved parts back; the page, a button
// over each part, which picks it, its words changed in place on a double click or Enter, moved and resized by hand or with the keys
// (./move.js); one mark, a dot on any part that needs a look (a gap, a day that isn't its date's, faint words, a soft picture, the
// printer's margin), its fix beside it; the part's bar in the takes row's place (Ask Jean, held to talk, nudges, colour, alignment,
// Delete, and Jean's change to accept or reject, D505); the design's bar: Size, Colours, Type, Parts, the parts as fields, which a
// keyboard and a screen reader use best, and Add (words, a picture, a QR code, a shape, an ornament), anything but words going
// behind the words, which Arrange puts in front or at the back, or duplicates. A photo dropped or pasted on a picture takes its
// place. Each change is one ⌘Z step, written a moment later. lit-html, in Jean's own document.
import { html, nothing, render, svg } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { t, intlLocales, dir, locale } from '../../core/i18n.js'
import { app, notify, assistantName } from '../../ui/state.js'
import { reviewBar } from '../../ui/review.js'
import { icons, icon } from '../../ui/menu-icons.js'
import { toggleDictation } from '../../ui/dictation.js'
import { virtual } from '../../ui/virtual.js'
import { addFile } from '../../core/files.js'
import { paperFor } from '../made/formats.js'
import { book, shown, picked, write, suggested, makeWay } from './designs.js'
import { laid, takesOf, resized, marksOf, voicesFor, unitOf, colourOf, contrastOf, leadOf, weightOf, spot, added, stacked, formOf, pathsOf, onOf } from './layout.js'
import { FORMS, ART } from './tool.js'
import { pageOf, vars, laidOut, ART as drawn } from './page.js'
import { handles, drag, keyed, nudge } from './move.js'

/** @import { Design, Part } from './layout.js' */
/** @import { Kept } from './designs.js' */

// Undo's own arrow, a form's glyph, zoom out and in, higher and lower, and Add's shapes: only Designs draws them.
const undoIcon = icon(svg`<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3"/>`, 'flip-rtl'), formIcon = icon(svg`<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="12" cy="12" r="4.5"/>`)
const zoomOut = icon(svg`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6"/>`), zoomIn = icon(svg`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6M10.5 7.5v6"/>`), higher = icon(svg`<path d="M12 19V5M6 11l6-6 6 6"/>`), lower = icon(svg`<path d="M12 5v14M6 13l6 6 6-6"/>`)
const glyphs = /** @type {Record<string, unknown>} */ ({ rectangle: icon(svg`<rect x="4" y="6" width="16" height="12" fill="currentColor"/>`), rounded: icon(svg`<rect x="4" y="6" width="16" height="12" rx="4" fill="currentColor"/>`),
  circle: icon(svg`<circle cx="12" cy="12" r="7.5" fill="currentColor"/>`), frame: icon(svg`<rect x="4" y="6" width="16" height="12" rx="2"/>`), line: icon(svg`<path d="M4 12h16"/>`) })
/** The part whose words are being changed in place, whether the parts show as fields, the mark whose fix shows, a part shown as it was before Jean's change, what was last said, and a mark said as it comes. */
const editing = signal(''), fields = signal(false), fixing = signal(''), before = signal(''), said = signal(''), warned = signal('')
/** How many deals of three the takes row holds, and each take drawn with its page and what they were drawn from, so that neither a drag nor a scroll lays out a take again. */
const deals = signal(3); let dealt = { key: '', palettes: /** @type {unknown} */ (null), takes: /** @type {Map<number, { take: Design['take'], page: unknown }>} */ (new Map()) }
/** The designs before each change in this visit, and those undone. @type {Design[]} */
let undos = [], redos = /** @type {Design[]} */ ([])
/** The last change's kind, so that typing in one part is one step. */
let last = ''
let timer = 0

/** A change the user makes, as one ⌘Z step (typing in one part, one), at once on screen and written a moment later. @param {(design: Design) => Design} how @param {string} [kind] the same kind again joins the step before */
export function change(how, kind = '') {
  const one = shown.peek(); if (!one) return
  if (!kind || kind !== last) { undos = [...undos.slice(-49), one.design]; redos = [] }
  last = kind
  show({ ...one, design: { ...how(one.design), changed: new Date().toISOString() } })
}
/** A design on show at once, written a moment later. @param {Kept} one */
function show(one) {
  shown.value = one
  clearTimeout(timer)
  timer = setTimeout(() => { timer = 0; const now = shown.peek(); if (now) write(now).catch(console.warn) }, 300)
}
/** ⌘Z and ⇧⌘Z. @param {1 | -1} way */
function undo(way) {
  const one = shown.peek(), [from, to] = way < 0 ? [undos, redos] : [redos, undos], design = from.at(-1)
  if (!one || !design) return
  if (way < 0) undos = undos.slice(0, -1); else redos = redos.slice(0, -1)
  to.push(one.design)
  last = ''
  show({ ...one, design })
}

/** A part changed. @param {string} id @param {Partial<Part>} patch @param {string} [kind] */
export const changePart = (id, patch, kind) => change((design) => ({ ...design, parts: design.parts.map((part) => (part.id === id ? { ...part, ...patch, by: 'user', at: new Date().toISOString() } : part)) }), kind)
/** A part taken away. @param {string} id */
const remove = (id) => { change((design) => ({ ...design, parts: design.parts.filter((part) => part.id !== id) })); picked.value = ''; say(t('designs.removed')) }
/** Said to a screen reader, as a status, or as an alert. @param {string} words */
export const say = (words, to = said) => { to.value = ''; requestAnimationFrame(() => { to.value = words }) }
/** What a part is, as Add names it: a fact's role, words, a picture, a QR code, a shape's form or an ornament. @param {Part} part */
const kindOf = (part) => part.art ?? (part.role !== 'shape' ? part.role : part.line ? 'frame' : part.form ?? (part.radius ? 'rounded' : 'rectangle'))
/** A part's name, in the user's language. @param {Part} part */
export const nameOf = (part) => t(part.art ? `designs.art.${part.art}` : part.role === 'shape' ? `designs.shape.${kindOf(part)}` : `designs.role.${part.role}`)

/** A new part's id, of its role, numbered after the highest there. @param {Design} design @param {string} role */
const idFor = (design, role) => `${role}-${1 + Math.max(0, ...design.parts.map((part) => Number(part.id.startsWith(`${role}-`) && part.id.slice(role.length + 1)) || 0))}`
/** Words, a picture, a QR code, a shape or an ornament added where it goes (`spot`), anything but words behind them, picked: words to type in place, a QR code to say what it opens. @param {string} kind a role, a shape or an ornament @param {Partial<Part>} [more] */
function add(kind, more = {}) {
  const one = shown.peek(); if (!one) return
  const role = ['text', 'picture', 'qr'].includes(kind) ? kind : 'shape', unit = unitOf(one.design.page)
  const part = /** @type {Part} */ ({ id: idFor(one.design, kind), role, box: spot(one.design, kind), added: true, by: 'user', at: new Date().toISOString(),
    ...(role === 'text' ? { text: t('designs.newWords'), size: unit * 5, align: 'center', color: 'ink' } : role === 'shape' ? { fill: 'accent', ...formOf(kind, unit) } : {}), ...more })
  change((design) => ({ ...design, parts: added(design.parts, part) }))
  picked.value = part.id
  say(t('designs.added', { part: nameOf(part) }))
  if (role === 'text') editing.value = part.id
  if (role === 'qr') edit(part)
}
/** A copy of a part over it, a little lower and toward the end, picked; a fact's words the user's own. @param {Part} part */
function duplicate(part) {
  const one = shown.peek(), step = one ? unitOf(one.design.page) * 3 : 0, role = part.text === undefined ? part.role : 'text'
  if (!one) return
  const copy = /** @type {Part} */ ({ ...part, id: idFor(one.design, role === 'shape' ? kindOf(part) : role), role, added: true, moved: true, region: undefined, by: 'user', at: new Date().toISOString(),
    box: [part.box[0] + (dir(one.design.lang) === 'rtl' ? -step : step), part.box[1] + step, part.box[2], part.box[3]] })
  change((design) => { const at = design.parts.findIndex((each) => each.id === part.id) + 1; return { ...design, parts: [...design.parts.slice(0, at), copy, ...design.parts.slice(at)] } })
  picked.value = copy.id
  say(t('designs.added', { part: nameOf(copy) }))
}
/** A part over all the others, or behind them all but the layout's own shapes. @param {Part} part @param {string} way front or back */
const restack = (part, way) => { change((design) => ({ ...design, parts: stacked(design.parts, part.id, way) })); say(t('designs.moved', { part: nameOf(part) })) }

/** A photo from the device, the files dropped or pasted, into a picture's place or as a new picture. @param {File | undefined} file @param {string} [into] a picture part's id */
async function photo(file, into) {
  if (!file || !/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) return file && notify(t('designs.notPicture'), { alert: true })
  const bytes = new Uint8Array(await file.arrayBuffer()), bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return notify(t('designs.notPicture'), { alert: true })
  const link = await addFile(app.fs, { projectDir: shown.peek()?.dir ?? app.projectDir, name: file.name || 'photo.png', mimeType: file.type, bytes, pages: [], by: 'user' })
  const px = [bitmap.width, bitmap.height]
  if (into) return changePart(into, { file: link.uri, px, words: shown.peek()?.design.parts.find((part) => part.id === into)?.words || file.name })
  const one = shown.peek(), w = (one?.design.page.w ?? 0) * 0.5
  add('picture', { file: link.uri, px, words: file.name, box: [w / 2, (one?.design.page.h ?? 0) / 2 - (w * px[1]) / px[0] / 2, w, (w * px[1]) / px[0]] })
}
/** The device's own file picker, for a photo. @param {string} [into] */
function pick(into) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif' })
  input.addEventListener('change', () => photo(input.files?.[0], into))
  input.click()
}
/** A part opened to change, with Enter or a double click: its words in place, a picture's photo from the device, what a QR code opens. @param {Part} part */
function edit(part) {
  if (part.text !== undefined) editing.value = part.id
  else if (part.role === 'picture') pick(part.id)
  else if (part.role === 'qr') { fixing.value = part.id; requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('.design-pop input'))?.focus()) }
}

/** What a mark says, and its fixes, beside its field or over the page; fixed, the keys go back to the field or the part. @param {Design} design @param {import('./checks.js').Mark} mark @param {string} where field or pop */
function fixOf(design, mark, where) {
  const part = design.parts.find((one) => one.id === mark.part), quiet = () => change((now) => ({ ...now, quiet: [...(now.quiet ?? []), `${mark.kind}:${mark.part}`] })), id = `design-${where}-${mark.part}`
  const done = () => { fixing.value = ''; requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(where === 'pop' ? `[data-hit="${mark.part}"]` : `#design-field-${mark.part}`))?.focus()) }
  const keep = html`<button type="button" class="button" @click=${() => { quiet(); done() }}>${t('designs.fix.keep')}</button>`
  if (!part) return nothing
  const fix = (/** @type {string} */ label, /** @type {() => void} */ act) => html`<button type="button" class="button primary" @click=${() => { act(); done() }}>${label}</button>`
  if (part.role === 'qr') {
    const set = (/** @type {Event} */ e) => changePart(part.id, { link: /** @type {HTMLInputElement} */ (e.target).value.trim() }, `link:${part.id}`)
    return html`<label for=${id}>${t('designs.mark.qr')}<input id=${id} dir="auto" .value=${part.link ?? ''} @change=${set}
      @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && !e.isComposing) { set(e); done() } }}></label><div>${fix(t('designs.fix.remove'), () => remove(part.id))}</div>`
  }
  if (mark.kind === 'gap' && part.role === 'picture') return html`<p>${t('designs.mark.picture')}</p><div>${fix(t('designs.photo'), () => pick(part.id))}${fix(t('designs.fix.remove'), () => remove(part.id))}</div>`
  if (mark.kind === 'gap') {
    const fill = (/** @type {string} */ words) => changePart(part.id, { text: (part.text ?? '').replace(mark.gap ?? '', words).replace(/[ \t]{2,}/g, ' ').trim() })
    return html`<label for=${id}>${t('designs.mark.gap')}<input id=${id} dir="auto" placeholder=${(mark.gap ?? '').slice(1, -1)} @keydown=${(/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' && !e.isComposing && /** @type {HTMLInputElement} */ (e.target).value.trim()) { fill(/** @type {HTMLInputElement} */ (e.target).value.trim()); done() } }}></label>
      <div>${fix(t('designs.fix.remove'), () => fill(''))}</div>`
  }
  if (mark.kind === 'weekday') return html`<p>${t('designs.mark.weekday')}</p><div>${fix(t('designs.fix.use', { words: mark.fix ?? '' }), () => changePart(part.id, { text: mark.fix }))}${keep}</div>`
  if (mark.kind === 'faint') {
    const on = onOf(design, part), best = ['ink', 'accent', 'accent2', 'ground'].sort((a, b) => contrastOf(design, b, on) - contrastOf(design, a, on))[0]
    return html`<p>${t('designs.mark.faint')}</p><div>${fix(t('designs.fix.readable'), () => changePart(part.id, { color: best }))}${keep}</div>`
  }
  if (mark.kind === 'margin') {
    const edge = design.page.mm ? 50 : unitOf(design.page) * 3, [x, y, w, h] = part.box, { w: pw, h: ph } = design.page
    const inside = [Math.min(Math.max(x, edge), pw - edge - Math.min(w, pw - 2 * edge)), Math.min(Math.max(y, edge), ph - edge - Math.min(h, ph - 2 * edge)), Math.min(w, pw - 2 * edge), Math.min(h, ph - 2 * edge)]
    return html`<p>${t('designs.mark.margin')}</p><div>${fix(t('designs.fix.inside'), () => changePart(part.id, { box: inside, moved: true }))}${keep}</div>`
  }
  return html`<p>${t(`designs.mark.${mark.kind}`)}</p><div>${keep}</div>`
}

/** One of a menu's rows, ticked when it is the one chosen; chosen from a part's menu, that menu closes too. @param {string} menu @param {boolean} on @param {unknown} label @param {() => void} act */
const row = (menu, on, label, act) => html`<button type="button" role="menuitemradio" aria-checked=${String(on)} popovertarget=${menu} popovertargetaction="hide" @click=${() => { act(); /** @type {HTMLElement | null} */ (document.querySelector('#design-context:popover-open'))?.hidePopover() }}>${icons.check}${label}</button>`
/** A palette's colours, as swatches. @param {Record<string, string>} colours */
const swatches = (colours) => html`<span class="design-swatches" aria-hidden="true">${['ground', 'accent', 'accent2', 'ink'].map((name) => html`<span ${vars({ '--swatch': colours[name] })}></span>`)}</span>`

/** What can be done to a part, for its bar and its menu: each a name, a glyph, and what it does or the bar's menu it opens. @param {Part} part */
function actionsOf(part) {
  const words = part.text !== undefined, act = (/** @type {string} */ label, /** @type {unknown} */ glyph, run = () => {}, menu = '') => ({ label: t(label, { name: assistantName() }), glyph, run, menu })
  return /** @type {Record<string, ReturnType<typeof act> | false>} */ ({ ask: act('designs.askJean', icons.mic, () => ask(part)), bigger: act('designs.bigger', zoomIn, () => nudge(part, 'bigger')), smaller: act('designs.smaller', zoomOut, () => nudge(part, 'smaller')), up: act('designs.higher', higher, () => nudge(part, 'up')), down: act('designs.lower', lower, () => nudge(part, 'down')), colour: (words || part.role === 'shape') && act('designs.colour', icons.palette, undefined, `design-colour-${part.id}`),
    align: words && act('designs.align', icons.list, undefined, 'design-align'), form: (part.role === 'picture' || (part.role === 'shape' && !part.art && part.form !== 'line')) && act('designs.role.shape', formIcon, undefined, 'design-form'), replace: (part.role === 'picture' || part.role === 'qr') && act('designs.replace', icons.image, () => edit(part)), arrange: act('designs.arrange', icons.layers, undefined, 'design-arrange'),
    duplicate: act('designs.duplicate', icons.copy, () => duplicate(part)), front: act('designs.front', nothing, () => restack(part, 'front')), back: act('designs.back', nothing, () => restack(part, 'back')), remove: act('action.delete', icons.trash, () => remove(part.id)) })
}

/** The part's bar, one row of buttons named by their tips, each menu next after its button: Ask Jean, held to talk, zoom out and in, its colour, alignment and form, a picture replaced, Arrange, Delete; or Jean's change. @param {Kept} one @param {Part} part */
function partBar(one, part) {
  const jean = one.side?.parts[part.id] !== undefined, words = part.text !== undefined, design = suggested(one), menu = `design-colour-${part.id}`, all = actionsOf(part), button = (/** @type {string} */ key) => { const it = all[key]; return it ? html`<button type="button" class="icon-button" aria-label=${it.label} popovertarget=${it.menu || nothing} @click=${it.run}>${it.glyph}</button>` : nothing }
  const menus = /** @type {Record<string, unknown>} */ ({ colour: (words || part.role === 'shape') && html`<div id=${menu} class="menu design-menu" role="menu" popover>${['ink', 'accent', 'accent2', 'ground'].map((name) => row(menu, (words ? part.color : part.fill) === name, html`<i class="design-swatch" ${vars({ '--swatch': colourOf(design, name) })}></i>${t(`designs.colours.${name}`)}`, () => changePart(part.id, words ? { color: name } : { fill: name })))}</div>`,
    align: words && html`<div id="design-align" class="menu design-menu" role="menu" popover>${['start', 'center', 'end'].map((align) => row('design-align', (part.align ?? 'center') === align, t(`designs.align.${align}`), () => changePart(part.id, { align })))}</div>`,
    form: all.form && html`<div id="design-form" class="menu design-menu" role="menu" popover>${['rectangle', 'rounded', 'circle'].map((kind) => row('design-form', kind === (part.form === 'circle' ? 'circle' : part.radius ? 'rounded' : 'rectangle'), t(`designs.shape.${kind}`), () => changePart(part.id, formOf(kind, unitOf(design.page)))))}</div>`,
    arrange: html`<div id="design-arrange" class="menu design-menu" role="menu" popover>${['duplicate', 'front', 'back'].map((key) => { const it = /** @type {{ label: string, run: () => void }} */ (all[key]); return html`<button type="button" role="menuitem" popovertarget="design-arrange" popovertargetaction="hide" @click=${it.run}>${it.label}</button>` })}</div>` })
  return html`<div class="design-part-bar" role="group" aria-label=${nameOf(part)}>
    ${jean ? html`<p class="design-note" dir="auto">${one.side?.notes[part.id] ?? t('designs.jean', { name: assistantName() })}</p>
      <button type="button" class="button" aria-pressed=${String(before.value === part.id)} @click=${() => { before.value = before.peek() === part.id ? '' : part.id }}>${t('designs.before')}</button>
      <button type="button" class="button" @click=${() => decide(one, [part.id], false)}>${t('designs.reject')}</button>
      <button type="button" class="button primary" @click=${() => decide(one, [part.id], true)}>${t('designs.accept')}</button>`
    : html`<button type="button" class="icon-button design-ask" aria-label=${t('designs.askJean', { name: assistantName() })} aria-describedby="design-hold" @click=${() => ask(part)} @pointerdown=${() => hold(part)} @contextmenu=${(/** @type {Event} */ e) => e.preventDefault()}>${icons.mic}<span id="design-hold" hidden>${t('designs.hold')}</span></button>
      <span class="design-zoom">${button('smaller')}${button('bigger')}</span>${['colour', 'align', 'form', 'replace', 'arrange'].map((key) => html`${button(key)}${menus[key] || nothing}`)}<span class="design-gap" aria-hidden="true"></span>${button('remove')}`}
  </div>`
}
/** A part's menu on a right click, at the pointer, or at the part from the keyboard (no button), its first row focused, once a held button is up (which would close it); next after the part in the keys' order. @param {MouseEvent} event @param {Part} part */
function context(event, part) {
  event.preventDefault(); picked.value = part.id; const hit = /** @type {HTMLElement} */ (event.currentTarget), stage = /** @type {HTMLElement} */ (hit.closest('.design-stage')), at = stage.getBoundingClientRect(), keys = event.button < 0 || (!event.clientX && !event.clientY), box = hit.getBoundingClientRect()
  const [x, y] = keys ? [box.left + box.width / 2, box.top + box.height / 2] : [event.clientX, event.clientY], spot = /** @type {HTMLElement} */ (stage.querySelector('.design-spot')), menu = /** @type {HTMLElement} */ (stage.querySelector('#design-context'))
  spot.style.setProperty('--x', `${getComputedStyle(stage).direction === 'rtl' ? at.right - x : x - at.left}px`); spot.style.setProperty('--y', `${y - at.top + stage.scrollTop}px`); const open = () => { menu.showPopover(); if (keys) /** @type {HTMLElement | null} */ (menu.querySelector('button'))?.focus() }; if (event.buttons) addEventListener('pointerup', open, { once: true }); else open()
}
/** The part's menu: what its bar does in groups, and Higher and Lower, so that nothing needs a drag; or Jean's change. @param {Kept} one @param {Part} part */
function contextOf(one, part) {
  const all = actionsOf(part), jean = one.side?.parts[part.id] !== undefined, rows = jean ? [] : ['ask', '', 'bigger', 'smaller', 'up', 'down', '', 'colour', 'align', 'form', 'replace', '', 'duplicate', 'front', 'back', '', 'remove']
  return html`<div id="design-context" class="menu design-menu design-context" role="menu" dir=${dir()} popover>${jean ? [['designs.before', () => { before.value = before.peek() === part.id ? '' : part.id }], ['designs.reject', () => decide(one, [part.id], false)], ['designs.accept', () => decide(one, [part.id], true)]] .map(([label, run]) => html`<button type="button" role="menuitem" popovertarget="design-context" popovertargetaction="hide" @click=${run}>${t(/** @type {string} */ (label))}</button>`)
    : rows.map((key) => { const it = all[key]; return key ? it ? html`<button type="button" role="menuitem" popovertarget=${it.menu || 'design-context'} popovertargetaction=${it.menu ? 'show' : 'hide'} @click=${it.run}>${it.glyph}${it.label}</button>` : nothing : html`<hr>` })}</div>`
}

/** Ask Jean: the part pointed at, which the brain hears of with the next message, said in a toast, and the box; where the pane covers the conversation, it makes way for the box first. @param {Part} part */
async function ask(part) {
  picked.value = part.id
  await makeWay(part.id)
  document.getElementById('prompt')?.focus()
  notify(t('designs.pointed', { part: nameOf(part) }))
}
/** Ask Jean held: asked, and the box listening (dictation, D26) until it is let go, its words there to send; a tap only asks. @param {Part} part */
function hold(part) {
  let listening = /** @type {Promise<void> | null} */ (null)
  const timer = setTimeout(() => { listening = ask(part).then(toggleDictation) }, 400), stop = new AbortController()
  const up = () => { clearTimeout(timer); listening?.then(toggleDictation); stop.abort() }
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, up, { signal: stop.signal })
}

/** Jean's changes to the parts given accepted, as the user's own from now on, or rejected. @param {Kept} one @param {string[]} ids @param {boolean} yes */
function decide(one, ids, yes) {
  if (!one.side) return
  const parts = Object.fromEntries(Object.entries(one.side.parts).filter(([id]) => !ids.includes(id))), notes = Object.fromEntries(Object.entries(one.side.notes).filter(([id]) => !ids.includes(id)))
  const taken = Object.fromEntries(Object.entries(one.side.parts).filter(([id]) => ids.includes(id)))
  const all = Object.keys(parts).length === 0, design = yes ? suggested({ ...one, side: { parts: taken, notes: {}, ...(all && one.side.voice && { voice: one.side.voice }) } }) : one.design
  undos = [...undos.slice(-49), one.design]
  before.value = ''
  show({ ...one, design, side: all ? null : { ...one.side, parts, notes } })
}

/** A part's words as typed, one ⌘Z step while typing in it, and once an IME's composition ends, never during it; a mark they bring said as an alert, where no field shows its fix. @param {Part} part */
const typed = (part) => (/** @type {InputEvent | CompositionEvent} */ e) => { const marked = () => marksHere(suggested(/** @type {Kept} */ (shown.peek()))).find((mark) => mark.part === part.id), was = marked()
  if (!(e instanceof InputEvent && e.isComposing)) { changePart(part.id, { text: /** @type {HTMLTextAreaElement} */ (e.target).value }, `type:${part.id}`); const now = !fields.peek() && !was && marked(); if (now) say(t(`designs.mark.${now.kind}`), warned) } }

/** Parts: its fields shown, or slid away before they go, staying if pressed again as they go. @param {Event} event */
const toggleFields = (event) => { const box = /** @type {HTMLElement} */ (event.currentTarget).closest('.design')?.querySelector('.design-fields'), gone = () => { if (box?.classList.contains('is-leaving')) fields.value = false }; if (!box) fields.value = true; else if (box.classList.toggle('is-leaving')) Promise.allSettled(box.getAnimations().map((run) => run.finished)).then(gone) }
/** The fields, a part each in reading order: its words to change, a picture's to replace, and its mark. @param {Design} design @param {import('./checks.js').Mark[]} marks */
const fieldsOf = (design, marks) => html`<section class="design-fields" aria-label=${t('designs.parts')}>${design.parts.filter((part) => part.role !== 'shape').map((part) => {
  const mark = marks.find((one) => one.part === part.id), id = `design-field-${part.id}`
  return html`<div class="design-field ${mark ? 'is-marked' : ''}">
    ${part.text !== undefined ? html`<label for=${id}><span>${nameOf(part)}${mark ? html` <span class="design-dot" aria-hidden="true"></span>` : nothing}</span>
      <textarea id=${id} dir="auto" rows="1" .value=${live(part.text)} @focus=${() => { picked.value = part.id }} @input=${typed(part)} @compositionend=${typed(part)}></textarea></label>`
    : html`<span>${nameOf(part)}</span><span dir="auto" class="design-about">${part.words ?? part.link ?? ''}</span>${mark ? nothing : html`<button type="button" class="button" @click=${() => edit(part)}>${t(part.file || part.link ? 'designs.replace' : 'designs.photo')}</button>`}`}
    ${mark ? html`<div class="design-fix" role="alert">${fixOf(design, mark, 'field')}</div>` : nothing}
  </div>`
})}</section>`

/** A page of each size, drawn to its shape. */
const tall = icon(svg`<rect x="6" y="3.5" width="12" height="17" rx="1.5"/>`), sizeIcon = (/** @type {string} */ size) => ({ square: icon(svg`<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>`), story: icon(svg`<rect x="7.25" y="3.5" width="9.5" height="17" rx="1.5"/>`), wide: icon(svg`<rect x="3.5" y="7.25" width="17" height="9.5" rx="1.5"/>`) })[size] ?? tall
/** The design's bar, one row of buttons named by their tips: Size, Colours, Type, Parts with how many marks there are, Add, Undo. @param {Design} design @param {number} marked */
function bar(design, marked) {
  const sizes = ['a5', 'a6', paperFor(intlLocales()[0]), 'square', 'story', 'wide'], palette = book.palettes.find((one) => one.id === design.take[1])
  return html`<div class="design-bar">
    <button type="button" class="icon-button" popovertarget="design-size" aria-label=${t(`designs.size.${design.size}`)}>${sizeIcon(design.size)}</button>
    <div id="design-size" class="menu design-menu" role="menu" popover>${sizes.map((size) => row('design-size', design.size === size, html`${sizeIcon(size)}${t(`designs.size.${size}`)}`, () => change((now) => resized(book, now, size))))}</div>
    <button type="button" class="icon-button is-wide" popovertarget="design-colours" aria-label=${t('designs.colours')}>${swatches(design.colours)}</button>
    <div id="design-colours" class="menu design-menu" role="menu" popover>${book.palettes.map((one) => row('design-colours', palette?.id === one.id, html`${swatches(one)}${t(`designs.palette.${one.id}`)}`,
      () => change((now) => ({ ...now, take: [now.take[0], one.id, now.take[2]], colours: { ground: one.ground, ink: one.ink, accent: one.accent, accent2: one.accent2 } }))))}</div>
    <button type="button" class="icon-button" popovertarget="design-type" aria-label=${t(`designs.voice.${design.voice}`)}><b class="v-${design.voice}">Aa</b></button>
    <div id="design-type" class="menu design-menu" role="menu" popover>${voicesFor(design.lang).map((voice) => row('design-type', design.voice === voice, html`<b class="v-${voice}">Aa</b>${t(`designs.voice.${voice}`)}`,
      () => change((now) => ({ ...now, voice, parts: now.parts.map((part) => (part.role === 'small' || !part.voice ? part : { ...part, voice: undefined })) }))))}</div>
    <span class="design-gap" aria-hidden="true"></span>
    <button type="button" class="icon-button is-wide" aria-pressed=${String(fields.value)} aria-label=${marked ? `${t('designs.parts')} ${new Intl.NumberFormat(intlLocales()).format(marked)}` : t('designs.parts')} aria-describedby=${marked ? 'design-look' : nothing} @click=${toggleFields}>${icons.list}${marked
      ? html`<span class="design-count">${new Intl.NumberFormat(intlLocales()).format(marked)}</span><span id="design-look" hidden>${t('designs.look', { count: marked })}</span>` : nothing}</button>
    <button type="button" class="icon-button" popovertarget="design-add" aria-label=${t('designs.add')}>${icons.plus}</button>
    <div id="design-add" class="menu design-menu design-adds" popover><ul>${[['designs.role.text', () => add('text')], ['designs.role.picture', () => pick()], ['designs.role.qr', () => add('qr')]]
      .map(([label, act]) => html`<li><button type="button" popovertarget="design-add" popovertargetaction="hide" @click=${act}>${t(/** @type {string} */ (label))}</button></li>`)}</ul>
      ${[['designs.shapes', FORMS], ['designs.ornaments', ART]].map(([label, kinds]) => html`<p id="design-${label.slice(8)}">${t(/** @type {string} */ (label))}</p><ul class="design-glyphs" aria-labelledby="design-${label.slice(8)}">
        ${/** @type {string[]} */ (kinds).map((kind) => html`<li><button type="button" class="icon-button" popovertarget="design-add" popovertargetaction="hide" aria-label=${t(FORMS.includes(kind) ? `designs.shape.${kind}` : `designs.art.${kind}`)}
          @click=${() => add(kind)}>${glyphs[kind] ?? html`<svg class="design-glyph" viewBox="0 0 100 100" aria-hidden="true">${pathsOf(design, { id: '', role: 'shape', box: [], fill: 'accent', art: kind }, drawn).map(({ d, fill, stroke, width }) => svg`<path
            d=${d} fill=${fill} stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-linejoin="round"/>`)}</svg>`}</button></li>`)}</ul>`)}</div>
    <button type="button" class="icon-button" aria-label=${t('designs.undo')} aria-disabled=${String(!undos.length)} @click=${() => undo(-1)}>${undoIcon}</button>
  </div>`
}

/** The first mark shown, its part picked, from the pane's menu. */
export const look = () => { const one = shown.peek(), mark = one && marksHere(suggested(one))[0]; if (mark) { picked.value = mark.part; fixing.value = mark.part } }
/** Each mark of the design, but those the user kept. @param {Design} design */
export const marksHere = (design) => marksOf(design, new Date()).filter((mark) => !design.quiet?.includes(`${mark.kind}:${mark.part}`))

/** The takes row's arrows: the next take or the one before picked, as radios are, another deal past the last; left and right as the language reads. @param {KeyboardEvent} event */
function arrows(event) {
  const row = /** @type {HTMLElement} */ (event.currentTarget), at = Number(/** @type {HTMLElement} */ (event.target).getAttribute('aria-posinset')) - 1
  const step = /** @type {Record<string, number>} */ ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 })[event.key], flip = /Left|Right/.test(event.key) && getComputedStyle(row).direction === 'rtl' ? -1 : 1
  if (at < 0 || !step) return
  event.preventDefault(); const to = Math.max(0, at + step * flip); if (to >= deals.peek() * 3) deals.value++
  const next = /** @type {HTMLElement | null} */ (row.querySelector(`[aria-posinset="${to + 1}"]`)); next?.focus(); next?.click()
}

/**
 * The takes, one row, deal after deal as it is scrolled sideways, those in view drawn (D627), each laid out once; the one like the
 * design's checked and tabbable, else the first drawn; one picked keeps its deal, which the row reaches again. @param {Design} design
 */
function takesRow(design) {
  const key = JSON.stringify([design.take, design.size, design.lang, design.parts.map((part) => (part.added ? part : { ...part, box: 0, moved: 0, size: 0, color: 0 }))])
  if (dealt.key !== key || dealt.palettes !== book.palettes) dealt = { key, palettes: book.palettes, takes: new Map() }
  const at = takesOf(book, design, design.deal).findIndex((take) => take.join() === design.take.join()), on = at < 0 ? -1 : design.deal * 3 + at
  const takeAt = (/** @type {number} */ i) => { const take = takesOf(book, design, Math.floor(i / 3))[i % 3], one = { take, page: pageOf(laid(book, { ...design, take })) }; dealt.takes.set(i, one); return one }
  return virtual({ count: deals.value * 3, x: true, at: on, more: () => { deals.value++ }, draw: (i, from, to) => {
    const { take, page } = dealt.takes.get(i) ?? takeAt(i)
    return html`<li class="design-take" role="radio" aria-posinset=${i + 1} aria-setsize="-1" aria-checked=${String(i === on)} tabindex=${i === (on >= from && on < to ? on : from) ? 0 : -1} aria-label=${t(`designs.layout.${take[0]}`)}
      @click=${() => { change((now) => laid(book, { ...now, take, deal: Math.floor(i / 3) })); say(t('designs.picked', { take: t(`designs.layout.${take[0]}`) })) }}
      @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); /** @type {HTMLElement} */ (e.currentTarget).click() } }}>${page}</li>`
  } })
}

/** The view: what is on show, drawn. @param {Kept} one */
function draw(one) {
  const design = suggested(one), drawn = before.value ? { ...design, parts: design.parts.map((part) => (part.id === before.value ? one.design.parts.find((was) => was.id === part.id) ?? part : part)) } : design
  const marks = marksHere(design), part = design.parts.find((each) => each.id === picked.value)
  // A mark's fix, or a QR code's words to change.
  const fix = marks.find((mark) => mark.part === fixing.value) ?? (design.parts.find((each) => each.id === fixing.value)?.role === 'qr' ? /** @type {const} */ ({ part: fixing.value, kind: 'gap' }) : undefined)
  const count = one.side ? Object.keys(one.side.parts).length : 0, { w, h } = design.page
  // A mark's dot halfway down its part's end, its words' end, so that it sits by the part's own words and not between two parts.
  const dot = (/** @type {Part} */ each) => ({ '--x': `${((dir(design.lang) === 'rtl' ? each.box[0] : each.box[0] + each.box[2]) / w) * 100}%`, '--y': `${((each.box[1] + each.box[3] / 2) / h) * 100}%` })
  const place = (/** @type {Part} */ each) => ({ '--x': `${(each.box[0] / w) * 100}%`, '--y': `${(each.box[1] / h) * 100}%`, '--w': `${(each.box[2] / w) * 100}%`, '--h': `${(each.box[3] / h) * 100}%` })
  // A part's ring of two tones, its outer one black or white, whichever stands further from the design's ground, so that one always shows.
  const [ring, halo] = contrastOf(design, '#111111') >= contrastOf(design, '#ffffff') ? ['#111111', '#ffffff'] : ['#ffffff', '#111111']
  return html`${count ? reviewBar({ label: t('designs.review'), count: t('designs.changed', { count }), previous: '', next: '', acceptAll: t('designs.acceptAll'), rejectAll: t('designs.rejectAll'),
      accept: () => decide(one, Object.keys(one.side?.parts ?? {}), true), reject: () => decide(one, Object.keys(one.side?.parts ?? {}), false) }) : nothing}
    <div class="design-top"><div class="design-row"><ul class="design-takes" role="radiogroup" aria-label=${t('designs.takes')} @keydown=${arrows} ${vars({ '--r': String(w / h) })}>${takesRow(design)}</ul></div>
    ${part ? partBar(one, part) : nothing}</div>
    <div class="design-stage" @pointerdown=${(/** @type {PointerEvent} */ e) => /** @type {Element} */ (e.target).matches('.design-stage, .design-sheet, .design-over') && (picked.value = '', editing.value = '')}
      @dragover=${(/** @type {DragEvent} */ e) => e.preventDefault()} @drop=${(/** @type {DragEvent} */ e) => {
      e.preventDefault()
      const on = /** @type {HTMLElement | null} */ (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hit]'))
      photo(e.dataTransfer?.files[0], on && design.parts.find((each) => each.id === on.dataset.hit)?.role === 'picture' ? on.dataset.hit : undefined)
    }}>
      <div class="design-sheet">${pageOf(editing.value ? { ...drawn, parts: drawn.parts.map((each) => (each.id === editing.value ? { ...each, text: '' } : each)) } : drawn, html`<div class="design-over" lang=${locale.value} ${vars({ '--ring': ring, '--halo': halo })}>
        ${design.parts.map((each) => html`<button type="button" class="design-hit ${one.side?.parts[each.id] ? 'is-jean' : ''}" data-hit=${each.id} ${vars(place(each))} aria-pressed=${String(each.id === picked.value)}
          @pointerdown=${(/** @type {PointerEvent} */ e) => drag(e, each)} @dblclick=${() => edit(each)} @contextmenu=${(/** @type {MouseEvent} */ e) => context(e, each)}
          @keydown=${(/** @type {KeyboardEvent} */ e) => keyed(e, each, () => edit(each))} @focus=${() => { picked.value = each.id }}>
          <span class="visually-hidden">${nameOf(each)}${each.text ? html`, <span class="visually-hidden" lang=${design.lang}>${each.text}</span>` : nothing}</span></button>${each === part ? contextOf(one, part) : nothing}`)}
        ${editing.value && design.parts.find((each) => each.id === editing.value)?.text !== undefined ? editor(design, /** @type {Part} */ (design.parts.find((each) => each.id === editing.value))) : nothing}
        ${part ? handles(design, part) : nothing}
        ${marks.map((mark, i) => (marks.findIndex((each) => each.part === mark.part) === i ? html`<button type="button" class="design-dot" data-mark=${mark.part} ${vars(dot(/** @type {Part} */ (design.parts.find((each) => each.id === mark.part))))}
          aria-label=${t('designs.marked', { part: nameOf(/** @type {Part} */ (design.parts.find((each) => each.id === mark.part))) })} @click=${() => { picked.value = mark.part; fixing.value = fixing.peek() === mark.part ? '' : mark.part; requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('.design-pop :is(input, button)'))?.focus()) }}></button>` : nothing))}
        <div class="design-guides"></div></div>`)}</div>
      <div class="design-spot"></div>
      ${fix ? html`<div class="design-fix design-pop" role="dialog" aria-label=${nameOf(/** @type {Part} */ (design.parts.find((each) => each.id === fix.part)))}>${fixOf(design, fix, 'pop')}</div>` : nothing}
    </div>
    ${fields.value ? fieldsOf(design, marks) : nothing}
    ${bar(design, new Set(marks.map((mark) => mark.part)).size)}
    <p class="visually-hidden" role="status">${said.value}</p><p class="visually-hidden" role="alert">${warned.value}</p>`
}

/** A part's words changed in place: a box over it in its own type, which Escape or leaving puts away. @param {Design} design @param {Part} part */
function editor(design, part) {
  const { w, h } = design.page
  return html`<textarea class="design-edit design-words v-${part.voice ?? design.voice}" data-align=${part.align ?? 'center'} dir="auto" title=${nameOf(part)} .value=${live(part.text ?? '')}
    ${vars({ '--x': `${(part.box[0] / w) * 100}%`, '--y': `${(part.box[1] / h) * 100}%`, '--w': `${(part.box[2] / w) * 100}%`, '--h': `${(part.box[3] / h) * 100}%`,
      '--size': `${((part.size ?? 0) / w) * 100}cqi`, '--lead': String(leadOf(design, part)), '--weight': String(weightOf(design, part)), '--pen': colourOf(design, part.color) })}
    @input=${typed(part)} @compositionend=${typed(part)}
    @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && !e.isComposing) { e.stopPropagation(); editing.value = ''; /** @type {HTMLElement | null} */ (document.querySelector(`[data-hit="${part.id}"]`))?.focus() } }}
    @blur=${() => { if (editing.peek() === part.id) editing.value = '' }}></textarea>`
}

/** The view, drawn from the design on show, let go with it. @param {(() => void)[]} holds */
export function view(holds) {
  const box = Object.assign(document.createElement('div'), { className: 'design' })
  undos = []; redos = []; last = ''; deals.value = Math.max(3, (shown.peek()?.design.deal ?? 0) + 2); dealt = { ...dealt, key: '' }
  // Words that run out of their part, as text spacing of the reader's own makes them, fitted again as a save does, on screen alone, the file left as it is
  // until the person changes it; not while a change waits to be written or a part is held.
  let fitted = /** @type {Kept | null} */ (null); const out = (/** @type {Element} */ part) => { const words = /** @type {HTMLElement} */ (part.firstElementChild); return words.scrollWidth > words.clientWidth + 1 || words.offsetHeight > part.clientHeight + 1 }
  const fits = new ResizeObserver(() => { const one = shown.peek(); if (one && one !== fitted && !timer && !box.querySelector('.design-over :active') && [...box.querySelectorAll('.design-sheet .design-part.design-words')].some(out)) { fitted = one; laidOut(one.design, book).then(({ design }) => { if (shown.peek() === one) shown.value = fitted = { ...one, design } }, console.warn) } })
  holds.push(effect(() => {
    const one = shown.value
    render(one ? draw(one) : nothing, box)
    for (const words of box.querySelectorAll('.design-sheet .design-part.design-words > p')) fits.observe(words)
    if (editing.value) /** @type {HTMLTextAreaElement | null} */ (box.querySelector('.design-edit:not(:focus)'))?.focus()
  }))
  holds.push(() => { const now = shown.peek(); if (now && timer) write(now).catch(console.warn); clearTimeout(timer); timer = 0; editing.value = ''; fixing.value = ''; fields.value = false; fits.disconnect() })
  box.addEventListener('keydown', (event) => {
    const target = /** @type {HTMLElement} */ (event.target), from = fixing.peek()
    // Escape picks none, closes a menu alone or puts the words away, never the pane while something is picked; from a mark's fix, back to its dot.
    if (event.key === 'Escape' && (box.querySelector(':popover-open') || picked.peek() || from)) { event.stopPropagation(); if (!box.querySelector(':popover-open')) { fixing.value = ''; picked.value = ''; if (target.closest('.design-pop')) /** @type {HTMLElement | null} */ (box.querySelector(`.design-dot[data-mark="${from}"]`))?.focus() } }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !target.matches('textarea, input')) { event.preventDefault(); undo(event.shiftKey ? 1 : -1) }
    if (['Delete', 'Backspace'].includes(event.key) && target.matches('[data-hit]') && picked.peek()) { event.preventDefault(); remove(picked.peek()) }
    // ⌘D duplicates the part picked.
    const part = shown.peek()?.design.parts.find((each) => each.id === picked.peek())
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && target.matches('[data-hit]') && part) { event.preventDefault(); duplicate(part) }
  })
  box.addEventListener('paste', (event) => {
    const file = [...event.clipboardData?.files ?? []].find((one) => one.type.startsWith('image/')), on = shown.peek()?.design.parts.find((part) => part.id === picked.peek())
    if (file) { event.preventDefault(); photo(file, on?.role === 'picture' ? on.id : undefined) }
  })
  return box
}

