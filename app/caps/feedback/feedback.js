// Feedback (D712): under the last answer, Good and Not right. Not right asks what wasn't, then answers again a level up
// with the person's words as a note, and with Keep it in mind has the brain note what will still matter (remember) and
// mend the skill it followed: Jean learns from the person on this device, sending nothing anywhere else. Each mark is a
// meta record of the task, which Settings' Skills counts for the skill an answer followed.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register, unlock, isDenied } from '../../ui/caps.js'
import { app, send, keepRecords } from '../../ui/state.js'
import { metaRecord, noteRecord } from '../../core/events.js'
import { t, useStrings } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'

await Promise.all([useStrings('feedback'), styleSheet(new URL('feedback.css', import.meta.url))])
/** The answer whose Not right is open, by its time; and the marks given in this tab, until its records say them. */
const [open, given] = [signal(''), signal(/** @type {Record<string, string>} */ ({}))]

/** An answer's mark, as this tab gave it or its task keeps it. @param {string} at */
const markOf = (at) => given.value[at] ?? app.current.value?.records.findLast((/** @type {any} */ record) => record.meta?.feedback?.at === at)?.meta?.feedback.value

/** @param {string} at @param {'good' | 'bad'} value */
async function mark(at, value) {
  given.value = { ...given.value, [at]: value }
  const task = app.current.peek()?.path
  if (task) await keepRecords(task, [metaRecord('user', { feedback: { at, value } })], true)
}

/** Not right, said: answered again a level up, the person's words the request, and kept in mind if they asked. @param {string} at @param {string} why @param {boolean} keep */
async function again(at, why, keep) {
  open.value = ''
  await mark(at, 'bad')
  if (keep && !isDenied('memory')) await unlock('memory')
  const told = `The user marked your previous answer as not right${why ? ', in the words that follow' : ''}. Answer their request again, better.${keep
    ? ' Keep it in mind from now on: note what will still matter with remember, and if you followed a skill for it, change the skill so that it does better.' : ''}`
  await send(why || t('feedback.again'), { boost: 1, notes: [noteRecord(told, { kind: 'feedback', answer: at, ...(keep && { keep }) })] })
}

/** Its buttons, and Not right's few words, under the last answer. @param {{ at: string, last?: boolean }} answer */
function draw({ at, last }) {
  if (!last) return nothing
  const was = markOf(at)
  const said = (/** @type {Event} */ event) => /** @type {HTMLTextAreaElement} */ (/** @type {HTMLElement} */ (event.currentTarget).closest('.feedback')?.querySelector('textarea'))?.value.trim() ?? ''
  return html`<button class="icon-button subtle" aria-pressed=${String(was === 'good')} aria-label=${t('feedback.good')} @click=${() => mark(at, 'good')}>${icons.check}</button>
    <button class="icon-button subtle" aria-pressed=${String(was === 'bad' || open.value === at)} aria-expanded=${String(open.value === at)} aria-label=${t('feedback.bad')}
      @click=${() => { open.value = open.value === at ? '' : at }}>${icons.close}</button>
    ${open.value === at ? html`<div class="feedback" role="group" aria-label=${t('feedback.bad')}><label for="feedback-why">${t('feedback.why')}</label>
      <textarea id="feedback-why" rows="2" dir="auto" @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void again(at, said(e), false) } }}></textarea>
      <div class="row"><button class="button primary" @click=${(/** @type {Event} */ e) => again(at, said(e), false)}>${t('action.retry')}</button>
      <button class="button" @click=${(/** @type {Event} */ e) => again(at, said(e), true)}>${t('feedback.keep')}</button></div></div>` : nothing}`
}

register({ id: 'feedback', slots: { answer: { at: 10, draw } } })
