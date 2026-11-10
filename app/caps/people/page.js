// People (D727), a section of Settings: the people met, each as this person calls them, the name they give themselves beside it, Rename
// and Remove; the invitations this device sent that wait, with the six digits to type once someone accepted one; Add a person, asked who
// it is for, then a code to show beside them or a link to send them, the digits, done. On the invited side, the link that came, asked who
// sent it, then the digits to show or send back, done. Loaded the first time it shows.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { sectionOpen } from '../../ui/dialogs.js'
import { qrOf, linkField, composing, digitsOf, sixDigits } from '../../ui/qr.js'
import { follow } from '../../ui/rail.js'
import { initialOf } from '../../ui/curtain.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, tParts, intlLocales } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { inviting, accepting, groups, invitations, invite, confirm as right, stopInvite, accept, stopAccept, rename, remove, colleagues, meets, finding, findColleagues, addColleague, trustColleague } from './people.js'

await styleSheet(new URL('../../ui/data-pages.css', import.meta.url))

/** What a step shows, its buttons, what it says as it comes, waiting on the other person, or what went wrong. @typedef {{ body?: unknown, buttons?: unknown, said?: string, waits?: boolean, wrong?: string }} Step */

/** The person whose name is being changed, by fingerprint. */
const renaming = signal('')
/** A name a person gave, set apart in a sentence of Jean's, whichever way it reads. @param {string} name */
const named = (name) => html`<bdi>${name}</bdi>`
/** @param {...unknown} buttons */
const row = (...buttons) => html`<div class="row people-actions">${buttons}</div>`
/** @param {() => unknown} act @param {string} [label] */
const quit = (act, label = 'people.cancel', kind = 'button subtle') => html`<button class=${kind} @click=${act}>${t(label)}</button>`
/** A form's one field, by name. @param {Event} e @param {string} name */
const valueIn = (e, name) => String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get(name) ?? '').trim()
/** A colleague's account, and Guest where the organisation's list calls them one. @param {{ account?: string, guest?: true }} one */
const account = (one) => html`<span dir="ltr">${one.account}</span>${one.guest ? html` · ${t('people.guest')}` : nothing}`
/** The six digits typed for an invitation, in six boxes, Cancel or another button beside Add. @param {string} id @param {string} label @param {...unknown} also */
const digits = (id, label, ...also) => sixDigits(`people-code-${id}`, label, t('people.confirm'), (code) => right(id, code), nothing, ...also)

/** The step under way, inviting or accepting, or none. @returns {Step | null} */
function step() {
  const [a, b, name] = [inviting.value, accepting.value, BRAND.name]
  if (b.step === 'ask') return { body: html`<form class="stack" id="people-accept" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); accept(b.link, valueIn(e, 'name')) }}>
      <h3 tabindex="-1">${t('people.invited', { name })}</h3><label for="people-from">${t('people.from')}</label>
      <input id="people-from" name="name" required maxlength="80" dir="auto" autocomplete="off" @keydown=${composing}><p class="hint">${t('people.seen')}</p></form>`,
    buttons: row(html`<button class="button primary" form="people-accept">${t('people.accept')}</button>`, quit(stopAccept, 'people.notNow')) }
  if (b.step === 'waiting') return { said: t('people.accepting'), waits: true, buttons: row(quit(stopAccept)) }
  if (b.step === 'code') return { body: html`<h3 tabindex="-1">${t('people.showCode')}</h3>${digitsOf(b.code)}
      ${b.theirs ? html`<p>${tParts('people.calls', { name: named(b.theirs) })}</p>` : nothing}`, buttons: row(quit(stopAccept)) }
  if (b.step === 'done') return { said: t('people.metThem', { name: b.name }), buttons: row(quit(() => { accepting.value = { step: 'idle' } }, 'people.ok', 'button primary')) }
  if (b.step === 'failed') return { wrong: t(`people.why.${b.reason}`, { name }), buttons: row(quit(() => { accepting.value = { step: 'idle' } }, 'people.close')) }
  if (a.step === 'name') return { body: html`<form class="stack" id="people-who" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); invite(valueIn(e, 'name'), /** @type {any} */ (e).submitter?.value === 'link' ? 'link' : 'side') }}>
      <label for="people-who-name">${t('people.who')}</label><input id="people-who-name" name="name" required maxlength="80" dir="auto" autocomplete="off" @keydown=${composing}></form>`,
    buttons: row(html`<button class="button primary" form="people-who" value="side">${t('people.side')}</button>`, html`<button class="button" form="people-who" value="link">${t('people.apart')}</button>`, quit(() => stopInvite())) }
  // The invitation as a QR code to scan beside them, or its link to send, through the system's sheet where there is one.
  if (a.step === 'waiting') return { body: html`<h3 tabindex="-1">${t(a.way === 'side' ? 'people.scan' : 'people.send', { name: a.name })}</h3>${a.way === 'side' && a.link.startsWith('http') ? qrOf(a.link, t('people.qr')) : nothing}
      <p>${t(a.way === 'side' ? 'people.point' : 'people.week')}</p>${linkField(a.link, t('people.link'), t('people.copy'), a.way === 'link' && 'share' in navigator ? html`<button class="icon-button" aria-label=${t('people.share')}
        @click=${() => navigator.share({ url: a.link }).catch(() => {})}>${icons.share}</button>` : nothing)}`, said: t('people.waiting'), waits: true, buttons: row(a.way === 'link' ? quit(() => stopInvite(), 'people.later') : nothing, quit(() => stopInvite(a.id))) }
  if (a.step === 'code') return { body: digits(a.id, t('people.typeCode', { name: a.name }), quit(() => stopInvite(a.id))), wrong: a.left < 3 ? t('people.wrong', { count: a.left }) : '' }
  if (a.step === 'done') return { said: t('people.added', { name: a.name }), buttons: row(quit(() => { inviting.value = { step: 'idle' } }, 'people.ok', 'button primary')) }
  if (a.step === 'failed') return { wrong: t(`people.why.${a.reason}`, { name }), buttons: row(quit(() => { inviting.value = { step: 'idle' } }, 'people.close')) }
  return null
}

/** An invitation from the person's own mail, to the address searched for when it is one, which their link brings in once they sign in. @param {string} asked @param {string} link */
const mailTo = (asked, link) => `mailto:${/^[^\s@]+@[^\s@]+$/.test(asked) ? encodeURIComponent(asked) : ''}?subject=${encodeURIComponent(t('people.mailSubject', { name: BRAND.name }))}&body=${encodeURIComponent(t('people.mailBody', { name: BRAND.name, link }))}`

/** At work, colleagues found on the organisation's list by a few words, each kept with Add, and someone not on it invited by email (D731). */
function finder() {
  const now = finding.value, kept = new Set(groups.value.map((one) => one.account))
  return html`<form class="stack" role="search" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); findColleagues(valueIn(e, 'q')) }}><label for="people-find">${t('people.find')}</label>
    <div class="people-field"><input id="people-find" name="q" type="search" required minlength="3" dir="auto" autocomplete="off" @keydown=${composing}><button class="button">${t('people.search')}</button></div></form>
    <p class="hint" role="status">${now.wrong ? t('people.why.relay', { name: BRAND.name }) : now.found && !now.found.length ? t('people.nobody', { name: BRAND.name }) : ''}</p>
    ${now.found && !now.found.length && now.link ? html`<div class="row"><a class="button" href=${mailTo(now.asked, now.link)}>${icons.share} ${t('people.inviteMail')}</a></div>` : nothing}
    ${now.found?.length ? html`<ul class="list">${now.found.map((one) => html`<li><span class="item-text"><strong dir="auto">${one.name}</strong><small>${account(one)}</small></span>
      <button class="button subtle" ?disabled=${kept.has(one.account)} @click=${() => addColleague(one)}>${t(kept.has(one.account) ? 'people.kept' : 'people.keep')}</button></li>`)}</ul>` : nothing}`
}

/** At rest: colleagues to find at work, the people met, the invitations waiting here, and Add a person, unless the organisation adds people from its list alone. */
function rest() {
  const date = new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium' })
  const list = [...groups.value].sort((x, y) => x.name.localeCompare(y.name, intlLocales()))
  return html`${colleagues ? finder() : nothing}${list.length ? html`<ul class="list">${list.map((one) => html`<li>${renaming.value === one.fp
      ? html`<form class="people-field" @submit=${(/** @type {SubmitEvent} */ e) => { e.preventDefault(); rename(one.fps, valueIn(e, 'name') || one.name).then(() => { renaming.value = '' }) }}>
          <input name="name" required maxlength="80" dir="auto" title=${t('people.rename')} .value=${one.name} @keydown=${composing}><button class="button">${t('people.save')}</button></form>`
      : html`<span class="avatar" aria-hidden="true">${initialOf(one.name)}</span><span class="item-text"><strong dir="auto">${one.name}</strong>${((sub) => (sub ? html`<small>${sub}</small>` : nothing))(one.asking
          ? t('people.newDevice') : one.again ? t('people.again') : one.waiting ? t('people.answer', { name: one.name }) : one.account ? account(one) : alias(one) && tParts('people.calls', { name: named(one.said) }))}</span>
        ${one.asking && one.account ? html`<button class="button subtle" @click=${() => trustColleague(String(one.account))}>${t('people.trust')}</button>` : nothing}
        <button class="button subtle" @click=${() => { renaming.value = one.fp }}>${t('people.rename')}</button>
        <button class="button subtle danger" @click=${() => confirmRemove(one)}>${t('action.remove')}</button>`}</li>`)}</ul>` : nothing}
    ${invitations.value.length ? html`<h3>${t('people.invitations')}</h3><ul class="list">${invitations.value.map((one) => html`<li>${one.code
      ? digits(one.id, t('people.accepted', { name: one.name }))
      : html`<span class="item-text"><strong dir="auto">${one.name}</strong><small>${t('people.sent', { date: date.format(new Date(one.at)) })}</small></span>`}
      <button class="button subtle" @click=${() => stopInvite(one.id)}>${t('people.cancel')}</button></li>`)}</ul>` : nothing}
    ${meets ? html`<div class="row"><button id="people-add" class="button primary" @click=${() => { inviting.value = { step: 'name' } }}>${icons.plus} ${t('people.add')}</button></div>` : nothing}`
}

/** Whether the name they give themselves says more than the one they are known by here, as it does when someone else accepted the invitation. @param {{ name: string, said: string }} one */
const alias = ({ name, said }) => Boolean(said.trim()) && !name.toLocaleLowerCase().includes(said.trim().toLocaleLowerCase())
/** Remove, asked first: what came from them stays. @param {{ fps: string[], name: string }} one */
const confirmRemove = (one) => confirm(t('people.remove', { name: one.name })) && remove(one.fps)

// A step takes the keyboard to what it asks for now: a field, its title, its first button, or Add a person.
follow(() => `${inviting.value.step} ${accepting.value.step}`, () => sectionOpen() === 'people', ['.people-flow input:not([readonly])', '.people-flow h3', '.people-actions .button', '#people-add'])

/** People: its head, then the step under way or the people at rest; what a step says, then its buttons. */
export function section() {
  const now = step()
  return html`<header class="data-head"><div><h2 tabindex="-1">${t('cap.people.name')}</h2><p class="lede">${t('people.line', { name: BRAND.name })}</p></div></header>
    <div class="people-flow">${now ? now.body : rest()}
    <p class=${now?.waits ? 'people-said waits' : 'people-said'} role="status">${now?.said ?? ''}</p><p class="people-wrong" role="alert">${now?.wrong ?? ''}</p>${now?.buttons ?? nothing}</div>`
}
