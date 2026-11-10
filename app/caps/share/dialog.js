// Share (D361): "Share" and what is shared on one line, then two tabs where both can be. Share: who, ticked among those the dialog's other
// audiences give (People's people met, Your devices; D727, D700), then the verb, Send a copy, or Work on it together, which Together starts
// once that unlocks it, or a link that invites anyone (caps/together, D733); what goes, each audience's own. Publish: a copy anyone with the
// link reads, its choices folded into one line opened by Change (a password, for how long, kept up to date, with what Jean read), then
// Publish link; once published, the link with its QR code, Send…, Open and Copy link, the password just chosen shown this once, the same
// line, and Stop publishing. Loaded when it first opens.
import { html, svg, nothing } from 'lit-html'
import { signal, effect, untracked } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { t, intlLocales } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { app } from '../../ui/state.js'
import { slots, unlock, isDenied } from '../../ui/caps.js'
import { serviceURL } from '../../core/settings.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { qrOf, linkField, copyText, copied } from '../../ui/qr.js'
import { initialOf } from '../../ui/curtain.js'
import { sharing, shares, shareOf, linkFor, here, create, update, stop, failed, allowed, audiences } from './share.js'

/** The link shown as a QR code instead. */
const qr = icon(svg`<rect x="4.5" y="4.5" width="6" height="6" rx="1"/><rect x="13.5" y="4.5" width="6" height="6" rx="1"/><rect x="4.5" y="13.5" width="6" height="6" rx="1"/><path d="M13.5 13.5h2.5v2.5M19.5 13.5v6h-6M16 19.5v-3"/>`)
/** Letters and digits that read alike in every script's fonts: none of 0, O, 1, l, I. */
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'
/** A password to offer: three groups of four, about 59 bits. */
const offered = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte, i) => `${i && !(i % 4) ? '-' : ''}${LETTERS[byte % LETTERS.length]}`).join('')

/**
 * What Publish's form holds: whether a password closes it, the one typed, whether the one it has is being changed, for how long, with
 * what Jean read, kept up to date, and whether the choices are open.
 * @typedef {{ closed: boolean, word: string, changing: boolean, days: number, read: boolean, keep: boolean, open: boolean }} Choices
 */
const choices = signal(/** @type {Choices} */ ({ closed: false, word: '', changing: false, days: 30, read: false, keep: false, open: false }))
/** Whether this device can change the share shown, whether a link is being sealed, and whether its QR code shows in place of the link. */
const [mine, working, coded] = /** @type {const} */ ([signal(true), signal(false), signal(false)])
/** The password just chosen for a share, which only this dialog ever shows, until it opens again. */
const told = signal(/** @type {{ id: string, word: string } | null} */ (null))
/** Someone an audience gives Share's list, its fingerprints to invite where it has some. @typedef {{ id: string, name: string, note?: string, able: boolean, fps?: string[] }} Who */
/** The tab shown, and who Share's list has ticked, by their audiences' ids. */
const [tab, picked] = [signal(/** @type {'share' | 'publish'} */ ('share')), signal(/** @type {Set<string>} */ (new Set()))]
/** What can be worked on together: a thing its pane names, or a task, shared whole. @param {import('./share.js').What | null} what */
const thingOf = (what) => what?.thing ?? (what && !what.item ? { kind: /** @type {const} */ ('task'), uri: what.path } : null)
/** Whether the relay named keeps what people work on together, as its root says (relay/journal.js), asked once for each relay. */
const [keeps, asked] = [signal(false), { relay: '' }]
/** Whether what is shared can be worked on together here: a relay named that keeps journals, and not in a child's profile (D389). @param {import('./share.js').What | null} what */
const jointly = (what) => Boolean(thingOf(what) && keeps.value && !app.policy.child && !isDenied('together'))
/** The dialog opened on Share, for an answer back, its person ticked (People's `first`). @param {import('../../ui/caps.js').Slot | null} slot */
export const toward = (slot) => { tab.value = 'share'; picked.value = new Set(slot?.first?.(sharing.peek()) ?? []) }

/** A field's handler, taking what it now says into the choices. @param {(field: HTMLInputElement) => Partial<Choices>} pick */
const take = (pick) => (/** @type {Event} */ event) => { choices.value = { ...choices.peek(), ...pick(/** @type {HTMLInputElement} */ (event.target)) } }
/** A day in words: the one a share ends, or one a length chosen now would end. @param {number | string} when @param {'long' | 'medium'} [dateStyle] */
const day = (when, dateStyle = /** @type {'long' | 'medium'} */ ('long')) => new Intl.DateTimeFormat(intlLocales(), { dateStyle }).format(new Date(when))

/** The choices the link of what is shared was made with, folded unless it no longer opens, or a new link's; Publish shown for a link made, else Share. @param {import('./share.js').What | null} what */
function reset(what) {
  const share = what && shareOf(what, shares.peek())
  choices.value = { closed: Boolean(share?.password), word: offered(), changing: false, days: share?.days ?? 30, read: share?.read ?? false, keep: share?.keep ?? false, open: Boolean(share) && Date.parse(share?.expires ?? '') < Date.now() }
  mine.value = true; coded.value = false; told.value = null
  const relay = String(serviceURL('relay', app.settings.peek(), app.policy) ?? '')
  if (relay !== asked.relay) { asked.relay = relay; keeps.value = false; if (relay) fetch(relay).then((answer) => answer.json()).then((root) => { keeps.value = Boolean(root?.journals) }, () => {}) }
  tab.value = share ? 'publish' : 'share'
  picked.value = new Set(audiences().flatMap((one) => one.first?.(what) ?? []))
  if (share) here(share).then((yes) => { if (sharing.peek() === what) mine.value = yes })
}
// Only what is shared resets it: a capability loading or registering again meanwhile (Together's, as it starts) leaves the dialog where it is.
effect(() => { const what = sharing.value; untracked(() => reset(what)) })

/** Makes the link, or changes the one made: its password kept, a new one, or none. @param {SubmitEvent} event */
async function submit(event) {
  event.preventDefault()
  const what = sharing.peek()
  if (!what || working.peek()) return
  const share = shareOf(what, shares.peek())
  const { closed: closing, word, changing, days, read, keep } = choices.peek()
  const password = !closing ? '' : share?.password && !changing ? undefined : word
  working.value = true
  const chosen = { days, read, keep: keep && !what.item }
  // A change says what went wrong itself (update()).
  const now = share ? await update(share, { ...chosen, password, title: what.title }) : await create(what, { ...chosen, password }).catch((error) => void failed(error))
  working.value = false
  // Made or changed, its choices folded again, and a password just chosen shown this once.
  if (now) reset(what)
  if (now && password !== undefined) told.value = password ? { id: now.id, word: password } : null
}

/** Each audience ticked sent a copy, or, together, invited to work on it, or a link that invites anyone; Together unlocked first. @param {import('./share.js').What} what @param {'copy' | 'together' | 'link'} how */
async function go(what, how) {
  const ticked = picked.peek(), chosen = audiences().flatMap((one) => one.who(what).filter((/** @type {Who} */ who) => ticked.has(who.id)).map((/** @type {Who} */ who) => ({ one, who })))
  if (how === 'copy') return Promise.all(audiences().map((one) => ((ids) => ids.length && one.copy(what, ids))(chosen.filter((it) => it.one === one).map((it) => it.who.id)))).catch(failed)
  if (await unlock('together')) await slots('how')[0]?.start?.({ ...what, thing: thingOf(what) }, chosen.flatMap((it) => it.who.fps ?? []), how === 'link').catch(failed)
}

/** Share: what it means, Together's line once worked on together, who, ticked, what goes, then the verbs. @param {import('./share.js').What} what */
function shareTab(what) {
  const ticked = picked.value, both = jointly(what), list = audiences().flatMap((one) => one.who(what))
  const toggle = (/** @type {string} */ id) => { const next = new Set(picked.peek()); if (!next.delete(id)) next.add(id); picked.value = next }
  return html`<p class="share-says">${t('share.shareSays', { name: BRAND.name })}</p>${both ? slots('how').map((part) => part.draw({ ...what, thing: thingOf(what) })) : nothing}
    ${list.length ? html`<ul class="share-who">${list.map((/** @type {Who} */ who) => html`<li><label for=${`share-who-${who.id}`}><input id=${`share-who-${who.id}`} type="checkbox" ?disabled=${!who.able}
      .checked=${ticked.has(who.id)} @change=${() => toggle(who.id)}><span class="avatar" aria-hidden="true">${initialOf(who.name)}</span><span class="item-text"><bdi>${who.name}</bdi>${who.note ? html`<small>${who.note}</small>` : nothing}</span></label></li>`)}</ul>` : nothing}
    ${audiences().map((one) => one.draw(what, ticked.size > 0))}
    ${list.length ? html`<footer class="dialog-foot share-verbs"><button class="button" ?disabled=${!ticked.size} @click=${() => go(what, 'copy')}>${t('share.copy')}</button>
      ${both ? html`<button class="button primary" ?disabled=${!ticked.size} @click=${() => go(what, 'together')}>${icons.people} ${t('share.together')}</button>` : nothing}</footer>` : nothing}
    ${both ? html`<button class="share-text" @click=${() => go(what, 'link')}>${t('share.inviteLink')}</button>` : nothing}`
}

/** Publish: what it means or that it is published, the link, the password just chosen, the choices on one line, opened by Change. @param {import('./share.js').What} what */
function publishTab(what) {
  const share = shareOf(what), link = share ? linkFor(share) : '', live = Boolean(share) && Date.parse(share?.expires ?? '') > Date.now()
  const word = share && told.value?.id === share.id ? told.value.word : '', { closed: closing, changing, days, read, keep, open } = choices.value
  const code = live && coded.value && qrOf(link, t('share.code'))
  const line = [t((share ? share.password : closing) ? 'share.withPassword' : 'share.bare'), share ? t('share.until', { date: day(share.expires, 'medium') }) : t(days === 30 ? 'share.for30' : 'share.forYear'), t((share ? share.keep : keep) ? 'share.keptShort' : 'share.asNow')].join(' · ')
  return html`<p class="share-says" role=${share ? 'status' : nothing}>${!share ? t('share.publishSays', { name: BRAND.name }) : live ? t('share.published', { date: day(share.expires) }) : t('share.ended', { date: day(share.expires) })}</p>
    ${!live ? nothing : code ? html`<button class="share-code-box" aria-label=${t('share.link')} @click=${() => { coded.value = false }}>${code}</button><p class="share-point">${t('share.point')}</p>`
      : linkField(link, t('share.link'), t('share.copyLink'), html`<button class="icon-button" aria-label=${t('share.qr')} @click=${() => { coded.value = true }}>${qr}</button>
        ${'share' in navigator ? html`<button class="icon-button" aria-label=${t('share.send')} @click=${() => navigator.share({ title: what.title, url: link }).catch(() => {})}>${icons.share}</button>` : nothing}
        <a class="icon-button" href=${link} target="_blank" rel="noopener" aria-label=${t('sources.open', { name: what.title || t('conversation.untitled') })}>${icons.external}</a>`)}
    ${word ? html`<div class="apart"><span>${t('share.password')}</span><code class="share-password" dir="ltr">${word}</code>
      <button class="icon-button" aria-label=${t('share.copyPassword')} @click=${() => copyText(word)}>${copied.value === word ? icons.check : icons.copy}</button><small>${t('share.apart')}</small></div>` : nothing}
    ${share && !mine.value ? html`<p class="hint">${t('share.notHere')}</p>` : html`<form id="share-form" class="stack" @submit=${submit}>
      <button type="button" class="share-sum" aria-expanded=${String(open)} @click=${take(() => ({ open: !open }))}>${(share ? share.password : closing) ? icons.lock : icons.globe}<span>${line}</span> ${t('share.change')} ${icons.chevron}</button>
      ${open ? html`<label class="setting" for="share-closed">${t('share.withPassword')}<input id="share-closed" type="checkbox" class="switch" role="switch" .checked=${closing} @change=${take((field) => ({ closed: field.checked, word: offered() }))}></label>
        ${!closing ? nothing : share?.password && !changing ? html`<p class="hint">${t('share.notKept')} <button type="button" class="share-text" @click=${take(() => ({ changing: true, word: offered() }))}>${t('share.changePassword')}</button></p>`
          : html`<span class="share-word"><input name="password" aria-label=${t('share.password')} title=${t('share.password')} required minlength="8" autocomplete="new-password" dir="ltr" .value=${choices.value.word} @input=${take((field) => ({ word: field.value }))}>
            <button type="button" class="icon-button" aria-label=${t('share.another')} @click=${take(() => ({ word: offered() }))}>${icons.retry}</button></span><small class="hint">${t('share.passwordSays')} ${t('share.offered')}</small>`}
        <fieldset><legend>${t('share.howLong')}</legend><div class="share-pick">${[30, 365].map((n) => html`<label for=${`days-${n}`}><input id=${`days-${n}`} type="radio" name="days" .checked=${days === n} @change=${take(() => ({ days: n }))}>${t(n === 30 ? 'share.for30' : 'share.forYear')} <small>${t('share.until', { date: day(Date.now() + n * 86_400_000) })}</small></label>`)}</div></fieldset>
        ${what.item ? nothing : html`<label class="setting" for="share-keep">${t('share.keep')}<input id="share-keep" type="checkbox" class="switch" role="switch" .checked=${keep} @change=${take((field) => ({ keep: field.checked }))}></label>
          <label class="setting" for="share-read">${t('share.read', { name: BRAND.name })}<input id="share-read" type="checkbox" class="switch" role="switch" .checked=${read} @change=${take((field) => ({ read: field.checked }))}></label>`}
        <p class="hint">${t('share.goes', { name: BRAND.name })}</p>` : nothing}${what.sealed ? html`<p class="hint">${t('share.certified')}</p>` : nothing}</form>
      <footer class="dialog-foot">${share ? html`<button class="button subtle danger" @click=${() => stop(share)}>${t('share.stop')}</button>` : nothing}
        ${!share || open ? html`<button class="button primary" form="share-form" ?disabled=${working.value}>${icons.globe} ${t(working.value ? 'share.sealing' : share ? 'share.update' : 'share.publishLink')}</button>` : nothing}</footer>`}`
}

class ShareDialog extends Element {
  render() {
    const what = sharing.value, both = allowed() && (audiences().length > 0 || jointly(what))
    const shown = !allowed() ? 'share' : both ? tab.value : 'publish', live = what && shareOf(what)
    // Left and right move between the tabs, as a tab list's keys do.
    const arrows = (/** @type {KeyboardEvent} */ event) => { if (/^Arrow(Left|Right)$/.test(event.key)) { tab.value = shown === 'share' ? 'publish' : 'share'; requestAnimationFrame(() => /** @type {HTMLElement | null} */ (this.querySelector('[role=tab][aria-selected=true]'))?.focus()) } }
    return html`<dialog class="sheet share-dialog" @close=${closed('share')} @click=${backdrop}>
      ${head(/** @type {any} */ (html`${t('share.title')} <span class="share-what" dir="auto">${what?.title || t('conversation.untitled')}</span>`))}
      ${both ? html`<div class="share-tabs" role="tablist" aria-label=${t('share.title')}>${(/** @type {const} */ (['share', 'publish'])).map((one) => html`<button role="tab" id=${`share-tab-${one}`} aria-controls="share-panel"
        aria-selected=${String(shown === one)} tabindex=${shown === one ? 0 : -1} @click=${() => { tab.value = one }} @keydown=${arrows}>${one === 'share' ? icons.people : icons.globe} ${t(one === 'share' ? 'share.title' : 'share.publish')}${one === 'publish' && live ? html`<span class="share-dot" role="img" aria-label=${t('share.isPublished')}></span>` : nothing}</button>`)}</div>` : nothing}
      <div id="share-panel" class="stack" role=${both ? 'tabpanel' : nothing} aria-labelledby=${both ? `share-tab-${shown}` : nothing}>${what ? (shown === 'share' ? shareTab(what) : publishTab(what)) : nothing}</div>
    </dialog>`
  }

  updated() {
    syncDialog(this, 'share')
  }
}

define('app-share-dialog', ShareDialog)
