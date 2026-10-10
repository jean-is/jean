// A skill from elsewhere, shown before it is added (D121): where it comes from, when it is used,
// and its steps, downloaded and checked against the digest its index lists. One of Jean's own
// (D196) is named in the user's language, and its steps read from its files. Adding it is the
// user's act; nothing is kept until they do. Laid out as a card to add (D261): its icon and name,
// what it does, that it is used by itself and can be deleted, its steps one click away, open for
// one from elsewhere, and its buttons always in view at its foot.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { app, notify } from '../../ui/state.js'
import { syncDialog } from '../../ui/dialogs.js'
import { markdown } from '../../ui/markdown.js'
import { t, locale } from '../../core/i18n.js'
import { icons } from '../../ui/icons.js'
import { adopt } from './skills.js'
import { fetchSkill, siteOf } from './sources.js'
import { shownIn } from './directory.js'

/** @typedef {import('./sources.js').Entry & { icon?: string }} Entry  icon: a directory skill's, drawn with a line */
/** @typedef {{ body: string, files: { path: string, text: string }[], blocks?: string[], metadata?: Record<string, any> }} Unpacked */

const shown = signal(/** @type {{ entry: Entry, unpacked?: Unpacked, failed?: string } | null} */ (null))
/** The dialog it was opened from (Settings, on Skills), which it goes back to. */
let from = /** @type {typeof app.dialog.value} */ (null)
const back = () => { app.dialog.value = from }

/** What a skill is called and when it is used, in the user's language when it gives it (D222). @param {Entry} entry */
const about = (entry) => shownIn(entry, locale.value)
/** Its name: in the user's language, else its steps' heading once read, else as its source lists it. @param {{ entry: Entry, unpacked?: Unpacked }} state */
const titleOf = ({ entry, unpacked }) => {
  const { title } = about(entry)
  return title !== entry.name ? title : /^#\s+(.+)$/m.exec(unpacked?.body ?? '')?.[1].trim() ?? title
}

/** Shows a skill from elsewhere, once downloaded and checked. @param {Entry} entry */
export async function preview(entry) {
  shown.value = { entry }
  from = app.dialog.peek() === 'skill' ? from : app.dialog.peek()
  app.dialog.value = 'skill'
  try {
    const unpacked = await fetchSkill(entry)
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
  notify(t('skills.added', { title: titleOf(state) }))
}

/** What the dialog says of a skill, once one is shown. @param {{ entry: Entry, unpacked?: Unpacked, failed?: string }} state */
function view(state) {
  const { entry, unpacked, failed } = state
  // Jean's own are written in English, for the brain, so their steps start folded.
  const own = !entry.digest
  return html`<header class="dialog-head ready-head">
      <span class="ready-icon" aria-hidden="true">${entry.icon
        ? html`<svg class="icon" viewBox="0 0 24 24" focusable="false"><path d=${entry.icon}></path></svg>` : icons.scroll}</span>
      <div>
        <p class="ready-kind">${t('skills.ready.title')}</p>
        <h2 id="ready-name" dir="auto">${titleOf(state)}</h2>
        ${own ? nothing : html`<p class="ready-from">${icons.globe} ${t('skills.from', { source: siteOf(entry.url) })}</p>`}
      </div>
    </header>
    <div class="ready-body">
      <p dir="auto">${about(entry).text}</p>
      ${failed ? html`<p class="status is-error" role="alert">${t(`skills.ready.${failed}`)}</p>` : html`
        <ul class="ready-facts">
          <li>${own ? icons.bolt : icons.shield}<span>${t(own ? 'skills.ready.when' : 'skills.ready.lede')}</span></li>
          <li>${icons.retry}<span>${t('skills.ready.undo')}</span></li>
        </ul>
        ${!unpacked ? html`<p class="status" role="status">${t('skills.ready.loading')}</p>` : html`
          <details class="ready-steps" ?open=${!own}>
            <summary>${icons.scroll}<span>${t('skills.ready.steps')}</span>${icons.chevron}</summary>
            <div class="prose skill-steps" lang=${own ? 'en' : nothing} dir=${own ? 'ltr' : 'auto'}>${markdown(unpacked.body.replace(/^\s*#\s[^\n]*\n+/, ''))}</div>
            ${unpacked.files.length ? html`<p class="hint" dir="auto">${icons.file} ${t('skills.ready.files', {
              files: new Intl.ListFormat(locale.value).format(unpacked.files.map((file) => file.path)) })}</p>` : nothing}
          </details>`}`}
    </div>
    <footer class="dialog-foot">
      ${failed ? html`<button class="button" @click=${back}>${t('action.close')}</button>` : html`
        <button class="button subtle" @click=${back}>${t('offer.no')}</button>
        <button class="button primary" ?disabled=${!unpacked} @click=${add}>${icons.plus} ${t('skills.ready.add')}</button>`}
    </footer>`
}

class Ready extends Element {
  render() {
    const state = shown.value
    // Closed by Escape, a click outside or its buttons, it goes back to where it was opened. Its close
    // button comes last, so the keyboard starts in what it says rather than on the way out.
    return html`<dialog class="sheet skill-ready" aria-labelledby="ready-name" @close=${() => { if (app.dialog.value === 'skill') back() }}
      @click=${(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) back() }}>
      ${state ? view(state) : nothing}
      <button class="icon-button subtle ready-close" @click=${back} aria-label=${t('action.close')}>${icons.close}</button>
    </dialog>`
  }

  updated() {
    syncDialog(this, 'skill')
  }
}

define('app-skill-ready', Ready)
if (!document.querySelector('app-skill-ready')) document.body.append(document.createElement('app-skill-ready'))
