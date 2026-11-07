// What Jean cost over time, under Settings › Brains (D691): a line under its title saying this month's, which opens a page of the months, the
// brains and the tasks that cost most, each worked out by ./spent.js from every project's conversations, at today's prices as
// each answer's card is (D252). What each task asked for is kept in `.cache/spent.json`, read again only where its file changed.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { app, brainLabel, openConversation, enterProject, turnPage } from '../../ui/state.js'
import { readJSON, writeJSON } from '../../core/fs.js'
import { loadConversation } from '../../core/conversations.js'
import { titleOf, requestsOf } from '../../core/events.js'
import { t, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { PLANS } from '../../ui/prices.js'
import { costOf } from './certificate.js'
import { pricing, costText } from './receipt.js'
import { usesOf, tally } from './spent.js'

/** @typedef {{ seen: string, dir: string, title: string, uses: import('./spent.js').Use[] }} Kept a task's uses, as the cache keeps them */

const CACHE = '.cache/spent.json'
/** What each task asked of brains, once read. @type {import('@preact/signals-core').Signal<Parameters<typeof tally>[0] | null>} */
const tasks = signal(null)
/** What it cost, worked out as it shows, so that prices come in as they are read, as on an answer's card. */
const spent = () => tasks.value && tally(tasks.value, (use) => costOf([{ ...use, started: 0, first: false }], pricing))
/** @type {Promise<void> | null} */
let reading = null

/** Reads it again: each project's tasks, those whose file changed read anew. */
export const spending = () => (reading ??= reread().finally(() => { reading = null }))
async function reread() {
  const kept = /** @type {{ tasks?: Record<string, Kept> }} */ (await readJSON(app.fs, CACHE, { tasks: {} }).catch(() => ({ tasks: {} })))
  const read = /** @type {Record<string, Kept>} */ ({})
  for (const { dir } of app.projects.peek()) {
    for (const { name } of (await app.fs.list(`${dir}/conversations`).catch(() => [])).filter((entry) => entry.name.endsWith('.jsonl'))) {
      const path = `${dir}/conversations/${name}`, stat = await app.fs.stat?.(path), seen = stat ? `${stat.size} ${stat.lastModified}` : ''
      if (seen && kept.tasks?.[path]?.seen === seen) { read[path] = kept.tasks[path]; continue }
      const records = (await loadConversation(app.fs, path).catch(() => null))?.records ?? []
      read[path] = { seen, dir, title: titleOf(records) || (requestsOf(records)[0] ?? '').slice(0, 80), uses: usesOf(records) }
    }
  }
  await writeJSON(app.fs, CACHE, { format: 1, tasks: read }).catch(() => {})
  tasks.value = Object.entries(read).map(([path, one]) => ({ path, ...one }))
}

/** A sum as the card says it: about $…, Free (or In your plan), or Not known once one price wasn't. @param {{ cost: number, unknown: boolean }} sum @param {string} [plan] */
const said = ({ cost, unknown }, plan) => costText(unknown ? null : cost, plan)
const month = (/** @type {string} */ key) => new Intl.DateTimeFormat(intlLocales(), { month: 'long', year: 'numeric' }).format(new Date(`${key}-15T12:00:00`))
const thisMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }

/** Its line under Settings' Brains' title, once anything was asked of a brain: this month's, in the plan's words when only plans answered, which opens its page. */
export function row() {
  const sum = spent(), now = sum?.months.find((one) => one.month === thisMonth()) ?? { cost: 0, unknown: false }, plans = sum?.brains.map(({ provider }) => PLANS[provider]) ?? []
  return sum?.months.length ? html`<p class="brain-spent"><button class="link-button brain-link" data-brain="spent" title=${t('receipt.spent')} @click=${() => { app.section.value = 'brains/spent' }}>
    ${t('receipt.spentMonth', { cost: said(now, plans.every(Boolean) ? plans[0] : undefined) })} ${icons.chevron}</button></p>` : nothing
}

/** Its page: the months, each with a bar of its share of the costliest; the brains; then the tasks that cost most, each opening it. */
export function page() {
  const { months = [], brains = [], costly = [] } = spent() ?? {}, most = Math.max(...months.map(({ cost }) => cost), 0)
  return html`<p class="lede">${t('receipt.spentLede')}</p>
    <section class="parts"><h3>${t('receipt.months')}</h3><ul class="list">${months.map((one) => html`<li><span class="item-icon" aria-hidden="true">${icons.scroll}</span>
      <span class="item-text" id=${`spent-${one.month}`}>${month(one.month)}</span><strong>${said(one)}</strong><meter value=${most ? one.cost / most : 0} aria-labelledby=${`spent-${one.month}`}></meter></li>`)}</ul></section>
    <section><h3>${t('receipt.byBrain')}</h3><dl class="spent-brains">${brains.map((one) => html`<div class="receipt-stat"><dt><bdi>${brainLabel(/** @type {any} */ ({ ...one, api: one.provider === 'device' ? 'device' : '' }))}</bdi></dt><dd>${said(one, PLANS[one.provider])}</dd></div>`)}</dl></section>
    ${costly.length ? html`<section><h3>${t('receipt.costliest')}</h3><ul class="list brain-rows">${costly.map(({ path, title, dir, cost }) => html`<li><button class="item" @click=${() => turnPage(async () => {
      const project = dir && dir !== app.projectDir ? app.projects.peek().find((one) => one.dir === dir) : null
      if (project) await enterProject(project)
      await openConversation(path)
    })}><span class="item-text"><strong dir="auto">${title || t('conversation.untitled')}</strong><small>${said({ cost, unknown: false })}</small></span>${icons.chevron}</button></li>`)}</ul></section>` : nothing}`
}
