// Double-check (docs/product.md, "Sources and citations"): once citations are in regular use,
// Jean checks each claim an answer makes against the source it cites. The brain that wrote the
// answer is asked, in one short request outside the conversation, whether the passages support
// the claims. It has read those sources already, so nothing new leaves the device, and the
// conversation's prompt and cache are untouched. The verdicts are kept in the conversation, as a
// record the brain never reads, and shown under the answer.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { register, loaded, contributions } from '../../ui/caps.js'
import { fire } from '../../core/hooks.js'
import { app, activeBrain, brainsHere, send, keepRecords } from '../../ui/state.js'
import { getSecret } from '../../ui/secrets.js'
import { foldTurns, linkedFiles, metaRecord, splitSuggestions } from '../../core/events.js'
import { fileText } from '../../core/files.js'
import { claimsIn, passage, sourceIn, request, verdicts, CHECKER } from './claims.js'
import { t, locale } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'

/** @import { Envelope, BrainConfig } from '../../core/types.js' */
/** @import { Turn } from '../../core/events.js' */
/** @typedef {{ text: string, sources: number[], verdict: import('./claims.js').Verdict }} Checked */

await styleSheet(new URL('check.css', import.meta.url))

/** The answers being checked now, by their turn. */
const checking = signal(/** @type {string[]} */ ([]))

/**
 * Where each source's words are, by number: a shared file's text, the part of a tool's result
 * that is that source, or the passage the brain's own search quoted.
 * @param {Envelope[]} records @returns {Map<number, () => Promise<string>>}
 */
function sourceTexts(records) {
  const found = new Map()
  for (const link of linkedFiles(records)) {
    const n = link._meta?.source
    if (n && !found.has(n)) found.set(n, async () => (await fileText(app.fs, app.projectDir, link.uri)) ?? '')
  }
  for (const { update } of records) {
    if (update?.sessionUpdate !== 'tool_call') continue
    for (const { n, quote } of update._meta?.sources ?? []) {
      const output = typeof update.rawOutput === 'string' ? sourceIn(update.rawOutput, n) : ''
      if (!found.has(n)) found.set(n, async () => output || quote || '')
    }
  }
  return found
}

/** The brain that wrote the answer, as connected now. @param {Turn} turn @returns {BrainConfig | null} */
function brainOf(turn) {
  const entry = turn.steps.flatMap((step) => step.tools).findLast((tool) => tool.kind === 'think' && !tool.name && !tool._meta?.parent)
  const { provider, model } = entry?.rawInput ?? {}
  const brain = brainsHere.value.find((candidate) => candidate.provider === provider) ?? activeBrain.value
  return brain && (model && brain.api !== 'device' ? { ...brain, model } : brain)
}

/** One request, no tools, the reply's text: a step of its own, which the device's brain answers through its hook. @param {BrainConfig} brain @param {string} text @param {string} task its path, for the hooks (D440) */
async function ask(brain, text, task) {
  if (brain.api === 'device' && !loaded.value.has('brain-local')) throw new Error('No brain to ask')
  const [{ streamChat }, apiKey] = await Promise.all([import('../../core/llm.js'), getSecret(app.fs, brain.id)])
  let reply = ''
  const events = await fire(contributions().hooks, 'turn.step', { task, brain, system: CHECKER, messages: [{ role: 'user', content: text }], tools: [] }, (e) => streamChat({ ...e, apiKey: apiKey ?? undefined }))
  for await (const event of events) if (event.type === 'text') reply += event.delta
  return reply
}

/**
 * Checks an answer's claims against their sources and keeps the verdicts with the conversation.
 * @param {string} path the conversation's file @param {string} at the answer's turn @param {Envelope[]} records
 */
export async function check(path, at, records) {
  const turn = foldTurns(records).find((candidate) => candidate.at === at)
  const brain = turn && brainOf(turn)
  if (!turn || !brain || checking.peek().includes(at)) return
  const answer = splitSuggestions(turn.steps.map((step) => step.text).filter(Boolean).join('\n\n')).text
  const texts = sourceTexts(records)
  const claims = await Promise.all(claimsIn(answer, (n) => texts.has(n), locale.peek()).map(async (claim) => ({
    ...claim,
    passages: (await Promise.all(claim.sources.map(async (n) => ({ n, text: passage(await /** @type {() => Promise<string>} */ (texts.get(n))(), claim.text) })))).filter((part) => part.text),
  })))
  const asked = claims.filter((claim) => claim.passages.length)
  if (!asked.length) return
  checking.value = [...checking.peek(), at]
  try {
    const found = verdicts(await ask(brain, request(asked), path), asked.length)
    /** @type {Checked[]} */
    const checked = claims.map(({ text, sources, passages }) => ({ text, sources, verdict: passages.length ? found[asked.findIndex((claim) => claim.text === text)] : 'unknown' }))
    const record = metaRecord('jean', { check: { at, claims: checked } })
    await keepRecords(path, [record])
    const current = app.current.peek()
    if (current?.path === path) app.current.value = { ...current, records: [...current.records, record] }
  } catch (error) {
    console.warn('Double-check', error)
  } finally {
    checking.value = checking.peek().filter((other) => other !== at)
  }
}

const OFF = new Set(['missing', 'contradicted'])
const MARKS = /** @type {Record<string, keyof typeof icons>} */ ({ supported: 'check', contradicted: 'close', missing: 'close' })

/** Under an answer: whether its sources say what it says. */
class Check extends Element {
  render() {
    const at = this.getAttribute('at') ?? ''
    if (checking.value.includes(at)) return html`<p class="check is-running" role="status">${icons['double-check']}<span>${t('check.running')}</span></p>`
    const records = app.current.value?.records ?? []
    /** @type {Checked[] | undefined} */
    const claims = records.findLast((record) => record.meta?.check?.at === at)?.meta?.check.claims
    const ok = claims?.filter((claim) => claim.verdict === 'supported') ?? []
    const off = claims?.filter((claim) => OFF.has(claim.verdict)) ?? []
    if (!claims || !(ok.length + off.length)) return nothing
    const last = foldTurns(records).at(-1)?.at === at && !app.busy.value
    return html`<details class="read-list check ${off.length ? 'is-off' : ''}">
      <summary>${icons[off.length ? 'close' : 'check']}<span>${[ok.length ? t('check.supported', { count: ok.length }) : '', off.length ? t('check.unsupported', { count: off.length }) : ''].filter(Boolean).join(' · ')}</span>${icons.chevron}</summary>
      <ul>${claims.map((claim) => html`<li data-verdict=${claim.verdict}>
        <span class="verdict" title=${t(`check.is.${claim.verdict}`)}>${MARKS[claim.verdict] ? icons[MARKS[claim.verdict]] : '?'}<span class="visually-hidden">${t(`check.is.${claim.verdict}`)}</span></span>
        <span dir="auto">${claim.text}</span><span class="muted">${claim.sources.map((n) => `[${n}]`).join(' ')}</span>
      </li>`)}</ul>
      ${off.length && last ? html`<button class="follow-up" @click=${() => send(`${t('check.fix.prompt')}\n\n${off.map((claim) => `- ${claim.text}`).join('\n')}`)}>${t('check.fix')}</button>` : nothing}
    </details>`
  }
}

define('app-check', Check)
// An answer that cites its sources is checked once it has come; what it cites is then in hand, so nothing counts it towards offering Double-check.
register({ id: 'check', hooks: [{ on: 'turn.end', match: { cites: true }, run: (e, next) => { check(e.task, e.at, e.records); return next({ ...e, cites: false }) } }] })
