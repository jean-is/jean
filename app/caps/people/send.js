// Send to… (D727): a task, or one thing it made, to one of the person's people. Before anything goes, its dialog shows to whom, with what
// Jean read for a task, a few words, what goes (its requests and answers, each file and its size) and the total against what the relay
// carries; they have a week to open it. Loaded the first time it opens.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { app } from '../../ui/state.js'
import { filesIn } from '../../ui/export.js'
import { t, formatBytes, locale } from '../../core/i18n.js'
import { requestsOf } from '../../core/events.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/menu-icons.js'
import { people, sendIt } from './people.js'
import { LIMIT } from './flow.js'
import { styleSheet } from '../../ui/sheet.js'

await styleSheet(new URL('people.css', import.meta.url))

/** @typedef {import('../share/value.js').What} What */
/** What is sent, its value as it would go, with what Jean read or not, and how the sending stands. @typedef {{ what: What, reading: boolean, value?: import('../share/value.js').Value, busy?: boolean, said?: string, wrong?: string }} Sending */
const sending = signal(/** @type {Sending | null} */ (null))

/** The dialog opened on what goes. @param {What} what */
export function open(what) {
  sending.value = { what, reading: false }
  app.dialog.value = 'people-send'
  return measure()
}
/** What would go, as it would, with what Jean read or not. */
async function measure() {
  const now = sending.peek()
  if (!now) return
  const value = await (await import('../share/value.js')).valueOf(app.fs, now.what, { reading: now.reading, lang: locale.peek(), aFile: t('people.aFile') })
  if (sending.peek()?.what === now.what && sending.peek()?.reading === now.reading) sending.value = { ...now, value }
}
/** A JSONL's records, those that read. @param {string} file */
const recordsOf = (file) => file.split('\n').flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })

/** Sent to whom was picked, with the words written: said so, or why not. @param {SubmitEvent} event */
async function submit(event) {
  event.preventDefault()
  const [now, form] = [sending.peek(), new FormData(/** @type {HTMLFormElement} */ (event.target))]
  const one = people.peek().find((person) => person.fp === form.get('to'))
  if (!now || !one || now.busy) return
  sending.value = { ...now, busy: true, wrong: '' }
  try {
    await sendIt(one.fp, now.what, { reading: now.reading, words: String(form.get('words') ?? '') })
    sending.value = { ...now, busy: false, said: t('people.sentTo', { name: one.name }) }
  } catch (error) {
    const reason = /** @type {any} */ (error)?.reason
    sending.value = { ...now, busy: false, wrong: t(`people.why.${reason === 'waiting' || reason === 'large' ? reason : 'unreached'}`, { name: BRAND.name }) }
  }
}

class Send extends Element {
  render() {
    const [now, met] = [sending.value, people.value.filter((one) => !one.waiting)]
    const records = now?.value ? recordsOf(now.value.file) : [], total = now?.value ? JSON.stringify(now.value).length : 0, asked = requestsOf(records).length
    const files = filesIn(records).flatMap(({ uri, name }) => ((data) => (data ? [{ name, size: Math.floor((data.length - data.indexOf(',') - 1) * 0.75) }] : []))(now?.value?.files[uri] ?? ''))
    const quit = () => { app.dialog.value = null }
    return html`<dialog class="sheet people-send" @close=${closed('people-send')} @click=${backdrop}>${head(t('people.sendTo'))}
      ${now ? html`<p class="lede" dir="auto">${now.what.title || t('conversation.untitled')}</p>` : nothing}
      ${now?.said ? html`<p role="status">${now.said}</p>` : html`<form id="people-send" class="stack" @submit=${submit}>
        <fieldset class="stack"><legend>${t('people.toWhom')}</legend>${met.map((one, i) => html`<label class="row" for=${`people-to-${one.fp}`}>
          <input id=${`people-to-${one.fp}`} type="radio" name="to" value=${one.fp} ?checked=${i === 0} required><bdi>${one.name}</bdi></label>`)}</fieldset>
        ${now?.what.item ? nothing : html`<label class="setting" for="people-read">${t('people.reading', { name: BRAND.name })}<input id="people-read" type="checkbox" class="switch" role="switch"
          .checked=${now?.reading ?? false} @change=${(/** @type {Event} */ e) => { if (now) { sending.value = { ...now, reading: /** @type {HTMLInputElement} */ (e.target).checked, value: undefined }; measure() } }}></label>`}
        <label for="people-words">${t('people.words')}</label><textarea id="people-words" name="words" rows="2" maxlength="280" dir="auto"></textarea>
        <p class="hint">${!now?.value ? t('people.measuring') : html`${now.what.item ? nothing : html`${t('people.asked', { count: asked })} · `}${t('people.size', { size: formatBytes(total), limit: formatBytes(LIMIT) })}`}</p>
        ${files.length ? html`<ul class="people-files">${files.map((file) => html`<li><bdi>${file.name}</bdi> · ${formatBytes(file.size)}</li>`)}</ul>` : nothing}
        <p class="hint">${t('people.opens')}</p></form>`}
      <p class="people-wrong" role="alert">${now?.wrong ?? ''}</p>
      <footer class="dialog-foot">${now?.said ? html`<button class="button primary" @click=${quit}>${t('people.ok')}</button>`
        : html`<button class="button subtle" @click=${quit}>${t('people.cancel')}</button>
          <button class="button primary" form="people-send" ?disabled=${!now?.value || now.busy || total > LIMIT}>${icons.people} ${t('people.go')}</button>`}</footer>
    </dialog>`
  }

  updated() {
    syncDialog(this, 'people-send')
  }
}

define('app-people-send', Send)
