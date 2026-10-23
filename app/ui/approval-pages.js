// Settings' Approvals (D527): one line on how things stand, then the three rules as baskets of the kinds of action they
// hold, each kind opening its page at its own address (D509): what it covers, its three choices with the usual marked,
// and its exceptions. Then the exceptions themselves, every Always allow a capability keeps (its part of the allowed
// slot) with Stop and the stricter rules (D295), Web pages (D143) and, once found, Certificates (D274), each a page.
// Loaded the first time Approvals shows; its strings are a part of their own (locales/approvals/).
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { app, effective, setRule, updateSettings, notify } from './state.js'
import { loaded, slots } from './caps.js'
import { lockedBy, openSettings, siteList } from './dialogs.js'
import { BRAND } from '../brand.js'
import { ulid } from '../core/ulid.js'
import { RULE_KINDS, resolveRule } from '../core/rules.js'
import { PAGE_DEFAULTS, pageRights } from './csp.js'
import { t, intlLocales, useStrings } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { styleSheet } from './sheet.js'

await Promise.all([useStrings('approvals'), styleSheet(new URL('data-pages.css', import.meta.url)), styleSheet(new URL('approval-pages.css', import.meta.url))])

/**
 * What a capability keeps of an Always allow, outside the rules: a folder, a site, films, a meeting, a service's reading or acting, an extension that may skip asking (its part of the allowed slot).
 * @typedef {{ what: 'folder' | 'site' | 'films' | 'meeting' | 'reads' | 'acts' | 'extension', name: string, stop: () => unknown }} Allowed
 */

const CHOICES = /** @type {const} */ (['allow', 'ask', 'never'])
/** The kind of action whose page shows what each keeps, and its glyph. */
const KEPT = { folder: ['edit', icons.folder], site: ['fetch', icons.globe], films: ['', icons.image], meeting: ['', icons.helpers], reads: ['fetch', icons.plug], acts: ['other', icons.plug], extension: ['', icons.extensions] }
const name = BRAND.name
/** The kinds shown, Starting a long task once plans are found. */
const kinds = () => [...RULE_KINDS, ...(loaded.value.has('plan') ? ['plan'] : [])]
/** @param {string} kind */
const rule = (kind) => resolveRule(kind, { user: effective.value.settings.rules })
/** @param {string} kind */
const locked = (kind) => effective.value.locked.has(`rules.${kind}`)
/** @param {string} kind */
const changed = (kind) => !locked(kind) && rule(kind) !== resolveRule(kind)
/** A number as the page's language writes it. @param {number} count */
const number = (count) => new Intl.NumberFormat(intlLocales()).format(count)
/** Bumped once an exception is stopped: a folder's is kept outside settings. */
const stopped = signal(0)
/** What Be more careful starts on: a kind's page's own kind. */
const preset = signal('')

/** The page open: a kind's, or exceptions, careful, pages or certificates; '' for the list. */
const pageOpen = () => app.section.value.split('/')[1] ?? ''

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on what opened it. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `approvals/${to}` : 'approvals'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2' : `[data-page="${from}"]`))?.focus())
}

/** "Always allow" kept, from a card (ui/send.js): where it is taken back, the kind's page or Exceptions. @param {string} kind */
export const kept = (kind) => notify(t('approvals.kept'), { label: t('settings.approvals'), run: () => openSettings(kind ? `approvals/${kind}` : 'approvals/exceptions') })

/** What the capabilities found keep of an Always allow. @returns {Allowed[]} */
const allowed = () => (stopped.value, /** @type {Allowed[]} */ (slots('allowed').flatMap((part) => part.draw())))
/** What is kept, by its name: films are just films. @param {Allowed} item */
const named = (item) => (item.what === 'films' ? t('approvals.films') : item.name)

// ─── The list ────────────────────────────────────────────────────────────────

/** A kind, in its basket: it opens its page; a dot when it isn't the usual, a lock when it is someone else's. @param {string} kind */
const chip = (kind) => html`<li><button class="approval-kind" data-page=${kind} @click=${() => go(kind)}>${changed(kind) ? html`<i class="approval-dot"></i>` : nothing}${t(`kind.${kind}.label`)}${locked(kind)
  ? html`${icons.lock}<span class="visually-hidden">${lockedBy()}</span>` : changed(kind) ? html`<span class="visually-hidden">${t('approvals.isChanged')}</span>` : nothing}</button></li>`

/** A row that opens a page, with how many it holds. @param {string} page @param {unknown} icon @param {string} label @param {string} text @param {number} [count] */
const row = (page, icon, label, text, count) => html`<li><button class="item" data-page=${page} @click=${() => go(page)}><span class="item-icon">${icon}</span>
  <span class="item-text"><strong>${t(label)}</strong><small dir="auto">${text}</small></span>${count ? html`<span class="data-state">${number(count)}</span>` : nothing}${icons.chevron}</button></li>`

/** The guards, the organisation's first and locked (D295). */
const guards = () => [...(app.policy.guards ?? []).map((/** @type {any} */ guard) => /** @type {const} */ ([guard, true])), ...(effective.value.settings.guards ?? []).map((guard) => /** @type {const} */ ([guard, false]))]
/** The services a guard may be for, once Connections is found. */
const services = () => (loaded.value.has('connections') ? [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])] : [])
/** A guard in words: what it is for and what Jean does then. @param {import('../core/rules.js').Guard} guard */
const said = (guard) => `${guard.service ? services().find((one) => one.id === guard.service)?.name ?? guard.service : t(`kind.${guard.kind}.label`)} · ${t(`rules.${guard.then}`)}`

/** Settings' Approvals: the line, the baskets, the exceptions, then Web pages and Certificates. */
function list() {
  const shown = kinds()
  const [set, mine, items, careful] = [shown.filter(locked).length, shown.filter(changed).length, allowed(), guards()]
  const out = ['web', 'network', 'maps'].some((right) => pageRights(app.settings.value, app.policy).allows[/** @type {import('./csp.js').PageRight} */ (right)])
  return html`<header class="data-head"><h2>${t('settings.approvals')}</h2></header>
    <p class="lede">${app.policy.child ? html`<strong>${t('approvals.parent')}</strong>` : set || mine ? html`${set ? html`<strong>${t('approvals.org', { count: set })}</strong> ` : nothing}${mine
      ? html`<strong>${t('approvals.changed', { count: mine })}</strong> <button class="link-button" @click=${() => updateSettings({ rules: {} })}>${t('approvals.reset')}</button>` : nothing}` : t('approvals.usual', { name })}</p>
    <ul class="list approval-bins" aria-label=${t('settings.rules')}>${CHOICES.map((choice) => html`<li><h3>${t(`rules.${choice}`)}<small>${t(`approvals.${choice}Text`, { name })}</small></h3>
      <ul class="approval-kinds">${shown.filter((kind) => rule(kind) === choice).map(chip)}${choice === 'never'
        ? html`<li class="approval-kind is-fixed">${icons.lock}${t('approvals.reserved')}</li>` : nothing}</ul></li>`)}</ul>
    <section><h3>${t('approvals.exceptions')}</h3><ul class="list data-rows">
      ${row('exceptions', icons.shield, 'approvals.allowed', items.length ? items.map(named).join(' · ') : t('approvals.allowedNone', { name }), items.length)}
      ${row('exceptions', icons.plus, 'approvals.careful', careful.length ? said(careful[0][0]) : t('approvals.carefulNone'), careful.length)}
    </ul></section>
    <section><ul class="list data-rows">${row('pages', icons.code, 'pages.title', t(out ? 'approvals.pagesOut' : 'approvals.pagesIn'))}${loaded.value.has('receipt')
      ? row('certificates', icons.badge, 'approvals.certificates', t('approvals.certificatesText')) : nothing}</ul></section>`
}

// ─── The pages ───────────────────────────────────────────────────────────────

/** What is kept, each with Stop. @param {Allowed[]} items */
const keptList = (items) => html`<ul class="rules">${items.map((item) => html`<li class="setting"><span class="approval-kept"><span class="item-icon">${KEPT[item.what][1]}</span>
  <span class="item-text"><strong dir="auto">${named(item)}</strong><small>${t(`approvals.what.${item.what}`, { name })}</small></span></span>
  <button class="button subtle" @click=${async () => { await item.stop(); stopped.value++ }}>${t('approvals.stop')}</button></li>`)}</ul>`

/** The guards, each in words, the user's removed with a click. @param {ReturnType<typeof guards>} list */
const guardList = (list) => html`<ul class="rules">${list.map(([guard, theirs]) => html`<li class="setting"><span class="rule-kind" dir="auto">${said(guard)}${theirs
  ? html` <span class="muted small">${lockedBy()}</span>` : nothing}${guard.if ? html`<br><span class="muted small">${t('guards.when', { question: guard.if })}</span>` : nothing}</span>${theirs ? nothing
  : html`<button type="button" class="icon-button subtle" aria-label=${t('guards.remove')} @click=${() => updateSettings({ guards: (app.settings.value.guards ?? []).filter((other) => other !== guard) })}>${icons.trash}</button>`}</li>`)}</ul>`

/** A kind's page: its choices, the usual marked; then what was allowed for it, and the guards on it. @param {string} kind */
function kindPage(kind) {
  const [items, careful] = [allowed().filter((item) => KEPT[item.what][0] === kind), guards().filter(([guard]) => guard.kind === kind)]
  return html`<ul class="list approval-choices" role="radiogroup" aria-label=${t(`kind.${kind}.label`)}>${CHOICES.map((choice) => html`<li><label>
      <input type="radio" name="approval-choice" .checked=${rule(kind) === choice} ?disabled=${locked(kind)} @change=${() => setRule(kind, choice)}>
      <span class="item-text"><strong>${t(`rules.${choice}`)}${choice === resolveRule(kind) ? html` <span class="data-state">${t('approvals.theUsual')}</span>` : nothing}</strong>
      <small>${t(`approvals.${choice}Text`, { name })}</small></span></label></li>`)}</ul>
    ${locked(kind) ? html`<p class="hint">${lockedBy()}</p>` : nothing}${kind === 'edit' && loaded.value.has('folders') ? html`<p class="hint">${t('approvals.folders', { name })}</p>` : nothing}
    ${items.length || careful.length ? html`<section><h3>${t('approvals.exceptions')}</h3>${keptList(items)}${guardList(careful)}</section>` : nothing}
    <div class="row"><button class="button" @click=${() => { preset.value = `kind:${kind}`; go('careful') }}>${icons.plus} ${t('approvals.carefulAdd')}</button></div>`
}

/** Exceptions: every Always allow kept, then the guards. */
const exceptions = () => html`<section><h3>${t('approvals.allowed')}</h3>${allowed().length ? keptList(allowed()) : html`<p class="muted">${t('approvals.allowedNone', { name })}</p>`}</section>
  <section><h3>${t('approvals.careful')}</h3>${guards().length ? guardList(guards()) : html`<p class="muted">${t('approvals.carefulNone')}</p>`}
  <div class="row"><button class="button" @click=${() => { preset.value = ''; go('careful') }}>${icons.plus} ${t('approvals.carefulAdd')}</button></div></section>`

/** Adds a guard, for a kind or a service, which asks first or never does it, and if the user likes only when the answer to their question is yes. @param {SubmitEvent} event */
function add(event) {
  event.preventDefault()
  const fields = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const [on, value] = String(fields.get('for')).split(':')
  const question = String(fields.get('if') ?? '').trim()
  updateSettings({ guards: [...app.settings.value.guards ?? [], { id: ulid(), [on]: value, then: /** @type {'ask' | 'never'} */ (fields.get('then')), ...(question && { if: question }) }] })
  go('exceptions')
}

/** Be more careful: for what, then what, and only when, if the user likes. */
const careful = () => html`<form class="approval-form" @submit=${add}>
  <label>${t('guards.for')}<select name="for">
    <optgroup label=${t('approvals.kinds')}>${RULE_KINDS.map((kind) => html`<option value=${`kind:${kind}`} ?selected=${preset.value === `kind:${kind}`}>${t(`kind.${kind}.label`)}</option>`)}</optgroup>
    ${services().length ? html`<optgroup label=${t('approvals.services')}>${services().map((one) => html`<option value=${`service:${one.id}`}>${one.name}</option>`)}</optgroup>` : nothing}</select></label>
  <span class="segmented" role="radiogroup" aria-label=${t('guards.then')}>${(/** @type {const} */ (['ask', 'never'])).map((then) => html`<label>
    <input type="radio" name="then" value=${then} ?checked=${then === 'ask'}><span>${t(`rules.${then}`)}</span></label>`)}</span>
  <label>${t('guards.if')}<input name="if" dir="auto" placeholder=${t('approvals.example')} aria-describedby="approval-if"></label>
  <p class="hint" id="approval-if">${t('approvals.ifText', { name })}</p>
  <div class="row"><button class="button primary">${t('guards.add')}</button></div>
</form>`

/** @param {import('./csp.js').PageSettings} change */
const setPages = (change) => updateSettings({ pages: { ...app.settings.value.pages, ...change } })

/** What a web page may do when it opens beside the conversation (D143), in the page, then from the internet, each unless the organisation set it. */
function webPages() {
  const rights = pageRights(app.settings.value, app.policy)
  const { allows, locked: fixed } = rights
  /** @param {import('./csp.js').PageRight} right */
  const one = (right) => html`<li class="setting">
    <div><span class="rule-kind">${t(`pages.${right}`)}</span><p class="muted small">${fixed.has(right) ? lockedBy() : t(`pages.${right}Text`)}</p></div>
    <input type="checkbox" class="switch" role="switch" aria-label=${t(`pages.${right}`)} .checked=${allows[right]} ?disabled=${fixed.has(right) || (right === 'network' && !allows.scripts)}
      @change=${(/** @type {Event} */ e) => setPages({ [right]: /** @type {HTMLInputElement} */ (e.target).checked })}>
    ${right === 'network' && allows.scripts && allows.network ? siteList({ sites: rights.sites, fixed: fixed.has('sites'), set: (sites) => setPages({ sites }), any: true }) : nothing}
  </li>`
  const all = /** @type {import('./csp.js').PageRight[]} */ (Object.keys(PAGE_DEFAULTS))
  return [all.slice(0, 3), all.slice(3)].map((group, i) => html`<section><h3>${t(i ? 'approvals.fromInternet' : 'approvals.inPage')}</h3><ul class="rules">${group.map(one)}</ul></section>`)
}

/** This device's seal (D274): its key's fingerprint, which whoever relies on its certificates checks, or agrees on beforehand. */
const sealPrint = signal('')
function certificates() {
  if (!sealPrint.value) import('../caps/receipt/receipt.js').then(({ fingerprint }) => fingerprint()).then((print) => (sealPrint.value = print))
  return html`<section><h3>${t('seal.title')}</h3><p class="muted">${t('seal.text')}</p>
    <span class="key-command"><code dir="ltr">${sealPrint.value.match(/.{1,4}/g)?.join(' ')}</code><button type="button" class="icon-button subtle" aria-label=${t('action.copy')}
      @click=${() => navigator.clipboard.writeText(sealPrint.value).then(() => notify(t('toast.copied')))}>${icons.copy}</button></span></section>
  ${slots('approvals').map((part) => part.draw({ lockedBy }))}`
}

/** Each page but a kind's: its title, the line under it, what it holds. @type {Record<string, [string, string, () => unknown, (() => boolean)?]>} */
const PAGES = {
  exceptions: ['approvals.exceptions', 'approvals.exceptionsText', exceptions],
  careful: ['approvals.carefulTitle', 'approvals.carefulText', careful],
  pages: ['pages.title', 'pages.text', webPages],
  certificates: ['approvals.certificates', 'approvals.certificatesText', certificates, () => loaded.value.has('receipt')],
}

/** Settings' Approvals: the list, or the page open. */
export function section() {
  const open = pageOpen()
  /** @type {[string, string, () => unknown, (() => boolean)?] | undefined} */
  const page = kinds().includes(open) ? [`kind.${open}.label`, `approvals.covers.${open}`, () => kindPage(open)] : PAGES[open]?.[3]?.() === false ? undefined : PAGES[open]
  if (!page) return list()
  const [title, text, draw] = page
  return html`<button class="back button subtle" @click=${() => go(open === 'careful' ? 'exceptions' : '')}>${icons.back} ${t(open === 'careful' ? 'approvals.exceptions' : 'settings.approvals')}</button>
    <header class="data-head"><div><h2 tabindex="-1">${t(title)}</h2><p class="lede">${t(text, { name })}</p></div></header>${draw()}`
}
