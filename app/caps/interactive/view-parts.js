// A page of parts (D631), drawn in the answer itself from what ./parts.js reads in it: key figures as the answers' own (D215),
// cards side by side, a table whose heads sort it, a chart drawn by Charts (D196), unlocked on sight, a form that adds a row to a
// table of the page for this visit or sends its fields as the user's next message, a map or a diagram as the answers' own, and
// an aside beside the rest where there is room. Copy gives its source. It grows as the answer writes it.
// A part that names a collection (D633) shows it as it is and follows each change: Jean fills its lines from it (../tables/fill.js),
// so the page never reads it, and a form adds a row to it as the user's own change. Only in a task of the project's own, never one
// brought in from someone else's (D361, D378); there, and in a copy saved or shared, it shows what was kept of it then. Its `where`
// keeps only some of the rows; one that can't be read says so.
import { html, nothing, render } from 'lit-html'
import { effect, signal } from '@preact/signals-core'
import { app, notify, send } from '../../ui/state.js'
import { drawnActions, loaded, unlock } from '../../ui/caps.js'
import { drawn } from '../../ui/markdown.js'
import { icons } from '../../ui/icons.js'
import { t, locale, intlLocales } from '../../core/i18n.js'
import { foldTurns } from '../../core/events.js'
import { loadConversation } from '../../core/conversations.js'
import { aligned } from '../layouts/shapes.js'
import { parse, all, bound, key, frozen, figures, table, chart, form, number } from './parts.js'

/** @import { Part } from './parts.js' */
/** A part as it is drawn: one that shows a collection with its lines filled, the collection followed, and a form's columns; or the name of one not here, or of one its `where` can't filter. @typedef {Part & { live?: any, columns?: any[], missing?: string, unread?: string }} Shown */

/** A chart's option for ECharts: bars, lines, areas, bars across or a pie, by its labels and series. @param {ReturnType<typeof chart>} drawing */
function option({ kind, labels, series }) {
  const values = (/** @type {number[]} */ data) => data.map((value) => (Number.isFinite(value) ? value : null))
  if (kind === 'pie') return { tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: ['38%', '62%'], data: labels.map((name, i) => ({ name, value: values(series[0]?.data ?? [])[i] ?? 0 })) }] }
  const [across, along] = kind === 'hbar' ? ['yAxis', 'xAxis'] : ['xAxis', 'yAxis']
  return { tooltip: { trigger: 'axis' }, ...(series.length > 1 && { legend: {} }), [across]: { type: 'category', data: labels }, [along]: { type: 'value' },
    series: series.map(({ name, data }) => ({ name, data: values(data), type: /^(line|area)$/.test(kind) ? 'line' : 'bar', ...(kind === 'area' && { areaStyle: {} }) })) }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})html[^\n]*\n([\s\S]*?)\n {0,3}\1/gim
/**
 * What the pages a text holds show of the project's collections now, by each part's key (D633), for a copy that keeps it: a share, a
 * page saved, a download. Nothing where none shows one, or Tables isn't found. @param {string} text a task's JSONL, an answer's Markdown or a page
 * @returns {Promise<Record<string, string>>}
 */
export async function snapshot(text) {
  if (!loaded.peek().has('tables')) return {}
  const tables = await import('../tables/tables.js'), holds = /** @type {(() => void)[]} */ ([]), fills = /** @type {Record<string, string>} */ ({})
  const said = text.startsWith('{') ? foldTurns(text.split('\n').flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })).flatMap((turn) => turn.steps.map((step) => step.text)).join('\n') : text
  for (const source of [...said.matchAll(FENCE)].map((found) => found[2]).concat(parse(text) ? [text] : [])) {
    const parts = all(parse(source) ?? []), pages = parts.filter((part) => part.tag === 'app-table')
    for (const part of parts) {
      const name = bound(part, pages), where = name ? await tables.follow(name, holds) : null
      const filled = where?.value && tables.filled(where.value, part)
      if (filled) fills[key(part)] = filled.text
    }
  }
  return (holds.forEach((hold) => hold()), fills)
}

customElements.define('app-parts', class extends HTMLElement {
  /** `open` while its block's closing fence isn't written yet. */
  static observedAttributes = ['source', 'open']
  /** The rows its forms gave each of its tables in this visit, by the table's id. @type {Map<string, string[][]>} */
  added = new Map()
  /** How each of its tables is sorted, by its place among them: by which column, and whether down. @type {Map<number, { column: number, down: boolean }>} */
  sorted = new Map()
  /** The collections its parts name, by name: followed, a signal; being read, null; out of its reach, false. @type {Map<string, any>} */
  followed = new Map()
  /** What lets them go with it. @type {(() => void)[]} */
  holds = []
  /** What its parts showed of them when last drawn, by each part's key, which Copy writes in. @type {Record<string, string>} */
  fills = {}
  /** Tables, once a part follows a collection. @type {any} */
  tables = null
  /** @type {Promise<boolean> | undefined} */
  binds
  /** Drawn again when it changes, and as what it read changes: the language, the diagrams, the collections it follows. */
  tick = signal(0)
  /** @type {(() => void) | undefined} */
  unwatch

  connectedCallback() { this.unwatch = effect(() => { void [locale.value, this.tick.value]; this.draw() }) }
  disconnectedCallback() { this.unwatch?.(); for (const hold of this.holds.splice(0)) hold(); this.followed.clear() }
  attributeChangedCallback() { this.tick.value++ }

  draw() {
    const source = this.getAttribute('source') ?? '', open = this.hasAttribute('open'), parts = parse(source, open) ?? []
    const tables = all(parts).filter((part) => part.tag === 'app-table'), asides = parts.filter((part) => part.tag === 'aside')
    this.fills = {}
    /** @param {Part} given @returns {unknown} */
    const piece = (given) => {
      const name = bound(given, tables), part = /** @type {Shown} */ (name === undefined ? given : this.bound(given, name))
      if (part.missing || part.unread) return html`<p class="muted small" dir="auto">${part.unread ? t('interactive.unread', { name: part.unread, where: part.attrs.where ?? '' }) : t('interactive.noCollection', { name: part.missing ?? '' })}</p>`
      switch (part.tag) {
        case 'app-figures': return html`<ul class="figures">${figures(part).map(([value, words]) => html`<li><strong>${value}</strong><span>${words}</span></li>`)}</ul>`
        case 'app-cards': return html`<div class="part-cards">${part.kids.map(piece)}</div>`
        case 'app-card': return html`<section class=${'wide' in part.attrs ? 'part-card wide' : 'part-card'}>${part.attrs.heading ? html`<h4 dir="auto">${part.attrs.heading}</h4>` : nothing}${part.kids.map(piece)}</section>`
        case 'aside': return html`<aside>${part.kids.map(piece)}</aside>`
        case '#text': return part.text.trim().split(/\n\s*\n/).map((said) => html`<p dir="auto">${said.replace(/\s*\n\s*/g, ' ')}</p>`)
        case 'app-table': return this.table(part, tables.indexOf(given))
        case 'app-chart': return this.chart(part)
        case 'app-form': return this.form(part, tables)
        case 'app-map': return drawn.value.geojson?.(part.text, open) ?? nothing
        case 'app-diagram': return drawn.value.mermaid?.(part.text, open) ?? nothing
      }
    }
    const copy = () => navigator.clipboard.writeText(frozen(source, this.fills)).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))
    render(html`<div class="parts">${asides.length ? html`<div>${parts.filter((part) => part.tag !== 'aside').map(piece)}</div>${asides.map(piece)}` : parts.map(piece)}</div>
      <div class="drawn-foot"><button class="icon-button subtle" aria-label=${t('action.copy')} @click=${copy}>${icons.copy}</button>${drawnActions('html', source)}</div>`, this)
  }

  /**
   * A part as it shows a collection: its lines filled from it as it is now; where the page may not follow it, what its task kept of them
   * when it was shared or saved; else the collection's name, for a few words saying none is here, or that its `where` can't filter it.
   * @param {Part} part @param {string} name @returns {Shown}
   */
  bound(part, name) {
    const live = this.follow(name), kept = app.current.peek()?.records.findLast((record) => record.meta?.filled)?.meta?.filled?.[key(part)], filled = live?.value && this.tables.filled(live.value, part)
    if (filled) return { ...part, text: (this.fills[key(part)] = filled.text), live, columns: filled.columns }
    // A form that names no collection here is one that sends its fields, as it was before collections.
    return live?.value ? { ...part, unread: name } : typeof kept === 'string' ? { ...part, text: kept } : this.followed.get(name) !== false ? { ...part, text: '' } : part.tag === 'app-form' && !part.attrs.from ? part : { ...part, missing: name }
  }

  /** The collection a part names, followed once the page may (`allowed`): its signal, which reading ties the page to. @param {string} name */
  follow(name) {
    if (!this.followed.has(name)) {
      this.followed.set(name, null)
      void this.allowed().then(async (yes) => {
        this.tables = yes ? await import('../tables/tables.js') : null
        this.followed.set(name, (this.tables && this.isConnected && (await this.tables.follow(name, this.holds))) || false)
        this.tick.value++
      })
    }
    return this.followed.get(name) || null
  }

  /** Whether its parts may show the project's collections: Tables found, in a task of the project's that wasn't brought in from someone else's. */
  allowed() {
    return (this.binds ??= (async () => {
      const path = this.getAttribute('task') ?? (this.closest('.msg-jean') ? app.current.peek()?.path : '')
      const records = !path || !app.projectDir || !loaded.peek().has('tables') ? null : path === app.current.peek()?.path ? app.current.peek()?.records : (await loadConversation(app.fs, path).catch(() => null))?.records
      return Boolean(records?.length) && !records?.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared')
    })())
  }

  /**
   * A table, its rows and those its forms added, its amounts at the end, sorted by a head once one is pressed; each cell's words in their own
   * direction, as a date the user's language writes, filled in a page in another. @param {Part} part @param {number} n its place among the page's tables
   */
  table(part, n) {
    const { heads, rows } = table(part), lang = locale.peek(), sort = this.sorted.get(n), given = [...rows, ...(this.added.get(part.attrs.id ?? '') ?? [])]
    const align = aligned({ align: heads.map(() => null), rows: given.map((row) => row.map((text) => ({ text }))) }).map((side) => side && `align-${side}`), collator = new Intl.Collator(intlLocales(lang), { numeric: true })
    /** An amount by its value, one with none after the others; any other cell as the language sorts words. @param {string} a @param {string} b */
    const compare = (a, b) => (sort && align[sort.column] ? ((x, y) => (Number.isNaN(x) ? 1 : Number.isNaN(y) ? -1 : x - y))(number(a, lang), number(b, lang)) : collator.compare(a, b))
    const shown = sort ? [...given].sort((a, b) => compare(a[sort.column], b[sort.column]) * (sort.down ? -1 : 1)) : given
    const by = (/** @type {number} */ column) => () => { this.sorted.set(n, { column, down: sort?.column === column && !sort.down }); this.tick.value++ }
    return html`<div class="table" tabindex="0"><table>
      <thead><tr>${heads.map((head, i) => html`<th class=${align[i] || ''} aria-sort=${sort?.column === i ? (sort.down ? 'descending' : 'ascending') : nothing}><button type="button" class="sorts" @click=${by(i)}>${head}</button></th>`)}</tr></thead>
      <tbody>${shown.map((row) => html`<tr>${row.map((cell, i) => html`<td class=${align[i] || ''}><bdi>${cell}</bdi></td>`)}</tr>`)}</tbody>
    </table></div>`
  }

  /** A chart, drawn by Charts once it has come; until then, or where it can't come, its numbers as a table. @param {Part} part */
  chart(part) {
    const drawing = chart(part, locale.peek())
    if (customElements.get('app-chart')) return html`<app-chart source=${JSON.stringify(option(drawing))}></app-chart>`
    void unlock('charts').then((come) => come && this.isConnected && this.tick.value++)
    return this.table({ ...part, text: [['', ...drawing.labels], ...drawing.series.map(({ name, data }) => [name, ...data])].map((row) => row.join(' | ')).join('\n') }, -1)
  }

  /**
   * A form: a field for each of its lines, and its button, which adds what was filled in as a row to the collection it shows, as the
   * user's own change, or to the page's table it names, for this visit, or else sends it as the user's next message: what it asks,
   * then each field and its value. @param {Shown} part @param {Part[]} tables the page's
   */
  form(part, tables) {
    const fields = form(part), { ask = '', to = '' } = part.attrs, label = ask || t('action.send')
    /** @param {SubmitEvent} event */
    const submit = (event) => {
      event.preventDefault()
      const box = /** @type {HTMLFormElement} */ (event.currentTarget), values = [.../** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input, select, textarea'))]
        .map((input) => (input.type === 'checkbox' ? (input.checked ? '✓' : '') : input.value.trim()))
      if (part.live?.value) return void this.tables.addRow(part.live.value, Object.fromEntries((part.columns ?? []).map((property, i) => [property.id, values[i]]))).then(() => box.reset())
      if (to && tables.some((table) => table.attrs.id === to)) return void (this.added.set(to, [...(this.added.get(to) ?? []), values]), box.reset(), this.tick.value++)
      if (!app.busy.peek()) void send([label, ...fields.map((field, i) => `${field.label}: ${values[i]}`)].join('\n'))
    }
    /** @param {ReturnType<typeof form>[number]} field */
    const input = (field) => (field.kind === 'choice' ? html`<select>${field.choices?.map((choice) => html`<option ?selected=${choice === field.start}>${choice}</option>`)}</select>`
      : field.kind === 'long' ? html`<textarea rows="3" .value=${field.start}></textarea>`
      : field.kind === 'yes' || field.kind === 'no' ? html`<input type="checkbox" ?checked=${field.start ? /^(yes|on|true|✓)$/i.test(field.start) : field.kind === 'yes'}>`
      : html`<input type=${field.kind === 'text' ? 'text' : field.kind} step=${field.kind === 'number' ? 'any' : nothing} value=${field.start}>`)
    return html`<form class="part-form" @submit=${submit}>${fields.map((field) => html`<label class=${field.kind === 'yes' || field.kind === 'no' ? 'tick' : ''}><span dir="auto">${field.label}</span>${input(field)}</label>`)}
      <button type="submit" class="button primary">${label}</button></form>`
  }
})
