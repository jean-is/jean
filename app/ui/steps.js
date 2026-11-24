// SPDX-License-Identifier: MIT
// What a stretch of work (ui/chat.js) opens on: its lines, in the order it happened, and what each name on them opens on:
// what the brain thought and wrote that time, or what a call was given and what came back, and whose rule decided it
// (D299). Loaded with the first stretch, not upfront, with its own style sheet.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal } from '@preact/signals-core'
import { app, effective } from './state.js'
import { slots, loaded } from './caps.js'
import { t, tParts, intlLocales, formatDuration } from '../core/i18n.js'
import { markdown } from './markdown.js'
import { styleSheet } from './sheet.js'
import { icons } from './menu-icons.js'
import { counts } from './kinds.js'
import { toolLabel, brainName } from './chat.js'

/** @import { Step } from '../core/events.js' */
/** @import { ToolCallInfo, ResourceLink } from '../core/types.js' */

styleSheet(new URL('./activity.css', import.meta.url))

/** The calls of a line naming several files that are open on what they were given and what came back, and the lines named in full. */
const opened = signal(/** @type {Set<string>} */ (new Set())), whole = signal(/** @type {Set<string>} */ (new Set()))
/** @param {typeof opened} set @param {string} id @param {boolean} on */
const toggle = (set, id, on) => { if (set.peek().has(id) !== on) set.value = new Set(on ? [...set.peek(), id] : [...set.peek()].filter((one) => one !== id)) }

/** Each kind's glyph, where it has one: read, changed (a move or a deletion too), ran, searched, opened. */
const KINDS = /** @type {Record<string, import('lit-html').TemplateResult | undefined>} */ ({ read: icons.file, edit: icons.compose, execute: icons.terminal, search: icons.search, fetch: icons.globe })
/** @param {ToolCallInfo} entry */
export const glyphOf = (entry) => (!entry.name ? icons.brain : entry.name === 'helper' ? icons.helpers : entry.name === 'web_search' ? icons.search
  : KINDS[entry.kind === 'delete' || entry.kind === 'move' ? 'edit' : entry.kind ?? ''])

/** A stretch's counts by kind, a glyph and a number each, the kind red if a call of it failed; its lines say them in words. @param {ToolCallInfo[]} work */
export const tally = (work) => html`<span class="stretch-counts" aria-hidden="true">${counts(work).map(({ kind, count, failed }) =>
  html`<span class=${failed ? 'is-failed' : ''}>${KINDS[kind]}${new Intl.NumberFormat(intlLocales()).format(count)}</span>`)}</span>`

/** @typedef {{ entry: ToolCallInfo, depth: number, key: string, parent: boolean }} Row */

/**
 * A stretch's lines, in the order it happened: each round of the brain, what it thought shown as it came, then its calls.
 * Calls on files of one kind in a row are one line naming each file ("Read a.csv and b.csv"), four at most before
 * "and 3 more". What a script or a helper did shows under its call, as a tree: a helper's brain, its calls, and their
 * scripts' calls. Every name opens on what it was given and what came back.
 * @param {ToolCallInfo[]} work @param {ToolCallInfo[]} entries the turn's, children among them
 * @param {Map<string | undefined, Step>} said each round's thought and words @param {ResourceLink[]} files
 */
export function lines(work, entries, said, files) {
  const tools = entries.filter((entry) => entry.name || entry._meta?.parent)
  // Parts in the order the work was split (their calls are kept in the order they finished).
  const order = (/** @type {ToolCallInfo} */ tool) => Number(/\.(\d+)$/.exec(tool.toolCallId)?.[1] ?? 0)
  /** @type {Row[]} */
  const rows = []
  // Keys stay with their line as lines arrive, so one that is open stays open (a brain may reuse an id).
  const seen = new Map()
  /** @param {ToolCallInfo} entry @param {number} depth */
  const add = (entry, depth) => {
    seen.set(entry.toolCallId, (seen.get(entry.toolCallId) ?? 0) + 1)
    const row = { entry, depth, key: `${entry.toolCallId}#${seen.get(entry.toolCallId)}`, parent: false }
    rows.push(row)
    // The brain's own searches, kept with its reply.
    for (const block of entry._meta?.raw ?? []) {
      if (block.type === 'server_tool_use' && block.name === 'web_search') add({ toolCallId: block.id, title: '', name: 'web_search', status: 'completed', rawInput: block.input }, depth + 1)
    }
    const children = tools.filter((child) => child._meta?.parent === entry.toolCallId)
    if (entry.name === 'delegate') children.sort((a, b) => order(a) - order(b))
    for (const child of children) add(child, depth + 1)
    row.parent = rows.at(-1) !== row
  }
  for (const entry of work) add(entry, 0)
  /** @type {Row[][]} */
  const groups = []
  for (const row of rows) {
    const group = groups.at(-1), was = group?.at(-1)
    if (group && was && !was.parent && !row.parent && was.depth === row.depth && kindOf(row.entry) && kindOf(row.entry) === kindOf(was.entry)) group.push(row)
    else groups.push([row])
  }
  return html`<ol class="activity-list">${repeat(groups, (group) => group[0].key, (group) => line(group, said, files))}</ol>`
}

/** What a call on a file does, for its line to name several: written, or read, changed, run… ('' for any other call). @param {ToolCallInfo} entry */
const kindOf = (entry) => (entry.name === 'write' ? 'tool.write' : entry.name && entry.name !== 'helper' && entry.locations?.[0]?.path ? `kind.${entry.kind ?? 'other'}.doing` : '')

/** A file's name, as the conversation knows it. @param {ToolCallInfo} entry @param {ResourceLink[]} files */
function nameOf(entry, files) {
  if (entry.name === 'write') return String(entry.rawInput?.name ?? '')
  const path = entry.locations?.[0]?.path ?? ''
  return files.findLast((file) => file.uri === path)?.name ?? path.split('/').at(-1) ?? path
}

/** What a line opens on: one call's, or a round's, line opening as a whole; a line naming several files, each name its own. @param {Row[]} group @param {Map<string | undefined, Step>} said @param {ResourceLink[]} files */
function line(group, said, files) {
  const [{ entry, depth, key }] = group
  const step = said.get(entry.toolCallId)
  const mark = html`<span class="line-mark">${glyphOf(entry) ?? html`<span class="ember"></span>`}</span>`
  const failed = (/** @type {ToolCallInfo} */ one) => (one.status === 'failed' ? html`<span class="visually-hidden">${t('activity.failed')}: </span>` : nothing)
  if (group.length === 1) return html`<li data-status=${entry.status ?? 'pending'} data-call=${entry.toolCallId} class=${!entry.name ? 'is-said' : depth ? 'is-nested' : ''} data-depth=${entry.name || depth ? depth : nothing}>
    <details class="step"><summary>${mark}${failed(entry)}<span dir="auto">${!entry.name ? (entry._meta?.compact ? html`<app-compaction .entry=${entry}></app-compaction>` : brainLine(entry)) : toolLabel(entry, files)}</span></summary>
      ${details(entry, step && { ...step, thought: '' })}</details>
    ${step?.thought ? html`<div class="thought" dir="auto">${markdown(step.thought)}</div>` : nothing}
  </li>`
  const kind = kindOf(entry)
  const status = group.some(({ entry: one }) => one.status === 'in_progress' || one.status === 'pending') ? 'in_progress' : group.some(({ entry: one }) => one.status === 'failed') ? 'failed' : entry.status ?? 'pending'
  return html`<li data-status=${status} class=${depth ? 'is-nested' : ''} data-depth=${depth}>
    <p class="line-words">${mark}<span dir="auto">${tParts(kind, { [kind === 'tool.write' ? 'name' : 'target']: list(group, key, files, failed) })}</span></p>
    ${group.map(({ entry: one }) => html`<details class="step" data-call=${one.toolCallId} data-status=${one.status ?? 'pending'} ?open=${opened.value.has(one.toolCallId)}
      @toggle=${(/** @type {Event} */ event) => toggle(opened, one.toolCallId, /** @type {HTMLDetailsElement} */ (event.target).open)}><summary hidden></summary>${details(one, undefined)}</details>`)}
  </li>`
}

/**
 * The files a line names, each opening on its call, four at most before "and 3 more", which names them all.
 * @param {Row[]} group @param {string} key @param {ResourceLink[]} files @param {(one: ToolCallInfo) => unknown} failed
 */
function list(group, key, files, failed) {
  const kept = whole.value.has(key) || group.length <= 4 ? group : group.slice(0, 3)
  const named = [...kept.map((row) => nameOf(row.entry, files)), ...(kept.length < group.length ? [t('activity.more', { count: group.length - kept.length })] : [])]
  let i = 0
  return new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).formatToParts(named).map((part) => {
    if (part.type !== 'element') return part.value
    const row = kept[i++]
    const id = row?.entry.toolCallId ?? ''
    return row ? html`<button class="line-name" data-status=${row.entry.status ?? 'pending'} aria-expanded=${opened.value.has(id) ? 'true' : 'false'}
      @click=${() => toggle(opened, id, !opened.peek().has(id))}>${failed(row.entry)}<bdi>${part.value}</bdi></button>` : html`<button class="line-name" @click=${() => toggle(whole, key, true)}>${part.value}</button>`
  })
}

/** Which brain was asked, and why Auto chose it. @param {ToolCallInfo} brain */
function brainLine(brain) {
  return html`${t('activity.brain', { brain: brainName(brain) })}
    ${brain.rawInput?.auto ? html`<span class="muted"> · ${autoReason(brain.rawInput.auto)}</span>` : nothing}
    ${brain.rawOutput?.usage?.cacheReadTokens ? html`<span class="muted"> · ${t('activity.cached')}</span>` : nothing}
    ${brain._meta?.hurried ? html`<span class="muted"> · ${t('activity.hurried')}</span>` : nothing}
    ${brain.status === 'failed' && brain.rawOutput?.error ? html`<span class="muted"> — ${brain.rawOutput.error}</span>` : nothing}`
}

/** Why Auto chose a brain, in plain words. @param {{ level: number, reason: string }} auto */
function autoReason({ level, reason }) {
  return reason === 'demand' ? t(`auto.demand.${level}`) : t(`auto.reason.${reason}`)
}

/** @param {ToolCallInfo} entry a call, or a brain asked @param {Step | undefined} step what that brain thought and wrote */
export const details = (entry, step) => (entry.name ? toolDetails(entry) : brainDetails(entry, step))

const STOPS = ['end', 'tool_use', 'max_tokens', 'refusal', 'pause', 'other']

/**
 * What the brain thought and wrote that time, exactly as written, then how it stopped, how long
 * it took, and to start, how much it read and wrote and how fast (or the error's code and status).
 * @param {ToolCallInfo} brain @param {Step | undefined} step
 */
function brainDetails(brain, step) {
  const { stopReason, usage, code, status } = brain.rawOutput ?? {}
  const { ms, first } = brain._meta ?? {}
  const facts = [
    STOPS.includes(stopReason) ? t(`activity.stop.${stopReason}`) : '',
    ms === undefined ? '' : formatDuration(ms),
    first === undefined ? '' : t('activity.start', { time: formatDuration(first) }),
    usage?.inputTokens ? t('activity.size', { input: usage.inputTokens, output: usage.outputTokens ?? 0 }) : '',
    pace(brain),
    code ?? '', status ?? '',
  ].filter(Boolean)
  return html`<div class="step-body">
    ${step?.thought ? html`<div class="thought" dir="auto">${markdown(step.thought)}</div>` : nothing}
    ${step?.text ? html`<pre tabindex="0" dir="auto">${step.text}</pre>` : nothing}
    ${facts.length ? html`<p class="step-facts">${facts.join(' · ')}</p>` : nothing}
  </div>`
}

/**
 * How fast a brain on this device wrote, from its first word on, when that says something: never one in the cloud,
 * whose hidden thinking counts without being streamed, nor one told to answer now, which wrote twice.
 * @param {ToolCallInfo} brain
 */
function pace({ rawInput, rawOutput, _meta }) {
  const [output, writing] = [rawOutput?.usage?.outputTokens ?? 0, (_meta?.ms ?? 0) - (_meta?.first ?? Infinity)]
  if (!rawInput?.local || _meta?.hurried || output < 20 || writing < 500) return ''
  const rate = (output / writing) * 1e3
  return t('activity.rate', { rate: rate < 10 ? Math.round(rate * 10) / 10 : Math.round(rate) })
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
