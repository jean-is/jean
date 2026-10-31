// The dialog that adds a profile (D228), in steps: its name, this one's if it has none yet, and whom it is for;
// for a child, their year of birth and what their profile is set to at that age, with the brains of this one it is given, shown before it is made; then this
// profile's lock, set here if it has none, so the child can't open it, and the parent's password or passkey. Loaded when it first opens.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { unlock } from '../../ui/caps.js'
import { app } from '../../ui/state.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { t } from '../../core/i18n.js'
import { tierFor } from './tier.js'
import { self, make, refresh, forChild } from './profiles.js'
import { baskets, facts, years } from './view.js'

/** Where the dialog is, what was typed, and whether it is a child's, born when. @typedef {{ step: 'who' | 'set' | 'lock', child: boolean, name: string, mine: string, born: number }} Form */
const form = signal(/** @type {Form} */ ({ step: 'who', child: false, name: '', mine: '', born: 0 }))
/** The lock, for a child's: set here if this profile has none, then the parent's way in. @type {typeof import('../lock/lock.js') | null} */
let lock = null

/** Opens it, with the profiles as they are now (this one may have been locked since), as a child's when the family page asks (?child), never from one. @param {boolean} [child] */
export async function open(child = false) {
  form.value = { step: 'who', child, name: '', mine: '', born: new Date().getFullYear() - 10 }
  await refresh()
  if (!(child && self.peek()?.parent)) app.dialog.value = 'profile'
}

/** @param {Partial<Form>} patch */
const set = (patch) => { form.value = { ...form.value, ...patch } }
/** @param {Event} e */
const value = (e) => /** @type {HTMLInputElement} */ (e.target).value

/** Its name and whom it is for: a grown-up's is made at once; a child's goes on. @param {SubmitEvent} event */
async function next(event) {
  event.preventDefault()
  const { step, child, name, mine } = form.value
  if (!child) return make({ name: name.trim(), mine: mine.trim() })
  if (step === 'set') {
    // A concern is told on this device once the parent said yes, asked while their click still counts.
    globalThis.Notification?.requestPermission().catch(() => {})
    await unlock('lock')
    lock ??= await import('../lock/lock.js')
  }
  set({ step: step === 'who' ? 'set' : 'lock' })
}

class ProfileDialog extends Element {
  render() {
    const { step, child, name, mine, born } = form.value
    const year = new Date().getFullYear()
    const steps = child ? html`<ol class="profile-steps">${['who', 'set', 'lock'].map((each) => html`<li aria-current=${each === step ? 'step' : 'false'}>${t(`profiles.step.${each}`)}</li>`)}</ol>` : nothing
    const back = html`<button type="button" class="button subtle" @click=${() => set({ step: step === 'lock' ? 'set' : 'who' })}>${t('profiles.back')}</button>`
    return html`<dialog class="sheet profile-dialog" aria-label=${t('profiles.add')} @close=${closed('profile')} @click=${backdrop}>
      ${head(t('profiles.add'))}${steps}
      ${step === 'who' ? html`<p class="lede">${t('profiles.what')}</p><form class="stack" @submit=${next}>
        ${self.value?.name ? nothing : html`<label>${t('profiles.yours')}<input required maxlength="40" dir="auto" autocomplete="off" .value=${mine} @input=${(/** @type {Event} */ e) => set({ mine: value(e) })}></label>`}
        <label>${t('profiles.name')}<input required maxlength="40" dir="auto" autocomplete="off" .value=${name} @input=${(/** @type {Event} */ e) => set({ name: value(e) })}></label>
        <fieldset class="profile-for"><legend>${t('profiles.for')}</legend>${[false, true].map((kid) => html`<label class="choice"><input type="radio" name="for" .checked=${child === kid} @change=${() => set({ child: kid })}>
          <span class="item-text"><strong>${t(kid ? 'profiles.forChild' : 'profiles.forAdult')}</strong><small>${t(kid ? 'profiles.forChildText' : 'profiles.forAdultText')}</small></span></label>`)}</fieldset>
        <div class="row"><button class="button primary">${t(child ? 'profiles.next' : 'profiles.make')}</button></div></form>`
      : step === 'set' ? html`<form class="stack" @submit=${next}>
        <label class="profile-born">${t('profiles.born')}<select @change=${(/** @type {Event} */ e) => set({ born: Number(value(e)) })}>
          ${Array.from({ length: 16 }, (_, i) => year - 3 - i).map((each) => html`<option ?selected=${each === born}>${each}</option>`)}</select><small>${years(born)}</small></label>
        ${baskets(tierFor(born))}${facts({ ...tierFor(born), brains: forChild() })}<p class="hint">${t('profiles.childText')}</p>
        <div class="row">${back}<button class="button primary">${t('profiles.next')}</button></div></form>`
      : html`${lock?.isOn() ? html`<p>${t('profiles.asParent')}</p>${lock.ways((raw) => make({ name: name.trim(), mine: mine.trim(), born }, raw))}`
        : html`<p>${t('profiles.lockFirst')}</p>${lock?.panel()}`}<div class="row">${back}</div>`}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'profile')
  }
}

define('app-profile-dialog', ProfileDialog)
