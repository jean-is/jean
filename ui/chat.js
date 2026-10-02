// The conversation: messages, the live activity view, approvals, errors.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { Element, define } from './base.js'
import { app, retry, effective, brainLabel, openFile, send, canStepUp, askSmarter } from './state.js'
import { unlock } from './caps.js'
import { foldTurns, titleOf, linkedFiles, splitSuggestions } from '../core/events.js'
import { t, locale } from '../core/i18n.js'
import { markdown, plainText } from './markdown.js'
import { icons } from './icons.js'
import { speaking, toggleSpeech, canSpeak } from './speech.js'
import { BRAND } from '../brand.js'

/** @typedef {import('../core/events.js').Turn} Turn */
/** @typedef {import('../core/types.js').ToolCallInfo} ToolCallInfo */
/** @typedef {import('../core/types.js').ResourceLink} ResourceLink */

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
    const files = linkedFiles(current.records)
    const live = app.live.value
    const error = app.error.value
    const sources = citable(files)
    return html`
      <h1 class="conversation-title" dir="auto">${titleOf(current.records) || t('conversation.untitled')}</h1>
      <ol class="turns">
        ${repeat(turns, (turn) => turn.at, (turn, index) => {
          const last = index === turns.length - 1
          return turnView(turn, last ? live?.turn ?? null : null, files, turns.slice(0, index + 1), last, sources)
        })}
      </ol>
      ${error ? errorView(error) : nothing}`
  }

  updated() {
    if (this.#follow) scrollTo({ top: document.documentElement.scrollHeight })
  }
}

/**
 * Shared files by the number the brain cites them with (source chips).
 * @param {ResourceLink[]} files @returns {import('./markdown.js').Sources}
 */
function citable(files) {
  /** @type {import('./markdown.js').Sources} */
  const sources = new Map()
  for (const link of files) {
    const number = link._meta?.source
    if (number && !sources.has(number)) sources.set(number, { name: link.name, label: t('sources.open', { name: link.name }), open: () => openFile(link) })
  }
  return sources
}

/**
 * @param {Turn} turn @param {Turn | null} live
 * @param {ResourceLink[]} files every file in the conversation @param {Turn[]} upTo this turn and those before it
 * @param {boolean} last @param {import('./markdown.js').Sources} sources
 */
function turnView(turn, live, files, upTo, last, sources) {
  const steps = live ? [...turn.steps, ...live.steps] : turn.steps
  // The brain's follow-ups come in a trailing block, hidden from the answer itself.
  const { text, suggestions } = splitSuggestions(steps.map((step) => step.text).filter(Boolean).join('\n\n'))
  const thought = steps.map((step) => step.thought).filter(Boolean).join('\n\n')
  const entries = steps.flatMap((step) => step.tools)
  const streaming = Boolean(live)
  const read = whatJeanRead(upTo, entries, files)
  return html`<li class="turn">
    ${turn.user?.files.length ? html`<ul class="msg-files" aria-label=${t('files.attached')}>${turn.user.files.map((link) => html`<li>
      <button class="file-chip" @click=${() => openFile(link)} title=${t('files.open')}>${icons.file}<span dir="auto">${link.name}</span></button>
    </li>`)}</ul>` : nothing}
    ${turn.user?.text ? html`<p class="msg msg-user" dir="auto">${turn.user.text}</p>` : nothing}
    ${streaming || text || entries.length ? html`
      <article class="msg msg-jean ${streaming ? 'is-streaming' : ''}" aria-busy=${streaming ? 'true' : 'false'}>
        ${activity(entries, thought, text, streaming, files)}
        ${text ? html`<div class="prose" dir="auto">${markdown(text, sources)}${streaming ? html`<span class="caret" aria-hidden="true"></span>` : nothing}</div>` : nothing}
        ${!streaming && read.length ? readView(read) : nothing}
        ${!streaming && text ? actions(turn.at, text) : nothing}
      </article>` : nothing}
    ${last && !streaming && !app.busy.value ? followUps(turn.at, suggestions, entries.findLast((entry) => entry.kind === 'think' && !entry.name)) : nothing}
  </li>`
}

/**
 * What the user might send next: the brain's own follow-ups, those the reflexes picked from
 * the catalogue, and a step up to a smarter brain when Auto chose a lighter one.
 * @param {string} at @param {string[]} suggestions @param {ToolCallInfo | undefined} brain
 */
function followUps(at, suggestions, brain) {
  const actions = app.actions.value[at] ?? []
  const smarter = canStepUp(brain)
  if (!suggestions.length && !actions.length && !smarter) return nothing
  return html`<ul class="follow-ups" aria-label=${t('suggest.title')}>
    ${suggestions.map((suggestion) => html`<li><button class="follow-up" dir="auto" @click=${() => send(suggestion)}>${suggestion}</button></li>`)}
    ${actions.map((id) => html`<li><button class="follow-up" @click=${() => send(t(`suggest.${id}.prompt`))}>${t(`suggest.${id}`)}</button></li>`)}
    ${smarter ? html`<li><button class="follow-up is-smarter" @click=${askSmarter}>${icons.spark}${t('auto.smarter')}</button></li>` : nothing}
  </ul>`
}

/**
 * "What Jean read", from what actually went to the brain for this answer: the files shared
 * so far (with the pages that fit) and this turn's completed reads. Honest even when a small
 * brain cites badly.
 * @param {Turn[]} upTo @param {ToolCallInfo[]} entries @param {ResourceLink[]} files
 * @returns {{ link: ResourceLink, range?: [number, number], of?: number }[]}
 */
function whatJeanRead(upTo, entries, files) {
  const items = upTo.flatMap((turn) => turn.user?.files ?? []).map((link) => ({ link, range: link._meta?.pages, of: link._meta?.of }))
  for (const tool of entries) {
    if (tool.name !== 'read' || tool.status !== 'completed') continue
    const link = files.findLast((file) => file.uri === tool.locations?.[0]?.path)
    const match = /pages (\d+)–(\d+) of (\d+)/.exec(String(tool.rawOutput ?? ''))
    if (link) items.push({ link, range: match ? [Number(match[1]), Number(match[2])] : undefined, of: match ? Number(match[3]) : undefined })
  }
  return items
}

/** @param {ReturnType<typeof whatJeanRead>} items */
function readView(items) {
  return html`<details class="read-list">
    <summary>${icons.file}<span>${t('read.title', { name: BRAND.name, count: items.length })}</span>${icons.chevron}</summary>
    <ul>${items.map(({ link, range, of }) => html`<li>
      <button class="link-button" @click=${() => openFile(link)} dir="auto">${link.name}</button>
      <span class="muted">${range && of ? t('read.pages', { first: range[0], last: range[1], total: of }) : t('read.whole')}</span>
    </li>`)}</ul>
  </details>`
}

/**
 * "What Jean is doing", from the turn's ACP records. A script's own calls show under it.
 * @param {ToolCallInfo[]} entries @param {string} thought @param {string} text @param {boolean} streaming
 * @param {ResourceLink[]} files
 */
function activity(entries, thought, text, streaming, files) {
  const brains = entries.filter((entry) => entry.kind === 'think' && !entry.name)
  const tools = entries.filter((entry) => entry.name)
  const top = tools.filter((tool) => !tool._meta?.parent)
  const last = brains.at(-1)
  const failed = last?.status === 'failed'
  const working = tools.some((tool) => tool.status === 'pending' || tool.status === 'in_progress')
  const status = streaming ? (working ? 'working' : 'thinking') : failed ? 'failed' : 'completed'
  const summary = streaming
    ? t(working ? 'activity.working' : text ? 'activity.writing' : 'activity.thinking')
    : failed ? t('activity.failed') : t('activity.answeredWith', { brain: last ? brainName(last) : '' })
  const permission = app.permission.value
  const offering = app.offering.value
  /** @param {ToolCallInfo} tool @param {boolean} [nested] */
  const item = (tool, nested = false) => html`<li data-status=${tool.status ?? 'pending'} class=${nested ? 'is-nested' : ''}>
    <span class="ember" aria-hidden="true"></span><span dir="auto">${toolLabel(tool, files)}</span>
  </li>`
  return html`
    <details class="activity" data-status=${status}>
      <summary><span class="ember" aria-hidden="true"></span><span>${summary}</span>${icons.chevron}</summary>
      <ol class="activity-list">
        ${brains.map((brain) => html`<li data-status=${brain.status ?? 'pending'}>
          <span class="ember" aria-hidden="true"></span><span>${t('activity.brain', { brain: brainName(brain) })}
          ${brain.rawInput?.auto ? html`<span class="muted"> · ${autoReason(brain.rawInput.auto)}</span>` : nothing}
          ${brain.rawOutput?.usage?.cacheReadTokens ? html`<span class="muted"> · ${t('activity.cached')}</span>` : nothing}
          ${brain.status === 'failed' && brain.rawOutput?.error ? html`<span class="muted"> — ${brain.rawOutput.error}</span>` : nothing}</span>
        </li>`)}
        ${top.map((tool) => [item(tool), ...tools.filter((child) => child._meta?.parent === tool.toolCallId).map((child) => item(child, true))])}
      </ol>
      ${thought ? html`<div class="thought" dir="auto">${markdown(thought)}</div>` : nothing}
    </details>
    ${streaming && permission ? approval(permission) : nothing}
    ${streaming && offering ? offerCard(offering) : nothing}`
}

/** Why Auto chose a brain, in plain words. @param {{ level: number, reason: string }} auto */
function autoReason({ level, reason }) {
  return reason === 'demand' ? t(`auto.demand.${level}`) : t(`auto.reason.${reason}`)
}

/** The brain's offer, in the answer it is part of. @param {NonNullable<typeof app.offering.value>} offering */
function offerCard({ id, resolve }) {
  return html`<div class="approval" role="group" aria-label=${t('offer.title')}>
    <p><strong>${t(`cap.${id}.name`)}</strong></p>
    <p>${t(`cap.${id}.offer`, { name: BRAND.name })}</p>
    <div class="approval-actions">
      <button class="button primary" @click=${() => resolve(true)}>${t('offer.yes')}</button>
      <button class="button subtle" @click=${() => resolve(false)}>${t('offer.no')}</button>
    </div>
  </div>`
}

/** Brain label rendered in the current language from structured data. @param {ToolCallInfo} entry */
function brainName(entry) {
  const { provider, model } = entry.rawInput ?? {}
  return provider && model ? brainLabel(/** @type {any} */ ({ provider, model, api: provider === 'device' ? 'device' : '' })) : entry.title
}

/**
 * Plain-language label in the current language: from the kind and the file it touched, or
 * from the tool's name; the brain's own title is the last resort.
 * @param {ToolCallInfo} tool @param {ResourceLink[]} [files]
 */
function toolLabel(tool, files = []) {
  const path = tool.locations?.[0]?.path
  const target = path && (files.findLast((file) => file.uri === path)?.name ?? path.split('/').at(-1))
  if (target) return t(`kind.${tool.kind ?? 'other'}.doing`, { target })
  if (tool.name === 'offer') return t('tool.offer', { name: t(`cap.${tool.rawInput?.capability}.name`) })
  const key = `tool.${tool.name}`
  return t(key) === key ? tool.title : t(key)
}

/** @param {NonNullable<typeof app.permission.value>} permission */
function approval(permission) {
  const { toolCall, resolve } = permission
  return html`<div class="approval" role="group" aria-label=${t('approval.title')}>
    <p>${t('approval.question', { action: toolLabel(toolCall, linkedFiles(app.current.value?.records ?? [])) })}</p>
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
  // Copy, CSV and print belong to "Things Jean made", which loads with the first answer.
  unlock('made')
  return html`<div class="msg-actions">
    <app-made .source=${text}></app-made>
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
