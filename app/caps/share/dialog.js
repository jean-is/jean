// Share a link (D361): who opens it, anyone with the link or with its password too, for how long,
// and, for a task, whether what Jean read goes with it and whether it follows the task; then the link,
// to copy or send, with the password to send another way. Loaded when it first opens.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, close, backdrop, head } from '../../ui/dialogs.js'
import { notify, showError } from '../../ui/state.js'
import { t, locale } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/icons.js'
import { sharing, made, create } from './share.js'

/** Letters and digits that read alike in every script's fonts: none of 0, O, 1, l, I. */
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'
/** A password to offer: three groups of four, about 59 bits. */
const offered = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte, i) => `${i && !(i % 4) ? '-' : ''}${LETTERS[byte % LETTERS.length]}`).join('')

/** Whether the password is asked for, the one offered, and whether a link is being made. */
const closedBy = signal(false)
const password = signal(offered())
const working = signal(false)

/** @param {SubmitEvent} event */
async function submit(event) {
  event.preventDefault()
  const what = sharing.peek()
  if (!what || working.peek()) return
  const typed = new FormData(/** @type {HTMLFormElement} */ (event.target))
  working.value = true
  try {
    const word = closedBy.peek() ? String(typed.get('password') ?? '') : ''
    const { link, expires } = await create(what, { password: word, days: Number(typed.get('days')) || 30, read: typed.get('read') === 'on', keep: typed.get('keep') === 'on' })
    made.value = { link, password: word, expires }
  } catch (error) {
    showError(error)
  } finally {
    working.value = false
  }
}

/** The link, to the clipboard. @param {string} link */
const copy = (link) => navigator.clipboard.writeText(link).then(() => notify(t('toast.copied')))

class ShareDialog extends Element {
  render() {
    const what = sharing.value
    const done = made.value
    const date = done ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(done.expires)) : ''
    return html`<dialog class="sheet share-dialog" @close=${closed('share')} @click=${backdrop}>
      ${head(t('share.title'))}
      ${what ? html`<p class="lede" dir="auto">${what.title || t('conversation.untitled')}</p>` : nothing}
      ${done ? html`<section class="stack">
          <p>${t(done.password ? 'share.madePassword' : 'share.made', { date })}</p>
          <input class="share-link" readonly dir="ltr" .value=${done.link} @focus=${(/** @type {Event} */ event) => /** @type {HTMLInputElement} */ (event.target).select()}>
          ${done.password ? html`<p>${t('share.password')}: <code class="share-password" dir="ltr">${done.password}</code></p>` : nothing}
          <div class="row">
            <button class="button primary" @click=${() => copy(done.link)}>${icons.copy} ${t('share.copyLink')}</button>
            ${'share' in navigator ? html`<button class="button subtle" @click=${() => navigator.share({ title: what?.title, url: done.link }).catch(() => {})}>${icons.upload} ${t('share.send')}</button>` : nothing}
          </div>
        </section>
        <footer class="dialog-foot"><button class="button" @click=${close}>${t('share.done')}</button></footer>`
      : html`<form id="share-form" class="stack" @submit=${submit}>
          <fieldset class="stack">
            <legend class="visually-hidden">${t('share.who')}</legend>
            <label class="item"><input type="radio" name="who" .checked=${!closedBy.value} @change=${() => { closedBy.value = false }}><span class="item-text">${t('share.anyone')}</span></label>
            <label class="item"><input type="radio" name="who" .checked=${closedBy.value} @change=${() => { closedBy.value = true; password.value = offered() }}><span class="item-text">${t('share.withPassword')}</span></label>
          </fieldset>
          ${closedBy.value ? html`<label>${t('share.password')}
            <input name="password" required minlength="8" autocomplete="new-password" dir="ltr" .value=${password.value}></label>` : nothing}
          <label>${t('share.howLong')}
            <select name="days"><option value="30">${t('share.for30')}</option><option value="365">${t('share.forYear')}</option></select></label>
          ${what?.item ? nothing : html`<label class="setting">${t('share.read', { name: BRAND.name })}<input type="checkbox" class="switch" role="switch" name="read"></label>
            <label class="setting">${t('share.keep')}<input type="checkbox" class="switch" role="switch" name="keep"></label>`}
          <p class="hint">${t('share.goes', { name: BRAND.name })}</p>
          ${what?.sealed ? html`<p class="hint">${t('share.certified')}</p>` : nothing}
        </form>
        <footer class="dialog-foot">
          <button class="button primary" form="share-form" ?disabled=${working.value}>${icons.upload} ${t(working.value ? 'share.sealing' : 'share.create')}</button>
        </footer>`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'share')
  }
}

define('app-share-dialog', ShareDialog)
