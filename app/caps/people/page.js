// People (D727), a section of Settings: the people met, each as this person calls them, the name they give themselves beside it, Rename
// and Remove; the invitations this device sent that wait, with the six digits to type once someone accepted one; Add a person, asked who
// it is for, then a code to show beside them or a link to send them, the digits, done. On the invited side, the link that came, asked who
// sent it, then the digits to show or send back, done. Loaded the first time it shows.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { notify } from '../../ui/state.js'
import { sectionOpen } from '../../ui/dialogs.js'
import { codeOf } from '../../ui/qr.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, tParts, intlLocales } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { inviting, accepting, groups, invitations, invite, confirm as right, stopInvite, accept, stopAccept, rename, remove, colleagues, finding, findColleagues, addColleague, trustColleague } from './people.js'

await styleSheet(new URL('../../ui/data-pages.css', import.meta.url))

/** What a step shows, its buttons, and what it says as it comes, or what went wrong. @typedef {{ body?: unknown, buttons?: unknown, said?: string, wrong?: string }} Step */

/** The person whose name is being changed, by fingerprint. */
const renaming = signal('')
/** A name a person gave, set apart in a sentence of Jean's, whichever way it reads. @param {string} name */
const named = (name) => html`<bdi>${name}</bdi>`
/** @param {...unknown} buttons */
const row = (...buttons) => html`<div class="row people-actions">${buttons}</div>`
/** @param {() => unknown} act @param {string} [label] */
const quit = (act, label = 'people.cancel') => html`<button class="button subtle" @click=${act}>${t(label)}</button>`
/** Enter while an IME composes ends the word, never sends. @param {KeyboardEvent} e */
const composing = (e) => { if (e.isComposing && e.key === 'Enter') e.preventDefault() }
/** A form's one field, by name. @param {Event} e @param {string} name */
const valueIn = (e, name) => String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get(name) ?? '').trim()
/** The link, to copy. @param {string} link */
const field = (link) => html`<div class="people-field"><input readonly dir="ltr" title=${t('people.link')} .value=${link} @focus=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).select()}>
  <button class="button" @click=${() => navigator.clipboard.writeText(link).then(() => notify(t('toast.copied')))}>${icons.copy} ${t('people.copy')}</button></div>`

/** The six digits typed for an invitation: wrong, selected to type again. @param {string} id @param {SubmitEvent} event */
async function typed(id, event) {
  event.preventDefault()
  const input = /** @type {HTMLInputElement} */ (/** @type {HTMLFormElement} */ (event.target).elements.namedItem('code'))
  if (!(await right(id, input.value))) input.select()
}
/** The form the digits are typed in. @param {string} id @param {string} label */
const digits = (id, label) => html`<form class="stack" @submit=${(/** @type {SubmitEvent} */ e) => typed(id, e)}><label for=${`people-code-${id}`}>${label}</label>
  <input id=${`people-code-${id}`} class="people-type" name="code" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" dir="ltr" required @keydown=${composing}>
  <div class="row"><button class="button primary">${t('people.confirm')}</button></div></form>`

/** The step under way, inviting or accepting, or none. @returns {Step | null} */
function step() {
  const [a, b, name] = [inviting.value, accepting.value, BRAND.name]
  if (b.step === 'ask') return { body: html`<form class="stack" id="people-accept" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); accept(b.link, valueIn(e, 'name')) }}>
      <h3 tabindex="-1">${t('people.invited', { name })}</h3><label for="people-from">${t('people.from')}</label>
      <input id="people-from" name="name" required maxlength="80" dir="auto" autocomplete="off" @keydown=${composing}><p class="hint">${t('people.seen')}</p></form>`,
    buttons: row(html`<button class="button primary" form="people-accept">${t('people.accept')}</button>`, quit(stopAccept, 'people.notNow')) }
  if (b.step === 'waiting') return { said: t('people.accepting'), buttons: row(quit(stopAccept)) }
  if (b.step === 'code') return { body: html`<h3 tabindex="-1">${t('people.showCode')}</h3><p class="people-digits" dir="ltr">${b.code.slice(0, 3)} ${b.code.slice(3)}</p>
      ${b.theirs ? html`<p>${tParts('people.calls', { name: named(b.theirs) })}</p>` : nothing}`, buttons: row(quit(stopAccept)) }
  if (b.step === 'done') return { said: t('people.metThem', { name: b.name }), buttons: row(quit(() => { accepting.value = { step: 'idle' } }, 'people.ok')) }
  if (b.step === 'failed') return { wrong: t(`people.why.${b.reason}`, { name }), buttons: row(quit(() => { accepting.value = { step: 'idle' } }, 'people.close')) }
  if (a.step === 'name') return { body: html`<form class="stack" id="people-who" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); invite(valueIn(e, 'name'), /** @type {any} */ (e).submitter?.value === 'link' ? 'link' : 'side') }}>
      <label for="people-who-name">${t('people.who')}</label><input id="people-who-name" name="name" required maxlength="80" dir="auto" autocomplete="off" @keydown=${composing}></form>`,
    buttons: row(html`<button class="button primary" form="people-who" value="side">${t('people.side')}</button>`, html`<button class="button" form="people-who" value="link">${t('people.apart')}</button>`, quit(() => stopInvite())) }
  if (a.step === 'waiting') {
    const code = a.way === 'side' && a.link.startsWith('http') ? codeOf(a.link) : null
    return { body: html`<h3 tabindex="-1">${t(a.way === 'side' ? 'people.scan' : 'people.send', { name: a.name })}</h3>
      ${code ? html`<svg class="people-qr" role="img" aria-label=${t('people.qr')} viewBox="-4 -4 ${code.size + 8} ${code.size + 8}"><path d=${code.d}/></svg>` : nothing}
      <p>${t(a.way === 'side' ? 'people.point' : 'people.week')}</p>${field(a.link)}`, said: t('people.waiting'),
    buttons: row(a.way === 'link' && 'share' in navigator ? html`<button class="button" @click=${() => navigator.share({ url: a.link }).catch(() => {})}>${icons.share} ${t('people.share')}</button>` : nothing,
      a.way === 'link' ? quit(() => stopInvite(), 'people.later') : nothing, quit(() => stopInvite(a.id))) }
  }
  if (a.step === 'code') return { body: digits(a.id, t('people.typeCode', { name: a.name })), wrong: a.left < 3 ? t('people.wrong', { count: a.left }) : '', buttons: row(quit(() => stopInvite(a.id))) }
  if (a.step === 'done') return { said: t('people.added', { name: a.name }), buttons: row(quit(() => { inviting.value = { step: 'idle' } }, 'people.ok')) }
  if (a.step === 'failed') return { wrong: t(`people.why.${a.reason}`, { name }), buttons: row(quit(() => { inviting.value = { step: 'idle' } }, 'people.close')) }
  return null
}

/** At work, colleagues found on the organisation's list by a few words, each kept with Add (D731). */
function finder() {
  const now = finding.value, kept = new Set(groups.value.map((one) => one.account))
  return html`<form class="stack" role="search" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); findColleagues(valueIn(e, 'q')) }}><label for="people-find">${t('people.find')}</label>
    <div class="people-field"><input id="people-find" name="q" type="search" required minlength="3" dir="auto" autocomplete="off" @keydown=${composing}><button class="button">${t('people.search')}</button></div></form>
    <p class="hint" role="status">${now.wrong ? t('people.why.relay', { name: BRAND.name }) : now.found && !now.found.length ? t('people.nobody', { name: BRAND.name }) : ''}</p>
    ${now.found?.length ? html`<ul class="list">${now.found.map((one) => html`<li><span class="item-text"><strong dir="auto">${one.name}</strong><small dir="ltr">${one.account}</small></span>
      <button class="button subtle" ?disabled=${kept.has(one.account)} @click=${() => addColleague(one)}>${t(kept.has(one.account) ? 'people.kept' : 'people.keep')}</button></li>`)}</ul>` : nothing}`
}

/** At rest: colleagues to find at work, the people met, the invitations waiting here, and Add a person. */
function rest() {
  const date = new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium' })
  const list = [...groups.value].sort((x, y) => x.name.localeCompare(y.name, intlLocales()))
  return html`${colleagues ? finder() : nothing}${list.length ? html`<ul class="list">${list.map((one) => html`<li>${renaming.value === one.fp
      ? html`<form class="people-field" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); rename(one.fps, valueIn(e, 'name') || one.name).then(() => { renaming.value = '' }) }}>
          <input name="name" required maxlength="80" dir="auto" title=${t('people.rename')} .value=${one.name} @keydown=${composing}><button class="button">${t('people.save')}</button></form>`
      : html`<span class="item-text"><strong dir="auto">${one.name}</strong><small>${one.asking ? t('people.newDevice') : one.again ? t('people.again') : one.waiting ? t('people.answer', { name: one.name })
          : one.account ? html`<span dir="ltr">${one.account}</span>` : tParts('people.calls', { name: named(one.said) })}</small></span>
        ${one.asking && one.account ? html`<button class="button subtle" @click=${() => trustColleague(String(one.account))}>${t('people.trust')}</button>` : nothing}
        <button class="button subtle" @click=${() => { renaming.value = one.fp }}>${t('people.rename')}</button>
        <button class="button subtle danger" @click=${() => confirmRemove(one)}>${t('action.remove')}</button>`}</li>`)}</ul>` : nothing}
    ${invitations.value.length ? html`<h3>${t('people.invitations')}</h3><ul class="list">${invitations.value.map((one) => html`<li>${one.code
      ? digits(one.id, t('people.accepted', { name: one.name }))
      : html`<span class="item-text"><strong dir="auto">${one.name}</strong><small>${t('people.sent', { date: date.format(new Date(one.at)) })}</small></span>`}
      <button class="button subtle" @click=${() => stopInvite(one.id)}>${t('people.cancel')}</button></li>`)}</ul>` : nothing}
    <div class="row"><button id="people-add" class="button primary" @click=${() => { inviting.value = { step: 'name' } }}>${icons.plus} ${t('people.add')}</button></div>`
}

/** Remove, asked first: what came from them stays. @param {{ fps: string[], name: string }} one */
const confirmRemove = (one) => confirm(t('people.remove', { name: one.name })) && remove(one.fps)

// A step that changes takes the keyboard to what it asks for now: a field, its title, its first button, or Add a person.
let was = ''
effect(() => {
  const now = `${inviting.value.step} ${accepting.value.step}`
  if (was && now !== was) requestAnimationFrame(() => sectionOpen() === 'people' && /** @type {HTMLElement | null} */ (document.querySelector('.people-flow input:not([readonly])')
    ?? document.querySelector('.people-flow h3') ?? document.querySelector('.people-actions .button') ?? document.getElementById('people-add'))?.focus())
  was = now
})

/** People: its head, then the step under way or the people at rest; what a step says, then its buttons. */
export function section() {
  const now = step()
  return html`<header class="data-head"><div><h2 tabindex="-1">${t('cap.people.name')}</h2><p class="lede">${t('people.line', { name: BRAND.name })}</p></div></header>
    <div class="people-flow">${now ? now.body : rest()}
    <p class="people-said" role="status">${now?.said ?? ''}</p><p class="people-wrong" role="alert">${now?.wrong ?? ''}</p>${now?.buttons ?? nothing}</div>`
}
