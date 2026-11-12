// SPDX-License-Identifier: MIT
// What a line of the activity (ui/chat.js) opens on: what the brain thought and wrote that time, or what a call
// was given and what came back, and whose rule decided it (D299). Loaded with the first activity, not upfront.
import { html, nothing } from 'lit-html'
import { app, effective } from './state.js'
import { slots, loaded } from './caps.js'
import { t, formatDuration } from '../core/i18n.js'
import { markdown } from './markdown.js'

/** @import { Step } from '../core/events.js' */
/** @import { ToolCallInfo } from '../core/types.js' */

/** @param {ToolCallInfo} entry a call, or a brain asked @param {Step | undefined} step what that brain thought and wrote */
export const details = (entry, step) => (entry.name ? toolDetails(entry) : brainDetails(entry, step))

const STOPS = ['end', 'tool_use', 'max_tokens', 'refusal', 'pause', 'other']

/**
 * What the brain thought and wrote that time, exactly as written, then how it stopped, how long
 * it took and how much it read and wrote (or the error's code and status).
 * @param {ToolCallInfo} brain @param {Step | undefined} step
 */
function brainDetails(brain, step) {
  const { stopReason, usage, code, status } = brain.rawOutput ?? {}
  const facts = [
    STOPS.includes(stopReason) ? t(`activity.stop.${stopReason}`) : '',
    brain._meta?.ms === undefined ? '' : formatDuration(brain._meta.ms),
    usage?.inputTokens ? t('activity.size', { input: usage.inputTokens, output: usage.outputTokens ?? 0 }) : '',
    code ?? '', status ?? '',
  ].filter(Boolean)
  return html`<div class="step-body">
    ${step?.thought ? html`<div class="thought" dir="auto">${markdown(step.thought)}</div>` : nothing}
    ${step?.text ? html`<pre tabindex="0" dir="auto">${step.text}</pre>` : nothing}
    ${facts.length ? html`<p class="step-facts">${facts.join(' · ')}</p>` : nothing}
  </div>`
}

/** What a call was given and what came back, as the brain saw them. @param {ToolCallInfo} tool */
function toolDetails(tool) {
  const input = shown(tool.rawInput)
  const output = shown(tool.rawOutput)
  return html`<div class="step-body">
    <p class="step-facts"><code dir="ltr">${tool.name}</code>${tool._meta?.ms === undefined ? nothing : ` · ${formatDuration(tool._meta.ms)}`}${tool._meta?.by ? whose(tool._meta) : nothing}</p>
    ${input ? html`<p class="step-label">${t('activity.input')}</p><pre tabindex="0" dir="auto">${input}</pre>` : nothing}
    ${output ? html`<p class="step-label">${t('activity.output')}</p><pre tabindex="0" dir="auto">${output}</pre>` : nothing}
  </div>`
}

/**
 * "Refused by …", "Asked first by …" or "Allowed by …", for a call a hook refused, asked about or let go ahead,
 * which keeps whose answer it was and what it was: an app by its title (the by slot) or a capability by its name;
 * a guard as the organisation's rules or the person's; one removed since, by its id.
 * @param {Record<string, any>} meta a call's (`_meta`), once it says whose (`by`) and what (`decision`)
 */
function whose({ by, decision }) {
  const guard = ['policy', 'user'].find((tier) => (tier === 'user' ? effective.value.settings : app.policy).guards?.some((/** @type {import('../core/rules.js').Guard} */ one) => one.id === by))
  const who = slots('by').map((slot) => slot.draw({ by })).find(Boolean) ?? (loaded.value.has(by) ? t(`cap.${by}.name`) : guard ? t(`activity.by.${guard}`) : by)
  return ` · ${t(`activity.by.${decision}`, { who: String(who) })}`
}

/**
 * Arguments and results as text: strings as they are, so code stays readable, the rest as JSON.
 * @param {unknown} value @returns {string}
 */
function shown(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value, null, 2)
  return Object.entries(value).map(([key, item]) => {
    const text = typeof item === 'string' ? item : JSON.stringify(item, null, 2) ?? ''
    return text.includes('\n') ? `${key}:\n${text.replace(/^/gm, '  ')}` : `${key}: ${text}`
  }).join('\n')
}
