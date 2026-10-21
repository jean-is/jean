// Share a link (D361): who opens it, anyone with the link or with its password too, for how long,
// and, for a task, whether what Jean read goes with it and whether it follows the task; then the link,
// to copy or send, with the password to send another way. Opened again on what is shared, it shows
// that link, until when, and the choices it was made with, to change under the same link or to stop
// sharing (D379). Loaded when it first opens.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { notify } from '../../ui/state.js'
import { t, locale } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/menu-icons.js'
import { sharing, shares, shareOf, linkFor, here, create, update, stop, failed } from './share.js'

/** Letters and digits that read alike in every script's fonts: none of 0, O, 1, l, I. */
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'
/** A password to offer: three groups of four, about 59 bits. */
const offered = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte, i) => `${i && !(i % 4) ? '-' : ''}${LETTERS[byte % LETTERS.length]}`).join('')

/**
 * What the form shows: whether a password closes it, the one typed, whether the one it has is being
 * changed, for how long, and what goes.
 * @typedef {{ closed: boolean, word: string, changing: boolean, days: number, read: boolean, keep: boolean }} Choices
 */
const choices = signal(/** @type {Choices} */ ({ closed: false, word: '', changing: false, days: 30, read: false, keep: false }))
/** Whether this device can change the share shown, and whether a link is being sealed. */
const mine = signal(true)
const working = signal(false)
/** The password just chosen for a share, which only this dialog ever shows, until it opens again. */
const told = signal(/** @type {{ id: string, word: string } | null} */ (null))

/** A field's handler, taking what it now says into the choices. @param {(field: HTMLInputElement) => Partial<Choices>} pick */
const take = (pick) => (/** @type {Event} */ event) => { choices.value = { ...choices.peek(), ...pick(/** @type {HTMLInputElement} */ (event.target)) } }

/** The choices the link of what is shared was made with, or a new link's. @param {import('./share.js').What | null} what */
function reset(what) {
  const share = what && shareOf(what, shares.peek())
  choices.value = { closed: Boolean(share?.password), word: offered(), changing: false, days: share?.days ?? 30, read: share?.read ?? false, keep: share?.keep ?? false }
  mine.value = true
  if (share) here(share).then((yes) => { if (sharing.peek() === what) mine.value = yes })
}
effect(() => { reset(sharing.value); told.value = null })

/** Makes the link, or changes the one made: its password kept, a new one, or none. @param {SubmitEvent} event */
async function submit(event) {
  event.preventDefault()
  const what = sharing.peek()
  if (!what || working.peek()) return
  const share = shareOf(what, shares.peek())
  const { closed: closing, word, changing, days, read, keep } = choices.peek()
  const password = !closing ? '' : share?.password && !changing ? undefined : word
  working.value = true
  try {
    const chosen = { days, read, keep: keep && !what.item }
    const now = share ? await update(share, { ...chosen, password, title: what.title }) : await create(what, { ...chosen, password })
    if (now && password !== undefined) told.value = password ? { id: now.id, word: password } : null
    if (now && share) reset(what)
  } catch (error) {
    failed(error)
  } finally {
    working.value = false
  }
}

class ShareDialog extends Element {
  render() {
    const what = sharing.value
    const share = what && shareOf(what)
    const link = share ? linkFor(share) : ''
    const date = share ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(share.expires)) : ''
    const word = share && told.value?.id === share.id ? told.value.word : ''
    const { closed: closing, changing, days, read, keep } = choices.value
    return html`<dialog class="sheet share-dialog" @close=${closed('share')} @click=${backdrop}>
      ${head(t('share.title'))}
      ${what ? html`<p class="lede" dir="auto">${what.title || t('conversation.untitled')}</p>` : nothing}
      ${share ? html`<section class="stack">
          <p>${t(Date.parse(share.expires) < Date.now() ? 'share.ended' : share.password ? 'share.madePassword' : 'share.made', { date })}</p>
          <input class="share-link" readonly dir="ltr" .value=${link} @focus=${(/** @type {Event} */ event) => /** @type {HTMLInputElement} */ (event.target).select()}>
          ${word ? html`<p>${t('share.password')}: <code class="share-password" dir="ltr">${word}</code></p>` : nothing}
          <div class="row">
            <button class="button primary" @click=${() => navigator.clipboard.writeText(link).then(() => notify(t('toast.copied')))}>${icons.copy} ${t('share.copyLink')}</button>
            ${'share' in navigator ? html`<button class="button subtle" @click=${() => navigator.share({ title: what?.title, url: link }).catch(() => {})}>${icons.share} ${t('share.send')}</button>` : nothing}
          </div>
          ${mine.value ? nothing : html`<p class="hint">${t('share.notHere')}</p>`}
        </section>` : nothing}
      ${share && !mine.value ? nothing : html`<section><form id="share-form" class="stack" @submit=${submit}>
          <fieldset class="stack">
            <legend class="visually-hidden">${t('share.who')}</legend>
            <label class="item"><input type="radio" name="who" .checked=${!closing} @change=${take(() => ({ closed: false }))}><span class="item-text">${t('share.anyone')}</span></label>
            <label class="item"><input type="radio" name="who" .checked=${closing} @change=${take(() => ({ closed: true, word: offered() }))}><span class="item-text">${t('share.withPassword')}</span></label>
          </fieldset>
          ${!closing ? nothing : share?.password && !changing
            ? html`<div class="row"><button type="button" class="button subtle" @click=${take(() => ({ changing: true, word: offered() }))}>${t('share.changePassword')}</button></div>`
            : html`<label>${t('share.password')}
              <input name="password" required minlength="8" autocomplete="new-password" dir="ltr" .value=${choices.value.word} @input=${take((field) => ({ word: field.value }))}></label>`}
          <label>${t('share.howLong')}
            <select name="days" .value=${String(days)} @change=${take((field) => ({ days: Number(field.value) }))}><option value="30">${t('share.for30')}</option><option value="365">${t('share.forYear')}</option></select></label>
          ${what?.item ? nothing : html`<label class="setting">${t('share.read', { name: BRAND.name })}<input type="checkbox" class="switch" role="switch" .checked=${read} @change=${take((field) => ({ read: field.checked }))}></label>
            <label class="setting">${t('share.keep')}<input type="checkbox" class="switch" role="switch" .checked=${keep} @change=${take((field) => ({ keep: field.checked }))}></label>`}
          <p class="hint">${t('share.goes', { name: BRAND.name })}</p>
          ${what?.sealed ? html`<p class="hint">${t('share.certified')}</p>` : nothing}
        </form></section>
        <footer class="dialog-foot">
          ${share ? html`<button class="button subtle danger" @click=${() => stop(share)}>${t('share.stop')}</button>` : nothing}
          <button class="button ${share ? '' : 'primary'}" form="share-form" ?disabled=${working.value}>${icons.share} ${t(working.value ? 'share.sealing' : share ? 'share.update' : 'share.create')}</button>
        </footer>`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'share')
  }
}

define('app-share-dialog', ShareDialog)
