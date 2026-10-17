// The dialog that adds a profile (D228): its name, this one's if it has none yet, and whether it is a
// child's, born when, with what a parent decides and sees there. A child's needs this profile locked
// first, then the parent's password or passkey. Loaded when it first opens.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { unlock } from '../../ui/caps.js'
import { app, effective } from '../../ui/state.js'
import { syncDialog, closed, backdrop, head, openSettings } from '../../ui/dialogs.js'
import { t } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { self, make, refresh } from './profiles.js'

/** Whether it is a child's; then what was chosen, while the parent's way in is asked for. */
const form = signal(/** @type {{ child: boolean, chosen?: { name: string, mine: string, born: number } }} */ ({ child: false }))
/** The lock, for a child's: the parent's way in. @type {typeof import('../lock/lock.js') | null} */
let lock = null

/** Opens it, with the profiles as they are now: this one may have been locked since. */
export async function open() {
  form.value = { child: false }
  await refresh()
  app.dialog.value = 'profile'
}

/** @param {SubmitEvent} event */
async function submit(event) {
  event.preventDefault()
  const data = new FormData(/** @type {HTMLFormElement} */ (event.target))
  const chosen = { name: String(data.get('name')).trim(), mine: String(data.get('mine') ?? '').trim() }
  if (!form.peek().child) return make(chosen)
  // A concern is told on this device once the parent said yes, asked while their click still counts.
  globalThis.Notification?.requestPermission().catch(() => {})
  lock ??= await import('../lock/lock.js')
  form.value = { child: true, chosen: { ...chosen, born: Number(data.get('born')) } }
}

class ProfileDialog extends Element {
  render() {
    const { child, chosen } = form.value
    const locked = self.value?.locked
    const year = new Date().getFullYear()
    return html`<dialog class="sheet profile-dialog" aria-label=${t('profiles.add')} @close=${closed('profile')} @click=${backdrop}>
      ${head(t('profiles.add'))}
      <p class="lede">${t('profiles.what')}</p>
      ${chosen ? html`<p>${t('profiles.asParent')}</p>${lock?.ways((raw) => make(chosen, raw))}` : html`<form class="stack" @submit=${submit}>
        ${self.value?.name ? nothing : html`<label>${t('profiles.yours')}<input name="mine" required maxlength="40" dir="auto" autocomplete="off" .value=${effective.value.settings.name ?? ''}></label>`}
        <label>${t('profiles.name')}<input name="name" required maxlength="40" dir="auto" autocomplete="off"></label>
        <label class="check"><input type="checkbox" .checked=${child} @change=${(/** @type {Event} */ e) => { form.value = { child: /** @type {HTMLInputElement} */ (e.target).checked } }}>${t('profiles.forChild')}</label>
        ${child ? html`<label>${t('profiles.born')}<select name="born">${Array.from({ length: 16 }, (_, i) => year - 3 - i).map((born) => html`<option ?selected=${born === year - 10}>${born}</option>`)}</select></label>
          <p class="hint">${t('profiles.childText')}</p>${locked ? nothing : html`<p role="alert">${t('profiles.lockFirst')}</p>`}` : nothing}
        <div class="row">${child && !locked ? html`<button type="button" class="button primary" @click=${() => unlock('lock').then(() => openSettings('data'))}>${icons.lock} ${t('profiles.lockMine')}</button>`
          : html`<button class="button primary">${t('profiles.make')}</button>`}</div></form>`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'profile')
  }
}

define('app-profile-dialog', ProfileDialog)
