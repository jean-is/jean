// Settings' Appearance (D111, D523): how Jean is easy on the user first, light or dark, the text's size and typeface,
// and how much moves, each following the device or the theme until picked; then every theme at once, each, on
// Auto, with its other mode folded into its corner; then Make it yours: an accent, the theme's own, one of the eight
// colours projects light their rooms with, or any other, and the user's own CSS, on a page of its own
// (settings/appearance/css). Undo my changes is at the section's head once something is changed.
// Loaded the first time Appearance shows; its strings are a part of their own (locales/look/).
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { ref } from 'lit-html/directives/ref.js'
import { signal } from '@preact/signals-core'
import { app, effective, theme, setTheme, setLook, chosenLook, SHORTCUTS } from './state.js'
import { mine } from './opfs.js'
import { LOOKS, OWN, baseOf, offeredLooks, touched } from './looks.js'
import { FONTS, SIZES, COLOURS } from './touches.js'
import { lockedBy, valueOf, pageOpen } from './dialogs.js'
import { backwards, keyNames, lookName } from './inbox.js'
import { t, intlLocales, useStrings } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { styleSheet } from './sheet.js'

/** @typedef {import('../core/settings.js').Look} Look */

/** What the user's own CSS starts from, commented out (ui/touches.css): kept only once changed, emptied included. */
const [starter] = await Promise.all([fetch(new URL('touches.css', import.meta.url)).then((response) => (response.ok ? response.text() : ''), () => ''),
  useStrings('look'), styleSheet(new URL('look-page.css', import.meta.url))])

// The page open (pageOpen()): css, or '' for the section.

/** Opens the section or the CSS's page, the keyboard on its title, or back on the row it came from. @param {string} to */
function go(to) {
  app.section.value = to ? `appearance/${to}` : 'appearance'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.look-head h2' : '[data-page="css"]'))?.focus())
}

/**
 * Motion on this device (D523): less or full as the user asked, or Auto, null, what the device asks. Kept beside light or
 * dark, which index.html applies with it before the first paint; the style sheet stops what moves (ui/style.css).
 */
const MOTION_KEY = 'app.motion'
const motion = signal(localStorage.getItem(mine(MOTION_KEY)))
/** @param {string} next */
function setMotion(next) {
  motion.value = next === 'auto' ? null : next
  if (motion.value) localStorage.setItem(mine(MOTION_KEY), motion.value)
  else localStorage.removeItem(mine(MOTION_KEY))
  document.documentElement.dataset.motion = motion.value ?? ''
}

/** A shortcut where it works, left to right in any language. @param {string} shortcut */
const keys = (shortcut) => html`<kbd aria-hidden="true"><bdi dir="ltr">${keyNames(shortcut)}</bdi></kbd>`

/**
 * One choice of a few, the one picked filled (ui/dialogs.css): each a word, or what `label` draws with its name.
 * @param {string} name @param {string} said @param {Array<[string, string]>} options @param {string} picked @param {(id: string) => void} pick
 * @param {{ shortcut?: string, label?: (id: string, words: string) => unknown }} [more]
 */
const segmented = (name, said, options, picked, pick, { shortcut, label } = {}) => html`<span class="segmented" role="radiogroup" aria-label=${said} aria-keyshortcuts=${shortcut ?? nothing}>
  ${options.map(([id, words]) => html`<label title=${label ? words : nothing}><input type="radio" name=${name} aria-label=${label ? words : nothing} .checked=${id === picked}
    @change=${() => pick(id)}>${label ? label(id, words) : html`<span>${words}</span>`}</label>`)}</span>`

/** A setting a row: what it is, and how it stands when it follows something else, then how it is set. @param {unknown} label @param {string} line @param {unknown} control */
const row = (label, line, control) => html`<li><span class="item-text"><strong>${label}</strong>${line ? html`<small>${line}</small>` : nothing}</span>${control}</li>`

/** Easy on the user: light or dark, text size, typeface, motion. @param {Look} look */
function comfort(look) {
  const mode = app.chosenTheme.value ?? 'auto'
  const size = look.size ?? 1
  const sample = t('look.sample')
  const faces = /** @type {Array<[string, string]>} */ ([['', t('look.font.look')], ...Object.keys(FONTS).map((id) => [id, t(`look.font.${id}`)])])
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  return html`<section><h3>${t('look.comfort')}</h3><ul class="list look-rows">
    ${row(t('settings.mode'), mode === 'auto' ? t(app.deviceTheme.value === 'light' ? 'look.followsLight' : 'look.followsDark') : '', html`${keys(SHORTCUTS.theme)}${segmented('theme', t('settings.mode'),
      [['auto', t('theme.auto')], ['light', t('theme.light')], ['dark', t('theme.dark')]], mode, (id) => setTheme(id === 'auto' ? null : /** @type {'light' | 'dark'} */ (id)), { shortcut: SHORTCUTS.theme })}`)}
    <li><label class="item-text" for="look-size"><strong>${t('look.size')}</strong></label>
      <span class="look-size"><span aria-hidden="true">${[...sample][0]}</span><input id="look-size" type="range" min=${SIZES.min} max=${SIZES.max} step=${SIZES.step} .value=${live(String(size))}
        @input=${(/** @type {Event} */ e) => setLook({ size: Number(valueOf(e)) }, { later: true })}><span aria-hidden="true">${[...sample][0]}</span>
      <output for="look-size">${new Intl.NumberFormat(intlLocales(), { style: 'percent' }).format(size)}</output></span></li>
    ${row(t('look.font'), faces.find(([id]) => id === (look.font ?? ''))?.[1] ?? '', segmented('font', t('look.font'), faces, look.font ?? '', (id) => setLook({ font: id || undefined }),
      { label: (id) => html`<span ${ref((face) => /** @type {HTMLElement | undefined} */ (face)?.style.setProperty('font-family', FONTS[/** @type {keyof typeof FONTS} */ (id)] ?? 'inherit'))}>${sample}</span>` }))}
    ${row(t('look.motion'), motion.value ? '' : t(still ? 'look.followsLess' : 'look.followsFull'), segmented('motion', t('look.motion'),
      [['auto', t('theme.auto')], ['less', t('look.less')], ['full', t('look.full')]], motion.value ?? 'auto', setMotion))}
  </ul></section>`
}

/** A theme's picture, in the mode on screen, or in the other (`lp-light`, `lp-dark`, ui/dialogs.css). @param {string} id @param {string} [other] */
const picture = (id, other = '') => html`<span class="look-preview ${other}" data-look-preview=${baseOf(id, app.policy)}><span></span><span></span><span></span></span>`

/**
 * Every theme offered at once (D500), Jean's own first: on Auto, each with its other mode folded into its corner. With one
 * offered, it is the organisation's to set.
 */
function gallery() {
  const ids = offeredLooks(app.policy)
  const one = ids.length < 2
  const other = app.chosenTheme.value ? '' : theme.value === 'light' ? 'lp-dark' : 'lp-light'
  return html`<section><header class="look-group"><h3 id="look-themes">${t('look.title')}</h3>${one ? html`<span class="muted small">${lockedBy()}</span>`
      : html`<span class="muted small">${t('keyboard.look')}</span>${keys(SHORTCUTS.look)}`}</header>
    <fieldset class="looks" aria-labelledby="look-themes" ?disabled=${one} aria-keyshortcuts=${one ? nothing : `${SHORTCUTS.look} ${backwards(SHORTCUTS.look)}`}>
      ${ids.map((id) => html`<label class="choice-option look">
        <input type="radio" name="look" .checked=${id === chosenLook.value} @change=${() => setLook({ id })}>
        <span class="look-thumb" aria-hidden="true">${picture(id)}${other ? picture(id, other) : nothing}</span>
        <span>${lookName(id)}</span>
      </label>`)}
    </fieldset></section>`
}

/** A colour to pick, drawn as Jean will show it by day or by night (ui/touches.js). @param {string} name @param {string} colour @param {boolean} on @param {() => void} pick @param {string} [kind] */
const swatch = (name, colour, on, pick, kind = '') => html`<label class="swatch ${kind}" title=${name}><input type="radio" name="accent" .checked=${live(on)} @change=${pick}>
  <i ${ref((dot) => /** @type {HTMLElement | undefined} */ (dot)?.style.setProperty('--swatch', colour))}></i><span class="visually-hidden">${name}</span></label>`

/** Make it yours: the accent, then the user's own CSS's page. @param {Look} look */
function yours(look) {
  const own = (chosenLook.value === OWN ? app.policy.look?.accent : undefined) ?? LOOKS[baseOf(chosenLook.value, app.policy)].accent
  const named = COLOURS.find(([, colour]) => colour === look.accent)
  const other = look.accent !== undefined && !named
  return html`<section><h3>${t('look.custom')}</h3><ul class="list look-rows">
    ${row(t('look.accent'), look.accent === undefined ? t('look.own') : named ? t(`colour.${named[0]}`) : t('look.another'), html`<fieldset class="swatches look-swatches">
      <legend class="visually-hidden">${t('look.accent')}</legend>
      ${swatch(t('look.own'), own, look.accent === undefined, () => setLook({ accent: undefined }), 'is-own')}
      ${COLOURS.map(([name, colour]) => swatch(t(`colour.${name}`), colour, colour === look.accent, () => setLook({ accent: colour })))}
      <label class="swatch is-any" title=${t('look.another')}><input type="color" .value=${live(other ? String(look.accent) : own)}
        @input=${(/** @type {Event} */ e) => setLook({ accent: valueOf(e) }, { later: true })}><i class=${other ? 'is-on' : ''}></i><span class="visually-hidden">${t('look.another')}</span></label>
    </fieldset>`)}
    <li><button class="item" data-page="css" @click=${() => go('css')}><span class="item-text"><strong>${t('look.css')}</strong></span>${icons.chevron}</button></li>
  </ul></section>`
}

/** The user's own CSS, shown as it is typed, over the theme and their touches. @param {Look} look */
const css = (look) => html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('settings.appearance')}</button>
  <header class="look-head"><h2 tabindex="-1" id="look-css">${t('look.css')}</h2></header>
  <section><p class="hint" id="look-css-hint">${t('look.cssHint')}</p>
    <textarea class="look-css" rows="16" dir="ltr" spellcheck="false" autocapitalize="off" aria-labelledby="look-css" aria-describedby="look-css-hint" .value=${live(look.css ?? starter)}
      @input=${(/** @type {Event} */ e) => setLook({ css: valueOf(e) === starter ? undefined : valueOf(e) }, { later: true })}></textarea></section>`

/** Settings' Appearance, or its CSS's page. */
export function section() {
  const look = effective.value.settings.look ?? {}
  if (pageOpen() === 'css') return css(look)
  const undo = () => { setLook(null); requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('.look-head h2'))?.focus()) }
  return html`<header class="look-head"><h2 tabindex="-1">${t('settings.appearance')}</h2>${touched(look) ? html`<button class="button subtle" @click=${undo}>${t('look.reset')}</button>` : nothing}</header>
    ${comfort(look)}${gallery()}${yours(look)}`
}
