// Settings › Appearance › Design system (D602, D664): the kit documents, collections and decks wear, the person's everywhere (kit.json at the root of
// their files) or a project's (its folder's), as ui/kit.js keeps them, a deck drawn with it beside and a page of paper, over Jean's own look and
// under the organisation's: its colours by day and by night, each written (rgb(), rgba() or hex) or picked, its type (a voice, or
// the user's own fonts), its corners, its logo and the one for dark paper with their corner, and its layouts, deck's own on or
// off and the user's own as a grid of named slots with how its words sit, those that only slides show saying so. A kit, a PowerPoint template or an Office theme is
// brought in, a template's layouts with their art (D606), the kit saved as a file or as design tokens (deck's template module,
// loaded then). Each change is kept at once. Opened by its slot (./kit-slot.js), which
// Appearance draws under its back button (ui/look-page.js): a saved task's page, which carries Slides, never reaches Settings.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { ref } from 'lit-html/directives/ref.js'
import { signal } from '@preact/signals-core'
import { createDeck, mergeKits, layoutOf, logoOf, labelOf, tokensFrom, rgbOf, CORNERS, STANDARD } from '@codename/deck'
import { app, theme } from '../../ui/state.js'
import { kitFile, keepKit, hexOf, paperOf } from '../../ui/kit.js'
import { save } from '../../ui/save.js'
import { icons } from '../../ui/menu-icons.js'
import { t, locale, dir, useStrings } from '../../core/i18n.js'
import { jeanKit, copyOf, withNames, words } from './kit.js'
import { sampleDeck } from './kit-sample.js'
import { facesOf } from '../made/paper.js'
import { styleSheet } from '../../ui/sheet.js'

await Promise.all([useStrings('slides'), styleSheet(new URL('../../vendor/deck/deck.css', import.meta.url)), styleSheet(new URL('kit-page.css', import.meta.url))])

/** @typedef {{ name?: string, tokens: Record<string, any>, layouts: Record<string, any>, pictures?: Record<string, string> }} Own */
/** The kit open: its place (null, the person's) and as its file holds it; a layout being made or changed ('+' a new one); what the page says; colours written that deck doesn't read, by field. */
const open = signal(/** @type {{ dir: string | null, kit: Own } | null} */ (null))
const making = signal('')
const said = signal('')
const typed = signal(/** @type {Record<string, string>} */ ({}))
const COLOURS = ['paper', 'ink', 'primary', 'soft', 'muted']
const VOICES = ['calm', 'elegant', 'bold', 'friendly']
const AT = ['start', 'center', 'end']
/** The tokens a kit brought in may hold, as deck reads them (docs/kits.md in its package). */
const TOKENS = ['paper', 'ink', 'primary', 'muted', 'soft', 'voice', 'fonts', 'radius', 'series', 'logo', 'logoAt', 'dark']

/** Appearance's page open, `kit` or `kit-project`, and another opened. @param {string} [page] */
const pageOpen = (page) => (page === undefined ? app.section.value.split('/')[1] ?? '' : void (app.section.value = `appearance/${page}`))
/** The kit whose page is open: the person's, or the project's on `kit-project`. */
const whose = () => (pageOpen() === 'kit-project' ? app.projectDir : null)
/** Its file, read again as the page opens on another. */
function read() {
  const place = whose()
  if (open.peek()?.dir !== place) void kitFile(place).then((kit) => { open.value = { dir: place, kit: { tokens: {}, layouts: {}, ...structuredClone(kit ?? {}) } } })
  return open.value?.dir === place ? open.value.kit : null
}
/** A change to the kit, kept at once, with the pictures its layouts' art still draws. @param {(kit: Own) => void} how */
function change(how) {
  const now = open.peek()
  if (!now) return
  const kit = structuredClone(now.kit)
  how(kit)
  if (kit.pictures) kit.pictures = Object.fromEntries(Object.entries(kit.pictures).filter(([name]) => Object.values(kit.layouts).some((layout) => layout?.art?.includes(name))))
  open.value = { dir: now.dir, kit }
  said.value = ''
  void keepKit(now.dir, kit)
}
/** A token set, or taken away to be worked out (undefined), by day or by night. @param {string} key @param {unknown} value @param {boolean} [night] */
const token = (key, value, night = false) => change((kit) => {
  const where = night ? (kit.tokens.dark ??= {}) : kit.tokens
  if (value === undefined) delete where[key]
  else where[key] = value
  if (night && !Object.keys(where).length) delete kit.tokens.dark
})

/** A file's bytes as a data: address. @param {File} file */
const asData = async (file) => `data:${file.type};base64,${btoa(Array.from(new Uint8Array(await file.arrayBuffer()), (byte) => String.fromCharCode(byte)).join(''))}`
/** A picture picked as the logo, or its dark one, unless it is too large. @param {Event} event @param {boolean} night */
async function logo(event, night) {
  const file = /** @type {HTMLInputElement} */ (event.target).files?.[0]
  if (!file) return
  const url = await asData(file)
  if (logoOf(url)) token('logo', url, night)
  else said.value = t('slides.kit.tooBig')
}

/** A kit, design tokens, a PowerPoint template or an Office theme, brought in over the kit open. @param {Event} event */
async function bring(event) {
  const file = /** @type {HTMLInputElement} */ (event.target).files?.[0]
  if (!file) return
  try {
    /** @type {any} */
    let given
    if (/\.(potx|pptx|thmx)$/i.test(file.name)) {
      const { kitFromTemplate } = await import(new URL('../../vendor/deck/template.mjs', import.meta.url).href)
      given = copyOf((await kitFromTemplate(new Uint8Array(await file.arrayBuffer()), { name: file.name.replace(/\.\w+$/, '') })).kit)
    } else {
      const json = JSON.parse(await file.text())
      given = json && typeof json === 'object' && (json.tokens || json.layouts) ? { ...json, tokens: tokensFrom(json.tokens ?? {}) } : { tokens: tokensFrom(json) }
    }
    given.tokens = Object.fromEntries(Object.entries(given.tokens ?? {}).filter(([key]) => TOKENS.includes(key)))
    if (!Object.keys(given.tokens).length && !Object.keys(given.layouts ?? {}).length) throw new Error('not a kit')
    change((kit) => Object.assign(kit, { ...(given.name && { name: String(given.name) }), tokens: { ...kit.tokens, ...given.tokens }, layouts: { ...kit.layouts, ...given.layouts }, ...(given.pictures && { pictures: { ...kit.pictures, ...given.pictures } }) }))
    said.value = t('slides.kit.brought', { name: file.name })
  } catch {
    said.value = t('slides.kit.notKit')
  }
}

/** The kit open as a file, or its tokens as the W3C's design tokens. @param {boolean} tokens */
async function keepAs(tokens) {
  const kit = open.peek()?.kit ?? { tokens: {}, layouts: {} }, name = kit.name || t('slides.kit.title')
  const text = tokens ? JSON.stringify((await import(new URL('../../vendor/deck/template.mjs', import.meta.url).href)).tokensToDtcg(kit.tokens), null, 2) : JSON.stringify(kit, null, 2)
  save(new Blob([text], { type: 'application/json' }), `${name}${tokens ? '.tokens' : ''}.json`)
}

/** The kit a deck is drawn with here: Jean's own, the person's, the organisation's, the project's when it is open. @param {Own} kit */
const merged = async (kit) => withNames(mergeKits(jeanKit(), whose() === null ? kit : await kitFile(null), app.policy.kit, whose() === null ? null : kit).kit)

/** A deck drawn with the kit, a slide for each of its layouts, the cover first. */
let shown = { key: '', view: /** @type {{ destroy: () => void } | null} */ (null) }
/** @param {Element | undefined} box @param {Own} kit */
async function preview(box, kit) {
  const key = JSON.stringify([kit, whose(), theme.peek(), locale.peek()])
  if (!(box instanceof HTMLElement) || shown.key === key) return
  shown.key = key
  const all = await merged(kit)
  shown.view?.destroy()
  box.replaceChildren()
  shown.view = createDeck(box, { source: sampleDeck(all), kit: all, scheme: theme.peek() === 'dark' ? 'dark' : 'light', strings: words(), headings: 'aria', editable: false })
}

/** A page of paper in the look, as Word and a print wear it, white whatever the kit's paper. @param {Element | undefined} box @param {Own} kit */
async function sheet(box, kit) {
  if (!(box instanceof HTMLElement)) return
  const mine = whose() === null, look = paperOf({ ...(mine ? kit : await kitFile(null))?.tokens, ...app.policy.kit?.tokens, ...(mine ? null : kit.tokens) }), [head, body] = facesOf(look), logo = box.querySelector('img')
  for (const [name, value] of Object.entries({ colour: look.colour, ink: look.ink, muted: look.muted, soft: look.soft, head, body })) box.style[value ? 'setProperty' : 'removeProperty'](`--sheet-${name}`, value ?? '')
  if (logo) logo.hidden = !look.logo, logo.src = look.logo ?? '', logo.className = look.logoAt ?? 'top-end'
}

/** A row of the page: its name (none where its section's says it), a line under it, what changes it. @param {unknown} label @param {unknown} line @param {unknown} control */
const row = (label, line, control) => html`<li><span class="item-text">${label ? html`<strong>${label}</strong>` : nothing}${line ? html`<small>${line}</small>` : nothing}</span>${control}</li>`

/** A colour written, kept as it is where deck reads it (rgb(), rgba() or hex), Automatic when emptied, else said so and left in its field. @param {string} key @param {string} text @param {boolean} night */
function written(key, text, night) {
  const field = `${night ? 'dark.' : ''}${key}`, { [field]: _, ...rest } = typed.peek()
  if (text.trim() && !rgbOf(text)) { typed.value = { ...rest, [field]: text }; said.value = t('slides.kit.notColour'); return }
  typed.value = rest
  token(key, text.trim() || undefined, night)
}

/** A colour of the kit, by day or by night: written or picked, or Automatic, showing Jean's own (by night, the main colour is the day's). @param {Own} kit @param {string} key @param {boolean} night */
function colour(kit, key, night) {
  const value = (night ? kit.tokens.dark ?? {} : kit.tokens)[key], own = /** @type {Record<string, any>} */ (jeanKit().tokens), under = night ? own.dark?.[key] ?? (key === 'primary' ? kit.tokens.primary ?? own.primary : undefined) : own[key]
  const field = `${night ? 'dark.' : ''}${key}`, shown = hexOf(value ?? under ?? '#888888')
  return row(t(`slides.kit.${key}`), value ? nothing : t('slides.kit.auto'), html`<span class="kit-colour"><input class="kit-code" dir="ltr" spellcheck="false" autocomplete="off"
    aria-label=${t('slides.kit.code', { colour: t(`slides.kit.${key}`) })} aria-invalid=${field in typed.value ? 'true' : 'false'} placeholder=${`rgb(${rgbOf(shown)?.join(', ')})`}
    .value=${live(typed.value[field] ?? value ?? '')} @change=${(/** @type {Event} */ e) => written(key, /** @type {HTMLInputElement} */ (e.target).value, night)}>
    <input type="color" aria-label=${t(`slides.kit.${key}`)} .value=${live(shown)}
    @change=${(/** @type {Event} */ e) => written(key, /** @type {HTMLInputElement} */ (e.target).value, night)}>
    ${value ? html`<button type="button" class="icon-button subtle" aria-label=${t('slides.kit.auto')} @click=${() => written(key, '', night)}>${icons.close}</button>` : nothing}</span>`)
}

/** The corners in the user's words, as the page reads: end is the right in a language written from the left. @param {string} corner */
const cornerName = (corner) => t(`slides.kit.at.${corner.replace(/(start|end)$/, (side) => ((side === 'end') === (dir(locale.peek()) === 'ltr') ? 'Right' : 'Left')).replace(/-/, '')}`)

/** A layout made or changed: its name, its grid of slots, its tracks, how its words sit, what paper it is on, its logo. @param {Own} kit @param {string} key */
function layoutForm(kit, key) {
  const given = /** @type {Record<string, any> | null} */ (key === '+' ? null : mergeKits(kit).kit.layouts[key])
  /** @param {SubmitEvent} event */
  const keep = (event) => {
    event.preventDefault()
    const form = new FormData(/** @type {HTMLFormElement} */ (event.target)), get = (/** @type {string} */ name) => String(form.get(name) ?? '').trim()
    const areas = get('areas').split('\n').map((line) => line.trim()).filter(Boolean), slots = [...new Set(areas.join(' ').split(/\s+/).filter((cell) => cell !== '.'))]
    // A layout changed keeps what the form doesn't show: a template's art, its PowerPoint layout.
    const definition = { ...(key !== '+' && kit.layouts[key]), label: { [locale.peek()]: get('name') }, slots, areas: areas.join(' | '), columns: get('columns') || undefined, rows: get('rows') || undefined,
      paper: get('paper'), align: get('align'), justify: get('justify'), title: get('title'), logo: get('logo'), numbered: form.has('numbered') }
    if (!get('name') || !layoutOf(definition).layout || !slots.includes('default')) { said.value = t('slides.kit.badGrid'); return }
    const name = key !== '+' ? key : ((slug) => (slug && !STANDARD.layouts[slug] && !kit.layouts[slug] ? slug : `layout-${Object.keys(kit.layouts).length + 1}`))(get('name').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(?=\d)/, 'l-').slice(0, 32))
    change((next) => { next.layouts[name] = definition })
    making.value = ''
  }
  return html`<form class="kit-layout" @submit=${keep}>
    <label class="kit-field">${t('slides.kit.name')}<input name="name" required maxlength="40" dir="auto" .value=${given ? labelOf(/** @type {any} */ (given), key, locale.peek()) : ''}></label>
    <label class="kit-field">${t('slides.kit.grid')}<textarea name="areas" rows="3" dir="ltr" spellcheck="false" required aria-describedby="kit-grid-hint" .value=${given ? given.areas.map((/** @type {string[]} */ line) => line.join(' ')).join('\n') : 'default default\nleft right'}></textarea></label>
    <p class="hint" id="kit-grid-hint">${t('slides.kit.gridHint')}</p>
    <label class="kit-field">${t('slides.kit.columns')}<input name="columns" dir="ltr" placeholder="1fr 1fr" .value=${given ? given.columns.join(' ') : ''}></label>
    <label class="kit-field">${t('slides.kit.rows')}<input name="rows" dir="ltr" placeholder="auto 1fr" .value=${given ? given.rows.join(' ') : ''}></label>
    <label class="kit-field">${t('slides.kit.background')}<select name="paper">
      ${['paper', 'fill', 'ink', 'soft'].map((one) => html`<option value=${one} ?selected=${one === (given?.paper ?? 'paper')}>${t(`slides.kit.${one === 'fill' ? 'primary' : one}`)}</option>`)}</select></label>
    ${[['align', 'slides.kit.across'], ['justify', 'slides.kit.down']].map(([field, label]) => html`<label class="kit-field">${t(label)}<select name=${field}>
      ${AT.map((one) => html`<option value=${one} ?selected=${one === (given?.[field] ?? 'start')}>${t(`slides.kit.${one}`)}</option>`)}</select></label>`)}
    <label class="kit-field">${t('slides.kit.heading')}<select name="title">${['normal', 'large', 'huge'].map((one) => html`<option value=${one} ?selected=${one === (given?.title ?? 'normal')}>${t(`slides.kit.${one}`)}</option>`)}</select></label>
    <label class="kit-field">${t('slides.kit.logo')}<select name="logo">${['small', 'big', 'none'].map((one) => html`<option value=${one} ?selected=${one === (given?.logo ?? 'small')}>${t(`slides.kit.${one === 'big' ? 'large' : one}`)}</option>`)}</select></label>
    <label class="kit-check"><input type="checkbox" name="numbered" ?checked=${given?.numbered ?? true}>${t('slides.kit.numbered')}</label>
    <div class="row"><button class="button primary">${t('slides.kit.keep')}</button><button type="button" class="button subtle" @click=${() => { making.value = '' }}>${t('slides.kit.cancel')}</button></div>
  </form>`
}

/** Its layouts: deck's own on or off, but the default, and the user's own, changed or deleted. @param {Own} kit */
function layouts(kit) {
  // Named as the Slide layout menu names them, in the user's language (Jean's own kit), the user's own by theirs.
  const all = withNames(mergeKits(jeanKit(), kit).kit).layouts, standard = Object.keys(STANDARD.layouts), mine = Object.keys(kit.layouts).filter((key) => !STANDARD.layouts[key] && kit.layouts[key])
  const turn = (/** @type {string} */ key) => change((next) => { if (next.layouts[key] === false) delete next.layouts[key]; else next.layouts[key] = false })
  return html`<section><h3>${t('slides.kit.layouts')}</h3><p class="hint">${t('slides.kit.slidesOnly')}</p><ul class="list kit-layouts">
    ${[...standard, ...mine].map((key) => row(labelOf(all[key] ?? /** @type {any} */ (jeanKit().layouts[key]), key, locale.peek()), nothing, html`<span class="row">
      ${mine.includes(key) ? html`<button type="button" class="button subtle" @click=${() => { making.value = key }}>${t('slides.kit.change')}</button>
        <button type="button" class="button subtle danger" @click=${() => change((next) => { delete next.layouts[key] })}>${t('slides.kit.delete')}</button>`
      : html`<input type="checkbox" class="switch" role="switch" aria-label=${labelOf(/** @type {any} */ (jeanKit().layouts[key]), key, locale.peek())} .checked=${live(kit.layouts[key] !== false)} ?disabled=${key === 'default'} @change=${() => turn(key)}>`}</span>`))}
    </ul>${making.value ? layoutForm(kit, making.value) : html`<button type="button" class="button" @click=${() => { making.value = '+' }}>${icons.plus} ${t('slides.kit.newLayout')}</button>`}</section>`
}

/** The page. */
export function page() {
  const kit = read(), project = app.project.value
  if (!kit) return nothing
  const tokens = kit.tokens, night = tokens.dark ?? {}, fonts = tokens.fonts
  const file = (/** @type {string} */ label, /** @type {string} */ accept, /** @type {(event: Event) => void} */ picked) => html`<label class="button kit-file">${label}<input type="file" class="visually-hidden" accept=${accept} @change=${picked}></label>`
  return html`<header class="look-head"><h2 tabindex="-1">${t('slides.kit.title')}</h2>${Object.keys(tokens).length || Object.keys(kit.layouts).length
      ? html`<button class="button subtle" @click=${() => change((next) => { next.tokens = {}; next.layouts = {}; delete next.name; typed.value = {} })}>${t('slides.kit.startOver')}</button>` : nothing}</header>
    <p class="lede">${t('slides.kit.text')}</p>
    ${project.data.default === true ? nothing : html`<span class="segmented" role="radiogroup" aria-label=${t('slides.kit.title')}>
      ${[['kit', t('slides.kit.everywhere')], ['kit-project', t('slides.kit.project', { project: String(project.data.name ?? '') })]].map(([page, label]) => html`<label>
        <input type="radio" name="kit-whose" .checked=${live(pageOpen() === page)} @change=${() => pageOpen(page)}><span>${label}</span></label>`)}</span>`}
    <div class="kit-previews"><div class="kit-preview" ${ref((box) => void preview(box, kit))}></div>
      <figure><div class="kit-sheet" aria-hidden="true" ${ref((box) => void sheet(box, kit))}><img hidden alt=""><b>${t('slides.kit.title')}</b><p>${t('slides.kit.sample')}</p><blockquote>${t('slides.kit.sample')}</blockquote><table><tr><th>${t('slides.kit.name')}</th><th>${t('slides.kit.words')}</th></tr></table></div>
        <figcaption class="hint">${t('slides.kit.onPaper')}</figcaption></figure></div>
    ${said.value ? html`<p class="hint" role="status">${said.value}</p>` : nothing}
    <section><h3>${t('slides.kit.colours')}</h3><ul class="list">${COLOURS.map((key) => colour(kit, key, false))}</ul><p class="hint">${t('slides.kit.paperHint')}</p>
      <h3>${t('slides.kit.night')}</h3><ul class="list">${COLOURS.slice(0, 3).map((key) => colour(kit, key, true))}</ul></section>
    <section><h3>${t('slides.kit.type')}</h3><ul class="list">
      ${row(nothing, nothing, html`<span class="segmented" role="radiogroup" aria-label=${t('slides.kit.type')}>${VOICES.map((voice) => html`<label>
        <input type="radio" name="kit-voice" .checked=${live(!fonts && (tokens.voice ?? 'calm') === voice)} @change=${() => change((next) => { next.tokens.voice = voice; delete next.tokens.fonts })}><span>${t(`slides.kit.voice.${voice}`)}</span></label>`)}</span>`)}
      ${row(t('slides.kit.fonts'), nothing, html`<span class="row">${['heading', 'body'].map((part) => html`<input class="kit-face" dir="ltr" aria-label=${t(part === 'heading' ? 'slides.kit.headings' : 'slides.kit.words')}
        placeholder=${t(part === 'heading' ? 'slides.kit.headings' : 'slides.kit.words')} .value=${live(fonts?.[part]?.join(', ') ?? '')} @change=${(/** @type {Event} */ e) => change((next) => {
          const faces = /** @type {HTMLInputElement} */ (e.target).value.split(',').map((one) => one.trim()).filter(Boolean), own = { heading: fonts?.heading ?? [], body: fonts?.body ?? [], [part]: faces }
          if (own.heading.length || own.body.length) next.tokens.fonts = { heading: own.heading.length ? own.heading : own.body, body: own.body.length ? own.body : own.heading }
          else delete next.tokens.fonts
        })}>`)}</span>`)}
      ${row(t('slides.kit.corners'), t('slides.kit.slidesOnly'), html`<input type="range" min="0" max="24" step="1" aria-label=${t('slides.kit.corners')} .value=${live(String(tokens.radius ?? 10))}
        @change=${(/** @type {Event} */ e) => token('radius', Number(/** @type {HTMLInputElement} */ (e.target).value))}>`)}
    </ul></section>
    <section><h3>${t('slides.kit.logo')}</h3><ul class="list">
      ${[[false, tokens.logo, ''], [true, night.logo, 'slides.kit.logoDark']].map(([dark, url, label]) => row(label ? t(String(label)) : nothing, nothing, html`<span class="row kit-logo ${dark ? 'is-dark' : ''}">
        ${url ? html`<img src=${String(url)} alt="">` : nothing}${file(t('slides.kit.logoAdd'), 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', (e) => void logo(e, Boolean(dark)))}
        ${url ? html`<button type="button" class="button subtle" @click=${() => token('logo', undefined, Boolean(dark))}>${t('slides.kit.remove')}</button>` : nothing}</span>`))}
      ${tokens.logo ? row(t('slides.kit.corner'), nothing, html`<select aria-label=${t('slides.kit.corner')} @change=${(/** @type {Event} */ e) => token('logoAt', /** @type {HTMLSelectElement} */ (e.target).value)}>
        ${CORNERS.map((corner) => html`<option value=${corner} ?selected=${corner === (tokens.logoAt ?? CORNERS[0])}>${cornerName(corner)}</option>`)}</select>`) : nothing}
    </ul></section>
    ${layouts(kit)}
    <section class="row kit-files">${file(t('slides.kit.bring'), '.json,.potx,.pptx,.thmx,application/json', (e) => void bring(e))}
      <button type="button" class="button subtle" @click=${() => keepAs(false)}>${icons.download} ${t('slides.kit.saveFile')}</button>
      <button type="button" class="button subtle" @click=${() => keepAs(true)}>${icons.download} ${t('slides.kit.saveTokens')}</button></section>`
}

/** Its row in Appearance's Make it yours. */
export const entry = () => html`<li><button class="item" data-page="kit" @click=${() => pageOpen('kit')}><span class="item-text"><strong>${t('slides.kit.title')}</strong>
  <small>${t('slides.kit.text')}</small></span>${icons.chevron}</button></li>`
