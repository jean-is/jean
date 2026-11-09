// Share (D361): to whom first, anyone with the link or only the people chosen, whose pane People draws (its `audience` slot, D727); the
// choice shows where both can. A link: a password or none, a card for each saying what it means, the password chosen in its own before
// the link is made; for how long, each length with the day it ends; for a task, what goes. Once shared, the link or its QR code, a
// password just chosen, shown this once, and the choices folded into one line, opened to change them under the same link or to stop
// sharing. What can be worked on together, where a relay is named, is asked how too: a copy, or working on it together, whose pane
// Together draws once that choice unlocks it (caps/together, D733). Loaded when it first opens.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { t, intlLocales } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { app } from '../../ui/state.js'
import { slots, unlock, isDenied } from '../../ui/caps.js'
import { serviceURL } from '../../core/settings.js'
import { icons } from '../../ui/menu-icons.js'
import { codeOf } from '../../ui/qr.js'
import { sharing, shares, shareOf, linkFor, here, create, update, stop, failed, allowed, audiences } from './share.js'

/** Letters and digits that read alike in every script's fonts: none of 0, O, 1, l, I. */
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'
/** A password to offer: three groups of four, about 59 bits. */
const offered = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte, i) => `${i && !(i % 4) ? '-' : ''}${LETTERS[byte % LETTERS.length]}`).join('')

/**
 * What the form shows: whether a password closes it, the one typed, whether the one it has is being
 * changed, for how long, what goes, and, once shared, whether the choices are open.
 * @typedef {{ closed: boolean, word: string, changing: boolean, days: number, read: boolean, keep: boolean, open: boolean }} Choices
 */
const choices = signal(/** @type {Choices} */ ({ closed: false, word: '', changing: false, days: 30, read: false, keep: false, open: false }))
/** Whether this device can change the share shown, whether a link is being sealed, whether its QR code shows in place of the link, and what was just copied. */
const [mine, working, coded, copied] = /** @type {const} */ ([signal(true), signal(false), signal(false), signal('')])
/** The password just chosen for a share, which only this dialog ever shows, until it opens again. */
const told = signal(/** @type {{ id: string, word: string } | null} */ (null))
/** The audience picked other than a link, People's; none for a link, or the first other where no link can be made. */
const to = signal(/** @type {import('../../ui/caps.js').Slot | null} */ (null))
/** Whether working on it together is chosen, rather than a copy. */
const together = signal(false)
/** Whether what is shared can be worked on together here: a relay named, and not in a child's profile (D389). @param {import('./share.js').What | null} what */
const jointly = (what) => Boolean(what?.thing && serviceURL('relay', app.settings.peek(), app.policy) && !app.policy.child && !isDenied('together'))
/** The dialog opened on an audience: People's for an answer back, none for a link. @param {import('../../ui/caps.js').Slot | null} slot */
export const toward = (slot) => { to.value = slot }

/** The link's QR code for a phone's camera, which share.css draws dark on light, or none where there is none to draw. @param {ReturnType<typeof codeOf>} code */
const drawn = (code) => code && html`<svg class="share-code" role="img" aria-label=${t('share.code')} viewBox="-4 -4 ${code.size + 8} ${code.size + 8}"><path d=${code.d}/></svg><p class="share-point">${t('share.point')}</p>`

/** A field's handler, taking what it now says into the choices. @param {(field: HTMLInputElement) => Partial<Choices>} pick */
const take = (pick) => (/** @type {Event} */ event) => { choices.value = { ...choices.peek(), ...pick(/** @type {HTMLInputElement} */ (event.target)) } }
/** A day in words: the one a share ends, or one a length chosen now would end. @param {number | string} when @param {'long' | 'medium'} [dateStyle] */
const day = (when, dateStyle = /** @type {'long' | 'medium'} */ ('long')) => new Intl.DateTimeFormat(intlLocales(), { dateStyle }).format(new Date(when))
/** Copies the link or the password, whose button says so for two seconds. @param {string} text @param {string} which */
const copy = (text, which) => navigator.clipboard.writeText(text).then(() => { copied.value = which; setTimeout(() => { if (copied.peek() === which) copied.value = '' }, 2000) })

/** The choices the link of what is shared was made with, folded unless it no longer opens, or a new link's. @param {import('./share.js').What | null} what */
function reset(what) {
  const share = what && shareOf(what, shares.peek())
  choices.value = { closed: Boolean(share?.password), word: offered(), changing: false, days: share?.days ?? 30, read: share?.read ?? false, keep: share?.keep ?? false, open: Boolean(share) && Date.parse(share?.expires ?? '') < Date.now() }
  mine.value = true; coded.value = false
  if (share) here(share).then((yes) => { if (sharing.peek() === what) mine.value = yes })
}
effect(() => { reset(sharing.value); told.value = null; to.value = null; together.value = false })

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
  if (now && password !== undefined) told.value = password ? { id: now.id, word: password } : null
  if (now && share) reset(what)
}

class ShareDialog extends Element {
  render() {
    const what = sharing.value
    const share = what && shareOf(what)
    const link = share ? linkFor(share) : ''
    const live = Boolean(share) && Date.parse(share?.expires ?? '') > Date.now()
    const word = share && told.value?.id === share.id ? told.value.word : ''
    const { closed: closing, changing, days, read, keep, open } = choices.value
    const done = (/** @type {string} */ which) => (copied.value === which ? icons.check : icons.copy)
    const others = audiences(), other = others.includes(/** @type {any} */ (to.value)) ? to.value : allowed() ? null : others[0]
    return html`<dialog class="sheet share-dialog" @close=${closed('share')} @click=${backdrop}>
      ${head(t('share.title'))}
      ${what ? html`<p class="lede" dir="auto">${what.title || t('conversation.untitled')}</p>` : nothing}
      ${allowed() && others.length ? html`<div class="share-pick share-to" role="radiogroup" aria-label=${t('share.who')}>${[null, ...others].map((one, i) => html`<label for=${`share-to-${i}`}>
        <input id=${`share-to-${i}`} type="radio" name="to" .checked=${other === one} @change=${() => { to.value = one }}>${one ? one.label() : t('share.anyone')}</label>`)}</div>` : nothing}
      ${jointly(what) ? html`<div class="share-pick" role="radiogroup" aria-label=${t('share.how')}>${[false, true].map((both) => html`<label for=${`share-how-${both}`}>
        <input id=${`share-how-${both}`} type="radio" name="how" .checked=${together.value === both} @change=${() => { together.value = both; if (both) unlock('together') }}>${t(both ? 'share.together' : 'share.copy')}</label>`)}</div>` : nothing}
      ${together.value && jointly(what) ? slots('how').map((part) => part.draw(what, other)) : html`
      ${other ? (what && other.draw(what)) : html`${share ? html`<section class="stack">${live ? html`<div class="share-pick" role="radiogroup" aria-label=${t('share.title')}>${[false, true].map((code) => html`<label for=${`shown-${code}`}><input id=${`shown-${code}`} type="radio" name="shown" .checked=${coded.value === code} @change=${() => { coded.value = code }}>${t(code ? 'share.qr' : 'share.link')}</label>`)}</div>`
            : html`<p>${t('share.ended', { date: day(share.expires) })}</p>`}
          ${(live && coded.value && drawn(codeOf(link))) || html`<div class="share-field">
            <input class="share-link" readonly dir="ltr" title=${t('share.link')} .value=${link} @focus=${(/** @type {Event} */ event) => /** @type {HTMLInputElement} */ (event.target).select()}>
            <button class="button primary" @click=${() => copy(link, 'link')}>${done('link')} <span aria-live="polite">${t(copied.value === 'link' ? 'toast.copied' : 'share.copyLink')}</span></button></div>`}
          ${word ? html`<div class="share-told"><span>${t('share.password')}</span><code class="share-password" dir="ltr">${word}</code>
            <button class="icon-button" aria-label=${t('share.copyPassword')} @click=${() => copy(word, 'word')}>${done('word')}</button><small>${t('share.apart')}</small></div>` : nothing}
          ${!mine.value ? html`<p class="hint">${t('share.notHere')}</p>` : html`<button class="share-sum" aria-expanded=${String(open)} @click=${take(() => ({ open: !open }))}>
            ${share.password ? icons.lock : icons.globe}<span>${t(share.password ? 'share.withPassword' : 'share.anyone')} · ${t('share.until', { date: day(share.expires, 'medium') })}</span> ${t('share.change')} ${icons.chevron}</button>`}</section>` : nothing}
      ${share && !(mine.value && open) ? nothing : html`<section><form id="share-form" class="stack" @submit=${submit}><fieldset><legend>${t('share.password')}</legend>
            <label class="share-choice" for="share-open"><input id="share-open" type="radio" name="who" .checked=${!closing} @change=${take(() => ({ closed: false }))}><span><span><b>${t('share.bare')}</b> <small>${t('share.anyoneSays')}</small></span></span></label>
            <div class="share-choice"><input type="radio" name="who" id="share-closed" .checked=${closing} @change=${take(() => ({ closed: true, word: offered() }))}>
              <span><label for="share-closed"><b>${t('share.withPassword')}</b> <small>${t('share.passwordSays')}</small></label>${!closing ? nothing : share?.password && !changing
                ? html`<small>${t('share.notKept')}</small><button type="button" class="button" @click=${take(() => ({ changing: true, word: offered() }))}>${t('share.changePassword')}</button>`
                : html`<span class="share-word"><input name="password" aria-label=${t('share.password')} title=${t('share.password')} required minlength="8" autocomplete="new-password" dir="ltr" .value=${choices.value.word} @input=${take((field) => ({ word: field.value }))}>
                  <button type="button" class="icon-button" aria-label=${t('share.another')} @click=${take(() => ({ word: offered() }))}>${icons.retry}</button></span><small>${t('share.offered')}</small>`}</span></div>
          </fieldset><fieldset><legend>${t('share.howLong')}</legend><div class="share-pick">${[30, 365].map((n) => html`<label for=${`days-${n}`}><input id=${`days-${n}`} type="radio" name="days" .checked=${days === n} @change=${take(() => ({ days: n }))}>${t(n === 30 ? 'share.for30' : 'share.forYear')} <small>${t('share.until', { date: day(Date.now() + n * 86_400_000) })}</small></label>`)}</div></fieldset>
          ${what?.item ? html`<p class="hint">${t('share.goes', { name: BRAND.name })}</p>` : html`<details class="share-goes"><summary>${icons.file} <span>${t('share.goes', { name: BRAND.name })}</span> ${icons.chevron}</summary>
            <label class="setting" for="share-read">${t('share.read', { name: BRAND.name })}<input id="share-read" type="checkbox" class="switch" role="switch" .checked=${read} @change=${take((field) => ({ read: field.checked }))}></label>
            <label class="setting" for="share-keep">${t('share.keep')}<input id="share-keep" type="checkbox" class="switch" role="switch" .checked=${keep} @change=${take((field) => ({ keep: field.checked }))}></label></details>`}
          ${what?.sealed ? html`<p class="hint">${t('share.certified')}</p>` : nothing}</form></section>`}
      ${share && !mine.value ? nothing : html`<footer class="dialog-foot">${share ? html`<button class="button subtle danger" @click=${() => stop(share)}>${t('share.stop')}</button>` : nothing}
          ${share && !open ? ('share' in navigator ? html`<button class="button" @click=${() => navigator.share({ title: what?.title, url: link }).catch(() => {})}>${icons.share} ${t('share.send')}</button>` : nothing)
            : html`<button class="button primary" form="share-form" ?disabled=${working.value}>${icons.share} ${t(working.value ? 'share.sealing' : share ? 'share.update' : 'share.create')}</button>`}
        </footer>`}`}`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'share')
  }
}

define('app-share-dialog', ShareDialog)
