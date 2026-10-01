// The conversation: messages, the live activity view, approvals, errors.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { Element, define } from './base.js'
import { app, retry, notify, effective, brainLabel } from './state.js'
import { foldTurns, titleOf } from '../core/events.js'
import { t, locale } from '../core/i18n.js'
import { markdown, plainText } from './markdown.js'
import { icons } from './icons.js'
import { speaking, toggleSpeech, canSpeak } from './speech.js'

/** @typedef {import('../core/events.js').Turn} Turn */
/** @typedef {import('../core/types.js').ToolCallInfo} ToolCallInfo */

class Conversation extends Element {
  #follow = true
  #onScroll = () => {
    this.#follow = innerHeight + scrollY >= document.documentElement.scrollHeight - 120
  }

  connectedCallback() {
    super.connectedCallback()
    addEventListener('scroll', this.#onScroll, { passive: true })
    scrollTo({ top: document.documentElement.scrollHeight })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    removeEventListener('scroll', this.#onScroll)
  }

  render() {
    const current = app.current.value
    if (!current) return nothing
    const turns = foldTurns(current.records)
    const live = app.live.value
    const error = app.error.value
    return html`
      <h1 class="conversation-title" dir="auto">${titleOf(current.records) || t('conversation.untitled')}</h1>
      <ol class="turns">
        ${repeat(turns, (turn) => turn.at, (turn, index) => turnView(turn, index === turns.length - 1 ? live?.turn ?? null : null))}
      </ol>
      ${error ? errorView(error) : nothing}`
  }

  updated() {
    if (this.#follow) scrollTo({ top: document.documentElement.scrollHeight })
  }
}

/** @param {Turn} turn @param {Turn | null} live */
function turnView(turn, live) {
  const steps = live ? [...turn.steps, ...live.steps] : turn.steps
  const text = steps.map((step) => step.text).filter(Boolean).join('\n\n')
  const thought = steps.map((step) => step.thought).filter(Boolean).join('\n\n')
  const entries = steps.flatMap((step) => step.tools)
  const streaming = Boolean(live)
  return html`<li class="turn">
    ${turn.user ? html`<p class="msg msg-user" dir="auto">${turn.user.text}</p>` : nothing}
    ${streaming || text || entries.length ? html`
      <article class="msg msg-jean ${streaming ? 'is-streaming' : ''}" aria-busy=${streaming ? 'true' : 'false'}>
        ${activity(entries, thought, text, streaming)}
        ${text ? html`<div class="prose" dir="auto">${markdown(text)}${streaming ? html`<span class="caret" aria-hidden="true"></span>` : nothing}</div>` : nothing}
        ${!streaming && text ? actions(turn.at, text) : nothing}
      </article>` : nothing}
  </li>`
}

/**
 * "What Jean is doing", from the turn's ACP records.
 * @param {ToolCallInfo[]} entries @param {string} thought @param {string} text @param {boolean} streaming
 */
function activity(entries, thought, text, streaming) {
  const brains = entries.filter((entry) => entry.kind === 'think' && !entry.name)
  const tools = entries.filter((entry) => entry.name)
  const last = brains.at(-1)
  const failed = last?.status === 'failed'
  const working = tools.some((tool) => tool.status === 'pending' || tool.status === 'in_progress')
  const status = streaming ? (working ? 'working' : 'thinking') : failed ? 'failed' : 'completed'
  const summary = streaming
    ? t(working ? 'activity.working' : text ? 'activity.writing' : 'activity.thinking')
    : failed ? t('activity.failed') : t('activity.answeredWith', { brain: last ? brainName(last) : '' })
  const permission = app.permission.value
  return html`
    <details class="activity" data-status=${status}>
      <summary><span class="ember" aria-hidden="true"></span><span>${summary}</span>${icons.chevron}</summary>
      <ol class="activity-list">
        ${brains.map((brain) => html`<li data-status=${brain.status ?? 'pending'}>
          <span class="ember" aria-hidden="true"></span>${t('activity.brain', { brain: brainName(brain) })}
          ${brain.status === 'failed' && brain.rawOutput?.error ? html`<span class="muted"> — ${brain.rawOutput.error}</span>` : nothing}
        </li>`)}
        ${tools.map((tool) => html`<li data-status=${tool.status ?? 'pending'}>
          <span class="ember" aria-hidden="true"></span>${toolLabel(tool)}
        </li>`)}
      </ol>
      ${thought ? html`<div class="thought" dir="auto">${markdown(thought)}</div>` : nothing}
    </details>
    ${streaming && permission ? approval(permission) : nothing}`
}

/** Brain label rendered in the current language from structured data. @param {ToolCallInfo} entry */
function brainName(entry) {
  const { provider, model } = entry.rawInput ?? {}
  return provider && model ? brainLabel(/** @type {any} */ ({ provider, model })) : entry.title
}

/** Plain-language label from the kind and the first location. @param {ToolCallInfo} tool */
function toolLabel(tool) {
  const target = tool.locations?.[0]?.path?.split('/').at(-1)
  return target ? t(`kind.${tool.kind ?? 'other'}.doing`, { target }) : tool.title
}

/** @param {NonNullable<typeof app.permission.value>} permission */
function approval(permission) {
  const { toolCall, resolve } = permission
  return html`<div class="approval" role="group" aria-label=${t('approval.title')}>
    <p>${t('approval.question', { action: toolLabel(toolCall) })}</p>
    <div class="approval-actions">
      <button class="button primary" @click=${() => resolve('allow_once')}>${t('approval.allowOnce')}</button>
      <button class="button" @click=${() => resolve('allow_always')}>${t('approval.allowAlways')}</button>
      <button class="button" @click=${() => resolve('reject_once')}>${t('approval.rejectOnce')}</button>
      <button class="button subtle" @click=${() => resolve('reject_always')}>${t('approval.rejectAlways')}</button>
    </div>
  </div>`
}

/** @param {string} id @param {string} text */
function actions(id, text) {
  const isSpeaking = speaking.value === id
  return html`<div class="msg-actions">
    <button class="icon-button subtle" aria-label=${t('action.copy')} title=${t('action.copy')}
      @click=${async () => { await navigator.clipboard.writeText(text); notify(t('toast.copied')) }}>${icons.copy}</button>
    ${canSpeak() ? html`<button class="icon-button subtle ${isSpeaking ? 'is-active' : ''}" aria-pressed=${isSpeaking ? 'true' : 'false'}
      aria-label=${t(isSpeaking ? 'action.stopReading' : 'action.readAloud')} title=${t(isSpeaking ? 'action.stopReading' : 'action.readAloud')}
      @click=${() => toggleSpeech(id, plainText(text), locale.value, effective.value.settings.voice)}>${icons.speaker}</button>` : nothing}
  </div>`
}

/** @param {{ code: string, message: string }} error */
function errorView(error) {
  const fixable = ['auth', 'not_found', 'bad_request', 'cors_or_offline'].includes(error.code)
  return html`<div class="msg msg-error" role="alert">
    <p>${error.message}</p>
    <div class="msg-error-actions">
      <button class="button" @click=${retry}>${icons.retry} ${t('action.retry')}</button>
      ${fixable ? html`<button class="button subtle" @click=${() => { app.dialog.value = 'brain' }}>${t('brain.manage')}</button>` : nothing}
    </div>
  </div>`
}

define('app-conversation', Conversation)
