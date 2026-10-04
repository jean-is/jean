// A skill from elsewhere, shown before it is added (D121): where it comes from, when it is used,
// and its steps, downloaded and checked against the digest its index lists. Adding it is the
// user's act; nothing is kept until they do.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { app, notify } from '../../ui/state.js'
import { syncDialog } from '../../ui/dialogs.js'
import { markdown } from '../../ui/markdown.js'
import { t, locale } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { adopt, download } from './skills.js'
import { siteOf } from './sources.js'

/** @typedef {import('./sources.js').Entry} Entry */
/** @typedef {{ body: string, files: { path: string, text: string }[] }} Unpacked */

const shown = signal(/** @type {{ entry: Entry, unpacked?: Unpacked, failed?: string } | null} */ (null))
/** The dialog it was opened from (Settings, on Skills), which it goes back to. */
let from = /** @type {typeof app.dialog.value} */ (null)
const back = () => { app.dialog.value = from }

/** Shows a skill from elsewhere, once downloaded and checked. @param {Entry} entry */
export async function preview(entry) {
  shown.value = { entry }
  from = app.dialog.peek() === 'skill' ? from : app.dialog.peek()
  app.dialog.value = 'skill'
  try {
    const unpacked = await download(entry)
    if (shown.peek()?.entry === entry) shown.value = { entry, unpacked }
  } catch (error) {
    const code = /** @type {any} */ (error)?.code
    if (shown.peek()?.entry === entry) shown.value = { entry, failed: ['digest', 'programs', 'invalid'].includes(code) ? code : 'unreachable' }
  }
}

async function add() {
  const state = shown.peek()
  if (!state?.unpacked) return
  await adopt(state.entry, state.unpacked)
  back()
  notify(t('skills.added', { title: /^#\s+(.+)$/m.exec(state.unpacked.body)?.[1].trim() ?? state.entry.name }))
}

class Ready extends Element {
  render() {
    const state = shown.value
    // Closed by Escape, a click outside or its close button, it goes back to where it was opened.
    return html`<dialog class="sheet skill-ready" @close=${() => { if (app.dialog.value === 'skill') back() }}
      @click=${(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) back() }}>
      <header class="dialog-head">
        <h2>${t('skills.ready.title')}</h2>
        <button class="icon-button" @click=${back} aria-label=${t('action.close')}>${icons.close}</button>
      </header>
      ${state ? html`
        <p class="muted small">${icons.globe} ${t('skills.from', { source: siteOf(state.entry.url) })}</p>
        <p><strong dir="auto">${state.entry.name}</strong></p>
        <p dir="auto">${state.entry.description}</p>
        ${state.failed ? html`<p class="status is-error" role="alert">${t(`skills.ready.${state.failed}`)}</p>`
        : !state.unpacked ? html`<p class="status" role="status">${t('skills.ready.loading')}</p>`
        : html`<p class="lede">${t('skills.ready.lede')}</p>
          <div class="prose skill-steps" dir="auto" tabindex="0">${markdown(state.unpacked.body)}</div>
          ${state.unpacked.files.length ? html`<p class="muted small" dir="auto">${t('skills.ready.files', {
            files: new Intl.ListFormat(locale.value).format(state.unpacked.files.map((file) => file.path)) })}</p>` : nothing}
          <div class="row">
            <button class="button primary" @click=${add}>${t('skills.ready.add')}</button>
            <button class="button subtle" @click=${back}>${t('offer.no')}</button>
          </div>`}` : nothing}
    </dialog>`
  }

  updated() {
    syncDialog(this, 'skill')
  }
}

define('app-skill-ready', Ready)
if (!document.querySelector('app-skill-ready')) document.body.append(document.createElement('app-skill-ready'))
