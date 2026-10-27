// The conversation: messages, the live activity view, approvals, errors.
import { html, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app, retry, effective, brainLabel, openFile, send, canStepUp, askSmarter, assistantName, decisionsHere, notify, rewind, fork } from './state.js'
import { unlock, slots, SIZES } from './caps.js'
import { foldTurns, titleOf, linkedFiles, splitSuggestions, isPicture, filesMade } from '../core/events.js'
import { serviceURL } from '../core/settings.js'
import { t, locale, intlLocales, formatBytes, formatDuration, relativeTime } from '../core/i18n.js'
import { markdown, withFormulas } from './markdown.js'
import { icons } from './icons.js'
import { speaking, toggleSpeech, canSpeak } from './speech.js'

/** @import { Turn, Step } from '../core/events.js' */
/** @import { ToolCallInfo, ResourceLink } from '../core/types.js' */

/**
 * Where the reader was when the page went (a reload), in this tab only: the conversation, the turn
 * at the top of the window and how far into it, so answers that draw later don't move the line.
 * Nothing when at the end. Read once, by the page that comes next.
 */
const SPOT = 'app.spot'
/** @type {{ id: string, turn: number, offset: number } | null} */
let spot = null
try {
  spot = JSON.parse(sessionStorage.getItem(SPOT) ?? 'null')
  sessionStorage.removeItem(SPOT)
} catch {}

/** The time, a minute at a time, so that "5 minutes ago" moves on. */
const now = signal(Date.now())
setInterval(() => { now.value = Date.now() }, 60_000)

/** What the conversation scrolls in (its tile, D635, or the page), whether it is read to its end, its end shown, its top. */
export const scroller = () => /** @type {HTMLElement} */ (document.querySelector('[data-split] .here') ?? document.documentElement)
export const atEnd = (slack = 120, box = scroller()) => box.clientHeight + box.scrollTop >= box.scrollHeight - slack
export const toEnd = (box = scroller()) => box.scrollTo({ top: box.scrollHeight, behavior: 'instant' })
const top = () => Math.max(0, scroller().getBoundingClientRect().top)

/** The request in a box, by its time (D312): ui/edit.js. */
export const editing = signal('')
/** A request's words: its formulas, and once ui/marks.js is here, what it names and its tags (D610). */
export const asked = signal(/** @type {(text: string) => unknown} */ ((text) => (/(?:^|\s)[/#]\S/.test(text) && import('./marks.js'), withFormulas(text))))

class Conversation extends Element {
  #follow = true
  /** @type {string | undefined} */
  #shown
  #opening = false
  #opened = () => { this.#opening = false }
  #grown = new ResizeObserver(() => this.#opening && this.#go(null))
  #onScroll = () => {
    if (!this.#opening) this.#follow = atEnd()
  }
  #keep = () => {
    const turns = [...this.querySelectorAll('.turns > .turn')]
    const index = Math.max(0, turns.findLastIndex((turn) => turn.getBoundingClientRect().top <= top()))
    const end = atEnd(1)
    try {
      if (end || !turns[index]) sessionStorage.removeItem(SPOT)
      else sessionStorage.setItem(SPOT, JSON.stringify({ id: app.current.peek()?.id, turn: index, offset: top() - turns[index].getBoundingClientRect().top }))
    } catch {}
  }

  connectedCallback() {
    super.connectedCallback()
    addEventListener('scroll', this.#onScroll, true)
    addEventListener('pagehide', this.#keep)
    this.#grown.observe(this)
    // Back where the reader was, or at the end: once the box below is drawn too, and again once the
    // capabilities are back, unless the reader has moved since.
    const back = spot?.id === app.current.peek()?.id ? spot : null
    spot = null
    // Until then, the browser's scroll anchoring would move the page as what comes later draws, as if the reader had.
    document.documentElement.style.overflowAnchor = 'none'
    queueMicrotask(async () => {
      this.#go(back)
      const at = scroller().scrollTop
      await app.ready.catch(() => {})
      if (this.isConnected && (back ? scroller().scrollTop === at : this.#follow)) this.#go(back)
      document.documentElement.style.overflowAnchor = ''
    })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    removeEventListener('scroll', this.#onScroll, true)
    removeEventListener('pagehide', this.#keep)
    this.#grown.disconnect()
  }

  /** @param {{ turn: number, offset: number } | null} back */
  #go(back) {
    const turn = back && this.querySelectorAll('.turns > .turn')[back.turn]
    if (turn) this.#opening = false
    const box = scroller()
    box.scrollTo({ top: turn ? turn.getBoundingClientRect().top - top() + box.scrollTop + back.offset : box.scrollHeight, behavior: 'instant' })
    this.#onScroll()
  }

  render() {
    const current = app.current.value
    if (!current) return nothing
    const turns = foldTurns(current.records)
    const files = linkedFiles(current.records)
    const live = app.live.value
    const error = app.error.value
    const sources = citable(files, live ? [...turns, live.turn] : turns)
    return html`
      <h1 class="conversation-title" dir="auto">${titleOf(current.records) || t('conversation.untitled')}</h1>
      <ol class="turns">
        ${repeat(turns, (turn) => turn.at, (turn, index) => {
          const last = index === turns.length - 1
          return turnView(turn, last ? live?.turn ?? null : null, files, turns.slice(0, index + 1), last, sources, turns[index + 1]?.user?.steer)
        })}
        ${(live?.steers ?? []).map((text, i) => html`<li class="turn"><p class="msg msg-user" dir="auto">${asked.value(text)}</p>
          <div class="msg-actions is-request"><span class="msg-time">${t('steer.waiting')}</span><button class="icon-button subtle" aria-label=${t('steer.back')}
            @click=${() => import('./send.js').then((module) => module.takeBack(i))}>${icons.close}</button></div></li>`)}
      </ol>
      ${error ? errorView(error) : nothing}`
  }

  updated() {
    // Another conversation opens at its end, wherever the one before was read; until the reader does
    // anything, the scrolling is Jean's, and what draws late (a picture, a card) keeps the end in view.
    const id = app.current.peek()?.id
    if (id !== this.#shown) {
      [this.#shown, this.#follow, this.#opening] = [id, true, true]
      for (const type of ['pointerdown', 'keydown', 'wheel']) addEventListener(type, this.#opened, { capture: true, passive: true, once: true })
    }
    if (this.#follow) toEnd()
  }
}

/**
 * Everything the brain may cite, by number (source chips): shared files, which open, and what
 * tools and the brain's own search brought in, where a web page is a link.
 * @param {ResourceLink[]} files @param {Turn[]} turns @returns {import('./markdown.js').Sources}
 */
function citable(files, turns) {
  /** @type {import('./markdown.js').Sources} */
  const sources = new Map()
  for (const link of files) {
    const number = link._meta?.source
    if (number && !sources.has(number)) sources.set(number, { name: link.name, label: t('sources.open', { name: link.name }), open: (at) => openFile(link, at), ...(isPicture(link) && { file: link }) })
  }
  for (const { n, title, url, picture } of turns.flatMap((turn) => turn.steps.flatMap((step) => step.tools.flatMap((tool) => tool._meta?.sources ?? [])))) {
    if (!sources.has(n)) sources.set(n, { name: title, label: t('sources.open', { name: title }), ...(web(url) && { url, ...site(url) }), open: url && /^(files|documents|collections)\//.test(url) ? (at) => openFile({ type: 'resource_link', uri: url, name: title, ...(/^collections\//.test(url) && { title }) }, at) : undefined, picture })
  }
  return sources
}

/** Only web addresses become links: a tool's result could name any scheme. @param {string | undefined} url @returns {url is string} */
const web = (url) => /^https?:\/\//i.test(url ?? '')

/** A web page's domain, and its icon unless the address for icons is '' (D210). @param {string} url */
function site(url) {
  const icon = serviceURL('siteIcon', app.settings.value, app.policy)
  try { const { hostname } = new URL(url); return { site: hostname.replace(/^www\./, ''), icon: icon && icon.replace('{domain}', hostname) } } catch { return {} }
}

/**
 * @param {Turn} turn @param {Turn | null} live
 * @param {ResourceLink[]} files every file in the conversation @param {Turn[]} upTo this turn and those before it
 * @param {boolean} last @param {import('./markdown.js').Sources} sources @param {boolean} [steered] D365
 */
function turnView(turn, live, files, upTo, last, sources, steered) {
  // Calls the file keeps as pending never ended, or are asked again in the live answer; one it keeps as running was cut short (D212).
  const steps = [...turn.steps.map((step) => ({ ...step, tools: step.tools.filter((tool) => tool.status !== 'pending').map(cutShort) })), ...(live?.steps ?? [])]
  // The brain's follow-ups come in a trailing block, hidden from the answer itself.
  const { text, suggestions } = splitSuggestions(steps.map((step) => step.text).filter(Boolean).join('\n\n'))
  const entries = steps.flatMap((step) => step.tools)
  const streaming = Boolean(live)
  const read = whatJeanRead(upTo, entries, files)
  const since = turn.notes.map((note) => note.data).find((data) => data.kind === 'since')
  // A routine's request, sent by Jean on its schedule (D122): its line opens the routine and its runs.
  const routine = turn.notes.map((note) => note.data).find((data) => data.kind === 'routine')
  // A summary the brain read on from (D359).
  const summed = steps.findLast((step) => step.compaction)?.compaction
  if (summed) unlock('compact')
  // The plan (D364).
  const plan = live?.plan ?? turn.plan
  if (last && !streaming && entries.findLast((entry) => entry.kind === 'think' && !entry.name && !entry._meta?.parent)?.rawOutput?.stopReason === 'tool_use') unlock('plan')
  // A double click on its request, or Enter on it, edits it, once Try again could (D312); Enter goes no further.
  const edit = (/** @type {Event} */ event) => {
    event.preventDefault()
    if (!(last && app.busy.value)) import('./edit.js').then(() => { editing.value = turn.at })
  }
  return html`<li class="turn">
    ${since?.kind === 'since' ? html`<p class="since">${icons.since}<span>${t('cap.since.name')} · ${relativeTime(since.since)}</span></p>
      <p class="since-note">${t('since.closed', { name: assistantName() })}</p>` : nothing}
    ${routine?.kind === 'routine' ? html`<button class="since" @click=${() => import('./knows.js').then((knows) => knows.showRoutine(routine.routine))}>${icons.alarm}<span>${t('cap.routines.name')} · <span dir="auto">${routine.title}</span></span></button>` : nothing}
    ${turn.user?.files.length ? html`<ul class="msg-files" aria-label=${t('files.attached')}>${turn.user.files.map((link) => html`<li>
      ${isPicture(link) ? shared(link) : html`<button class="file-chip" @click=${() => openFile(link)} title=${t('files.open')}>${icons.file}<span dir="auto">${link.name}</span></button>`}
    </li>`)}</ul>` : nothing}
    ${turn.user?.text ? editing.value === turn.at ? html`<app-edit class="msg-user" .request=${turn.user}></app-edit>`
      : html`<p class="msg msg-user" dir="auto" tabindex=${last && app.busy.value ? nothing : 0} aria-keyshortcuts="Enter" @dblclick=${edit}
        @keydown=${(/** @type {KeyboardEvent} */ event) => event.key === 'Enter' && edit(event)}>${asked.value(turn.user.text)}</p>` : nothing}
    ${turn.user ? requestActions(turn.user, !(last && app.busy.value)) : nothing}
    ${summed ? html`<app-compaction .record=${summed}></app-compaction>` : nothing}
    ${streaming || text || entries.length ? html`
      <article class="msg msg-jean ${streaming ? 'is-streaming' : ''}" aria-busy=${streaming ? 'true' : 'false'}>
        ${slots('progress').map((entry) => entry.draw({ plan }))}
        ${activity(steps, text, streaming, files, plan?.find((entry) => entry.status === 'in_progress')?.content, steered)}
        ${text ? html`<div class="prose" dir="auto">${markdown(text, sources, streaming)}${streaming ? html`<span class="caret" aria-hidden="true"></span>` : nothing}</div>` : nothing}
        ${entries.flatMap((entry) => (entry._meta?.picture || (entry._meta?.making && entry.status === 'in_progress') ? [html`<app-picture .call=${{ ...entry }}></app-picture>`] : []))}
        ${entries.flatMap((entry) => (entry._meta?.checked ? [html`<app-certificate .call=${entry}></app-certificate>`] : []))}
        ${[...new Map(entries.flatMap(({ _meta }) => [...(_meta?.file ? [_meta.file] : []), ...(_meta?.files ?? [])].map((file) => [file.name, file]))).values()].map((file) => html`<app-file uri=${file.uri} name=${file.name} type=${file.mimeType} size=${file.size} version=${file.version ?? ''}></app-file>`)}
        ${entries.flatMap((entry) => (entry.status === 'completed' && entry.content?.some((part) => part.type === 'diff') ? [html`<app-folder-change .call=${entry}></app-folder-change>`] : []))}
        ${!streaming && read.length ? readView(read) : nothing}
        ${!streaming && entries.some((entry) => entry._meta?.sources) ? sourcesView(entries.flatMap((entry) => entry._meta?.sources ?? [])) : nothing}
        ${!streaming && text ? html`<app-check at=${turn.at}></app-check>` : nothing}
        ${!streaming && text ? actions(turn, text) : nothing}
      </article>` : nothing}
    ${last && !streaming && !app.busy.value ? followUps(turn.at, suggestions, entries.findLast((entry) => entry.kind === 'think' && !entry.name && !entry._meta?.parent)) : nothing}
  </li>`
}

/** A picture the user shared shows itself, and opens whole. @param {ResourceLink} link */
function shared(link) {
  import('./shown.js')
  return html`<button class="file-chip is-picture" @click=${() => openFile(link)} aria-label=${link.name} title=${t('files.open')}>
    <app-shared uri=${link.uri} type=${link.mimeType}></app-shared></button>`
}

/** A call the file keeps as running, which the page closed on: it ended there, and may not have been done. @param {ToolCallInfo} tool */
const cutShort = (tool) => (tool.status === 'in_progress' ? { ...tool, status: /** @type {const} */ ('failed'), rawOutput: t('activity.cutShort') } : tool)

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
    ${suggestions.map((suggestion) => html`<li><button class="follow-up" dir="auto" @click=${() => send(suggestion)}><span>${withFormulas(suggestion)}</span></button></li>`)}
    ${actions.map((id) => html`<li><button class="follow-up" @click=${() => import('./discovery.js').then((module) => module.follow(id))}>${t(`suggest.${id}`)}</button></li>`)}
    ${smarter ? html`<li><button class="follow-up is-smarter" @click=${askSmarter}>${icons.brain}${t('auto.smarter')}</button></li>` : nothing}
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
  // Each range of pages a file went in with, on a line of its own.
  /** @type {{ link: ResourceLink, range?: [number, number], of?: number }[]} */
  const items = upTo.flatMap((turn) => turn.user?.files ?? []).flatMap((link) => (link._meta?.pages ?? [undefined]).map((range) => ({ link, range, of: link._meta?.of })))
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
    <summary>${icons.file}<span>${t('read.title', { name: assistantName(), count: items.length })}</span>${icons.chevron}</summary>
    <ul>${items.map(({ link, range, of }) => html`<li>
      <button class="link-button" @click=${() => openFile(link)} dir="auto">${link.name}</button>
      <span class="muted">${range && of ? t('read.pages', { first: range[0], last: range[1], total: of }) : t('read.whole')}</span>
    </li>`)}</ul>
  </details>`
}

/** What tools and the brain's own search brought in for this answer, by number. @param {{ n: number, title: string, url?: string }[]} cited */
function sourcesView(cited) {
  return html`<details class="read-list">
    <summary>${icons.globe}<span>${t('sources.title')}</span>${icons.chevron}</summary>
    <ul>${cited.map(({ n, title, url }) => html`<li><span class="cite">${n}</span>${web(url)
      ? html`<a class="link-button" href=${url} data-site=${site(url).site} target="_blank" rel="noopener noreferrer" dir="auto">${title}</a>` : html`<span dir="auto">${title}</span>`}</li>`)}</ul>
  </details>`
}

/**
 * "What Jean is doing", from the turn's ACP records, in the order it happened: each time the
 * brain was asked, then the calls it made. What a script or a helper did shows under its call,
 * as a tree: a helper's brain, its calls, and their scripts' calls. Each line opens on what it
 * was given and what came back, so a step that went wrong can be looked into; a plan's step under way says what it does (D364).
 * @param {Step[]} steps @param {string} text @param {boolean} streaming @param {ResourceLink[]} files @param {string} [doing] @param {boolean} [steered]
 */
function activity(steps, text, streaming, files, doing, steered) {
  const entries = steps.flatMap((step) => step.tools)
  const tools = entries.filter((entry) => entry.name || entry._meta?.parent)
  const last = entries.findLast((entry) => !entry.name && !entry._meta?.parent)
  const failed = last?.status === 'failed'
  // Asked for tools and never read what they returned: out of steps, or closed in the middle.
  const unfinished = !streaming && !steered && last?.rawOutput?.stopReason === 'tool_use'
  const working = tools.some((tool) => tool.status === 'pending' || tool.status === 'in_progress')
  // A task paused at its limit didn't fail (D364).
  const status = streaming ? (working ? 'working' : 'thinking') : failed || (unfinished && !last?._meta?.stopped) ? 'failed' : 'completed'
  // A request that failed is asked again after a moment (D202).
  const summary = streaming
    ? doing && !last?._meta?.retrying && (working || !text) ? doing : t(last?._meta?.retrying ? 'activity.retrying' : working ? 'activity.working' : text ? 'activity.writing' : 'activity.thinking')
    : failed ? t('activity.failed') : unfinished ? t('activity.unfinished') : last ? t('activity.answeredWith', { brain: brainName(last) })
      // A turn that was one call, with no brain asked (a flow run, D218): what that call did.
      : toolLabel(tools.findLast((tool) => !tool._meta?.parent) ?? /** @type {ToolCallInfo} */ ({ toolCallId: '', title: '' }))
  // The offer made here, not in a conversation out of sight (D147).
  const offering = app.offering.value?.conversation === app.current.value?.path ? app.offering.value : null
  // What each brain step thought and wrote.
  const said = new Map(steps.map((step) => [step.tools.findLast((entry) => !entry.name && !entry._meta?.parent)?.toolCallId, step]))
  // A brain that thinks at length, with nothing written yet, can be told to answer now, once (D414).
  const thinking = streaming && last?.status === 'in_progress' && !last._meta?.hurried && said.get(last.toolCallId)
  const hurry = thinking && !thinking.text && thinking.thought.length > 2000
  // Parts in the order the work was split (their calls are kept in the order they finished).
  const order = (/** @type {ToolCallInfo} */ tool) => Number(/\.(\d+)$/.exec(tool.toolCallId)?.[1] ?? 0)
  /** @type {{ entry: ToolCallInfo, depth: number, key: string }[]} */
  const rows = []
  // Keys stay with their line as lines arrive, so one that is open stays open (a brain may reuse an id).
  const seen = new Map()
  /** @param {ToolCallInfo} entry @param {number} depth */
  const add = (entry, depth) => {
    seen.set(entry.toolCallId, (seen.get(entry.toolCallId) ?? 0) + 1)
    rows.push({ entry, depth, key: `${entry.toolCallId}#${seen.get(entry.toolCallId)}` })
    // The brain's own searches, kept with its reply.
    for (const block of entry._meta?.raw ?? []) {
      if (block.type === 'server_tool_use' && block.name === 'web_search') add({ toolCallId: block.id, title: '', name: 'web_search', status: 'completed', rawInput: block.input }, depth + 1)
    }
    const children = tools.filter((child) => child._meta?.parent === entry.toolCallId)
    if (entry.name === 'delegate') children.sort((a, b) => order(a) - order(b))
    for (const child of children) add(child, depth + 1)
  }
  for (const entry of entries) if (!entry._meta?.parent) add(entry, 0)
  return html`
    <details class="activity" data-status=${status}>
      <summary><span class="ember" aria-hidden="true"></span><span dir="auto">${summary}</span>${icons.chevron}</summary>
      <ol class="activity-list">
        ${repeat(rows, (row) => row.key, ({ entry, depth }) => html`<li data-status=${entry.status ?? 'pending'} data-call=${entry.toolCallId} class=${depth ? 'is-nested' : ''}
          data-depth=${entry.name || depth ? depth : nothing}>
          <details class="step">
            <summary><span class="ember" aria-hidden="true"></span><span dir="auto">${entry.name ? toolLabel(entry, files) : entry._meta?.compact ? html`<app-compaction .entry=${entry}></app-compaction>` : brainLine(entry)}</span>${icons.chevron}</summary>
            ${entry.name ? toolDetails(entry) : brainDetails(entry, said.get(entry.toolCallId))}
          </details>
        </li>`)}
      </ol>
      ${tools.length ? slots('activity').map((action) => action.draw()) : nothing}
    </details>
    ${hurry ? html`<div><button class="link-button" @click=${() => import('./send.js').then((module) => module.answerNow())}>${t('activity.answerNow')}</button></div>` : nothing}
    ${streaming ? inbox(entries, files) : nothing}
    ${streaming && offering ? offerCard(offering) : nothing}`
}

/** Which brain was asked, and why Auto chose it. @param {ToolCallInfo} brain */
function brainLine(brain) {
  return html`${t('activity.brain', { brain: brainName(brain) })}
    ${brain.rawInput?.auto ? html`<span class="muted"> · ${autoReason(brain.rawInput.auto)}</span>` : nothing}
    ${brain.rawOutput?.usage?.cacheReadTokens ? html`<span class="muted"> · ${t('activity.cached')}</span>` : nothing}
    ${brain._meta?.hurried ? html`<span class="muted"> · ${t('activity.hurried')}</span>` : nothing}
    ${brain.status === 'failed' && brain.rawOutput?.error ? html`<span class="muted"> — ${brain.rawOutput.error}</span>` : nothing}`
}

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

/** ui/whose.js, once a call says whose rule decided it (D299). */
const said = signal(/** @type {typeof import('./whose.js') | null} */ (null))
const whose = (/** @type {any} */ meta) => said.value?.whose(meta) ?? (import('./whose.js').then((module) => (said.value = module)), nothing)

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

/**
 * The decision inbox: approvals, Jean's or its helpers', wait here as cards, one each, while the
 * rest of the work goes on, and are answered in any order. Questions wait in the box (caps/ask, D343).
 * @param {ToolCallInfo[]} entries @param {ResourceLink[]} files
 */
function inbox(entries, files) {
  const waiting = decisionsHere().filter((decision) => 'toolCall' in decision)
  if (!waiting.length) return nothing
  // Which helper is asking: the one whose call the request sits under.
  const from = (/** @type {string} */ id) => entries.find((entry) => entry.name === 'helper' && id.startsWith(`${entry.toolCallId}/`))?.rawInput?.title
  return html`<section class="inbox" aria-label=${t('inbox.waiting', { count: waiting.length })}>
    ${waiting.length > 1 ? html`<p class="inbox-count">${t('inbox.waiting', { count: waiting.length })}</p>` : nothing}
    ${repeat(waiting, (decision) => decision.id, (decision) => approval(decision, from(decision.toolCall.toolCallId), files))}
  </section>`
}

/** Who a card is from, when a helper asks. @param {string | undefined} helper */
const asking = (helper) => (helper ? html`<p class="approval-from">${icons.helpers}<span dir="auto">${helper}</span></p>` : nothing)

/** Why Auto chose a brain, in plain words. @param {{ level: number, reason: string }} auto */
function autoReason({ level, reason }) {
  return reason === 'demand' ? t(`auto.demand.${level}`) : t(`auto.reason.${reason}`)
}

/** Offers whose sentence above the box says what set them off: in an answer, they say what they do (D322). */
const IN_ANSWER = new Set(['skills', 'routines', 'flows'])

/** The brain's offer, in the answer it is part of. @param {NonNullable<typeof app.offering.value>} offering */
function offerCard({ id, resolve }) {
  return html`<div class="approval" role="group" aria-label=${t('offer.title')}>
    <p><strong>${t(`cap.${id}.name`)}</strong></p>
    <p>${t(IN_ANSWER.has(id) ? `cap.${id}.inAnswer` : `cap.${id}.offer`, { name: assistantName(), size: formatBytes(SIZES[id] ?? 0) })}</p>
    <div class="approval-actions">
      <button class="button primary" @click=${() => resolve(true)}>${t('offer.yes')}</button>
      <button class="button subtle" @click=${() => resolve(false)}>${t('offer.no')}</button>
    </div>
  </div>`
}

/** Brain label rendered in the current language from structured data. @param {ToolCallInfo} entry */
export function brainName(entry) {
  const { provider, model } = entry.rawInput ?? {}
  return provider && model ? brainLabel(/** @type {any} */ ({ provider, model, api: provider === 'device' ? 'device' : '' })) : entry.title
}

/**
 * Plain-language label in the current language: from the kind and the file it touched, or
 * from the tool's name; the brain's own title is the last resort.
 * @param {ToolCallInfo} tool @param {ResourceLink[]} [files]
 */
export function toolLabel(tool, files = []) {
  if (tool.name === 'helper') return tool.rawInput?.title ?? tool.title
  if (tool.name === 'write') return t('tool.write', { name: tool.rawInput?.name ?? '' })
  const path = tool.locations?.[0]?.path
  const target = path && (files.findLast((file) => file.uri === path)?.name ?? path.split('/').at(-1))
  if (target) return t(`kind.${tool.kind ?? 'other'}.doing`, { target })
  if (tool.name === 'offer') return t('tool.offer', { name: t(`cap.${String(tool.rawInput?.capability)}.name`) })
  if (tool.name === 'meet') return t('tool.meet', { names: new Intl.ListFormat(intlLocales()).format(tool._meta?.names ?? []) })
  if (tool.name === 'web_search') return `${t('tool.web_search')} · ${tool.rawInput?.query ?? ''}`
  if (tool.name === 'ask_user') {
    const asked = Array.isArray(tool.rawInput?.questions) ? tool.rawInput.questions : []
    return `${t('tool.ask_user', { count: asked.length })} · ${asked[0]?.question ?? ''}`
  }
  const key = `tool.${String(tool.name)}`
  return t(key) === key ? tool.title : t(key)
}

/**
 * @param {Extract<import('./state.js').Decision, { toolCall: any }>} decision
 * @param {string | undefined} helper @param {ResourceLink[]} files
 */
function approval({ toolCall, resolve }, helper, files) {
  // In the user's folder: the change and its diff, or opening the folder (caps/folders, D141).
  if (toolCall._meta?.folder) return html`<app-folder-approval .decision=${{ toolCall, resolve }} .helper=${helper}></app-folder-approval>`
  // A site the computer hasn't reached yet (caps/computer, D162).
  if (toolCall._meta?.site) return html`<app-site-approval .decision=${{ toolCall, resolve }} .helper=${helper}></app-site-approval>`
  return html`<div class="approval" role="group" aria-label=${t('approval.title')}>
    ${asking(helper)}
    <p>${t('approval.question', { action: toolLabel(toolCall, files) })}</p>
    <div class="approval-actions">
      <button class="button primary" @click=${() => resolve('allow_once')}>${t('approval.allowOnce')}</button>
      ${app.policy.child ? nothing : html`<button class="button" @click=${() => resolve('allow_always')}>${t('approval.allowAlways')}</button>`}
      <button class="button" @click=${() => resolve('reject_once')}>${t('approval.rejectOnce')}</button>
      ${app.policy.child ? nothing : html`<button class="button subtle" @click=${() => resolve('reject_always')}>${t('approval.rejectAlways')}</button>`}
    </div>
  </div>`
}

/** How long ago, and the day and time in full on hover. @param {string} at */
const when = (at) => html`<time class="msg-time" datetime=${at} title=${new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'full', timeStyle: 'short' }).format(new Date(at))}>${relativeTime(at, now.value)}</time>`

/**
 * Under a request: when it was asked, Copy, Try again once its answer is written, which goes back
 * to it when the user agrees (D188), and Continue in a new task, which answers it in a new conversation
 * (D230). @param {import('../core/events.js').UserTurn} user @param {boolean} answered
 */
function requestActions({ text, at, upTo }, answered) {
  return html`<div class="msg-actions is-request">${when(at)}${text ? html`
    <button class="icon-button subtle" aria-label=${t('action.copy')}
      @click=${() => navigator.clipboard.writeText(text).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
    <button class="icon-button subtle" aria-label=${t('action.retry')} ?disabled=${!answered} @click=${() => confirm(t('rewind.confirm')) && rewind(upTo)}>${icons.retry}</button>
    <button class="icon-button subtle" aria-label=${t('action.fork')} @click=${() => fork(upTo)}>${icons.fork}</button>` : nothing}</div>`
}

/** @param {Turn} turn @param {string} text */
function actions(turn, text) {
  const isSpeaking = speaking.value === turn.at
  // Copy and More options belong to "Things Jean made", which loads with the first answer (D409).
  unlock('made')
  unlock('receipt')
  return html`<div class="msg-actions">
    <app-made .source=${text}></app-made>
    ${canSpeak() ? html`<button class="icon-button subtle ${isSpeaking ? 'is-active' : ''}" aria-pressed=${isSpeaking ? 'true' : 'false'}
      aria-label=${t(isSpeaking ? 'action.stopReading' : 'action.readAloud')}
      @click=${() => toggleSpeech(turn.at, text, locale.value, effective.value.settings.voice)}>${icons.speaker}</button>` : nothing}
    <app-receipt .turn=${turn} .text=${text}></app-receipt>
    ${slots('answer').map((entry) => entry.draw({ text, at: turn.at }))}
    <app-made .source=${text} .files=${filesMade(turn.steps.flatMap((step) => step.tools))} menu></app-made>
    ${when(turn.end ?? turn.at)}
  </div>`
}

/** @param {{ code: string, message: string }} error */
function errorView(error) {
  const fixable = ['auth', 'credits', 'not_found', 'bad_request', 'cors_or_offline'].includes(error.code)
  return html`<div class="msg msg-error" role="alert">
    <p>${error.message}</p>
    <div class="msg-error-actions">
      <button class="button" @click=${retry}>${icons.retry} ${t('action.retry')}</button>
      ${fixable ? html`<button class="button subtle" @click=${() => import('./dialogs.js').then((module) => module.openSettings('brains'))}>${t('brain.manage')}</button>` : nothing}
    </div>
  </div>`
}

define('app-conversation', Conversation)
