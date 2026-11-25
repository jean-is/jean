// SPDX-License-Identifier: MIT
// What a stretch of work (ui/chat.js) opens on: its lines, in the order it happened, and what each name on them opens on:
// what the brain thought and wrote that time, or what a call was given and what came back, and whose rule decided it
// (D299). Loaded with the first stretch, not upfront, with its own style sheet.
import { html, svg, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal } from '@preact/signals-core'
import { app, effective } from './state.js'
import { slots, loaded } from './caps.js'
import { t, tParts, intlLocales, formatDuration } from '../core/i18n.js'
import { markdown } from './markdown.js'
import { styleSheet } from './sheet.js'
import { icon, icons } from './menu-icons.js'
import { counts } from './kinds.js'
import { toolLabel, brainName } from './chat.js'

/** @import { Step } from '../core/events.js' */
/** @import { ToolCallInfo, ResourceLink } from '../core/types.js' */

styleSheet(new URL('./activity.css', import.meta.url))

/** The calls opened from a name on their line on what they were given and what came back, and the lines named in full. */
const opened = signal(/** @type {Set<string>} */ (new Set())), whole = signal(/** @type {Set<string>} */ (new Set()))
/** @param {typeof opened} set @param {string} id @param {boolean} on */
const toggle = (set, id, on) => { if (set.peek().has(id) !== on) set.value = new Set(on ? [...set.peek(), id] : [...set.peek()].filter((one) => one !== id)) }
const busy = (/** @type {ToolCallInfo} */ one) => one.status === 'in_progress' || one.status === 'pending'

/** Each kind's glyph, where it has one: read, ran, searched, opened, changed (a move or a deletion too). */
const KINDS = /** @type {Record<string, import('lit-html').TemplateResult | undefined>} */ ({ read: icons.file, search: icons.search, fetch: icons.globe,
  execute: icon(svg`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m8 10 2.5 2.5L8 15M13 15h3"/>`), edit: icon(svg`<path d="m5 19 1.2-4.3 9.4-9.4a1.8 1.8 0 0 1 2.6 0l.5.5a1.8 1.8 0 0 1 0 2.6l-9.4 9.4ZM13.8 7.1l3.1 3.1"/>`) })
/** @param {ToolCallInfo} entry */
export const glyphOf = (entry) => (!entry.name ? icons.brain : entry.name === 'helper' ? icons.helpers : entry.name === 'web_search' ? icons.search : KINDS[entry.kind === 'delete' || entry.kind === 'move' ? 'edit' : entry.kind ?? ''])

/** A stretch's counts by kind, a glyph and a number each, a red light on a kind where a call failed; its lines say it in words. @param {ToolCallInfo[]} work */
export const tally = (work) => html`<span class="stretch-counts" aria-hidden="true">${counts(work).map(({ kind, count, failed }) =>
  html`<span class=${failed ? 'is-failed' : ''}>${KINDS[kind]}${new Intl.NumberFormat(intlLocales()).format(count)}</span>`)}</span>`

/** @typedef {{ entry: ToolCallInfo, depth: number, key: string, parent: boolean }} Row */

/**
 * A stretch's lines, in the order it happened: what each round of the brain thought, as it came, then its calls, each
 * naming what it worked on ("Read a.csv and b.csv", calls on files of one kind in a row on one line, four names at most
 * before "and 3 more"; "Searched the web · “a query”"); what a script or a helper did under its call, as a tree. The
 * answer's last stretch, once it is written, ends on the brain it asked. Every name, and a line with none, opens on what
 * went in and came back.
 * @param {ToolCallInfo[]} work @param {ToolCallInfo[]} entries the turn's, children among them
 * @param {Map<string | undefined, Step>} said each round's thought and words @param {ResourceLink[]} files @param {boolean} [last] the end of a written answer
 */
export function lines(work, entries, said, files, last) {
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
  // The stretch itself is its first round's line (ui/chat.js); the answer's rounds, all of them, end its last.
  const first = work.find((entry) => !entry.name), rounds = last ? entries.filter((entry) => !entry.name && !entry._meta?.parent && !entry._meta?.compact) : []
  return html`<ol class="activity-list">${repeat(groups, (group) => group[0].key, (group) => line(group, said, files, first))}${rounds.length ? asked(rounds) : nothing}</ol>`
}

/** What a call on a file does, for its line to name several: written, or read, changed, run… ('' for any other call). @param {ToolCallInfo} entry */
const kindOf = (entry) => (entry.name === 'write' ? 'tool.write' : entry.name && entry.name !== 'helper' && entry.locations?.[0]?.path ? `kind.${entry.kind ?? 'other'}.doing` : '')

/** What a call worked on, as the conversation knows it: a file's name, or what was searched for ('' for none). @param {ToolCallInfo} entry @param {ResourceLink[]} files */
function nameOf(entry, files) {
  if (entry.name === 'web_search' || entry.name === 'write') return String((entry.name === 'write' ? entry.rawInput?.name : entry.rawInput?.query) ?? '')
  const path = kindOf(entry) ? entry.locations?.[0]?.path ?? '' : ''
  return files.findLast((file) => file.uri === path)?.name ?? path.split('/').at(-1) ?? path
}

/**
 * One line: what a round of the stretch's brain thought; a call naming what it worked on, each name opening its own;
 * or a call with no name, a helper's round or a summary, opening as a whole.
 * @param {Row[]} group @param {Map<string | undefined, Step>} said @param {ResourceLink[]} files @param {ToolCallInfo} [first]
 */
function line(group, said, files, first) {
  const [{ entry, depth, key }] = group
  const step = said.get(entry.toolCallId)
  if (!entry.name && !depth && !entry._meta?.compact) return step?.thought ? html`<li class="is-thought" data-call=${entry === first ? nothing : entry.toolCallId}><div class="thought" dir="auto">${markdown(step.thought)}</div></li>` : nothing
  const mark = html`<span class="line-mark">${glyphOf(entry) ?? html`<span class="ember"></span>`}</span>`
  if (!nameOf(entry, files)) return html`<li data-status=${entry.status ?? 'pending'} data-call=${entry.toolCallId} class=${!entry.name ? 'is-said' : depth ? 'is-nested' : ''} data-depth=${entry.name || depth ? depth : nothing}>
    <details class="step"><summary>${mark}${failed(entry)}<span dir="auto">${!entry.name ? (entry._meta?.compact ? html`<app-compaction .entry=${entry}></app-compaction>` : brainLine(entry)) : toolLabel(entry, files)}</span></summary>
      ${details(entry, undefined)}</details></li>`
  const kind = kindOf(entry), names = list(group, key, files)
  const status = group.some(({ entry: one }) => busy(one)) ? 'in_progress' : group.some(({ entry: one }) => one.status === 'failed') ? 'failed' : entry.status ?? 'pending'
  return html`<li data-status=${status} class=${depth ? 'is-nested' : ''} data-depth=${depth}>
    <p class="line-words">${mark}<span dir="auto">${!kind ? html`${t('tool.web_search')} · ${names}` : tParts(kind, { [kind === 'tool.write' ? 'name' : 'target']: names })}</span></p>
    ${group.map(({ entry: one }) => html`<details class="step" data-call=${one.toolCallId} data-status=${one.status ?? 'pending'} ?open=${opened.value.has(one.toolCallId)}
      @toggle=${(/** @type {Event} */ event) => toggle(opened, one.toolCallId, /** @type {HTMLDetailsElement} */ (event.target).open)}><summary hidden></summary>${details(one, undefined)}</details>`)}</li>`
}

/** A failed call's or round's words for screen readers, its colour saying it for the eye. @param {ToolCallInfo} one */
const failed = (one) => (one.status === 'failed' ? html`<span class="visually-hidden">${t('activity.failed')}: </span>` : nothing)

/**
 * The brain the answer asked, once its last stretch is written: which, how often, how much it read and wrote, and how it
 * ended. It opens on each round's facts, why Auto chose it among them; its thinking shows above, its words in the answer.
 * @param {ToolCallInfo[]} rounds
 */
function asked(rounds) {
  const last = /** @type {ToolCallInfo} */ (rounds.at(-1)), sum = (/** @type {string} */ key) => rounds.reduce((total, round) => total + (round.rawOutput?.usage?.[key] ?? 0), 0)
  return html`<li class="is-said"><details class="step"><summary><span>${tParts('activity.asked', { brain: html`<bdi>${brainName(last)}</bdi>`, count: rounds.length })}${sum('inputTokens') ? ` · ${t('activity.size', { input: sum('inputTokens'), output: sum('outputTokens') })}` : ''}${last._meta?.hurried ? ` · ${t('activity.hurried')}` : ''}${last.status === 'failed' && last.rawOutput?.error ? ` — ${last.rawOutput.error}` : ''}</span></summary>
    ${rounds.map((round) => details(round, undefined))}</details></li>`
}

/**
 * The names a line holds, each opening on its call (what was searched for in quotes), four at most before "and 3 more",
 * which names them all; one under way lights up and trails off.
 * @param {Row[]} group @param {string} key @param {ResourceLink[]} files
 */
function list(group, key, files) {
  const kept = whole.value.has(key) || group.length <= 4 ? group : group.slice(0, 3)
  const named = [...kept.map((row) => nameOf(row.entry, files)), ...(kept.length < group.length ? [t('activity.more', { count: group.length - kept.length })] : [])]
  let i = 0
  return new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).formatToParts(named).map((part) => {
    if (part.type !== 'element') return part.value
    const row = kept[i++], id = row?.entry.toolCallId ?? '', value = html`<bdi>${part.value}</bdi>`
    if (!row) return html`<button class="line-name" @click=${() => toggle(whole, key, true)}>${part.value}</button>`
    return html`<button class="line-name" data-status=${row.entry.status ?? 'pending'} aria-expanded=${opened.value.has(id) ? 'true' : 'false'}
      @click=${() => toggle(opened, id, !opened.peek().has(id))}>${failed(row.entry)}${row.entry.name === 'web_search' ? html`<q>${value}</q>` : value}</button>${busy(row.entry) ? '…' : ''}`
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
 * What the brain thought and wrote that time, exactly as written, then why Auto chose it, whether it reused what it had
 * read, how it stopped, how long it took, and to start, how much it read and wrote and how fast (or the error's code and status).
 * @param {ToolCallInfo} brain @param {Step | undefined} step
 */
function brainDetails(brain, step) {
  const { stopReason, usage, code, status } = brain.rawOutput ?? {}
  const { ms, first } = brain._meta ?? {}
  const facts = [
    brain.rawInput?.auto ? autoReason(brain.rawInput.auto) : '', usage?.cacheReadTokens ? t('activity.cached') : '',
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
