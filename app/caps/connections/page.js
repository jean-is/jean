// Settings' Connections (D529): its title with Connect a service at its end, one line on what needs the user, else how
// many are connected, then a row for each, its account and when Jean last used it, a word where it is freer or stricter
// than the usual, opening its page, connections/<id>: what Jean may do there, reading and acting, for that service alone,
// its account, where it is used, its name, and Disconnect, asked in the sheet. connections/add finds a service among
// those Jean knows, by what they are for, each read on connections/add/<id> before it connects: what Jean may do there
// and how it signs in. What a browser can't reach yet, with the gateway (connections/later), and any other service by its
// address (connections/address) close it. With none connected, the section is the services to connect. Loaded the first
// time Settings shows Connections; when each was last used is read from the tasks' own records, as it is entered.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, effective, updateSettings } from '../../ui/state.js'
import { sectionOpen, lockedBy, placeable, where, projectName } from '../../ui/dialogs.js'
import { styleSheet } from '../../ui/sheet.js'
import { loadConversation } from '../../core/conversations.js'
import { ALPHABET } from '../../core/ulid.js'
import { resolveRule, STRICT } from '../../core/rules.js'
import { t, locale, relativeTime, intlLocales } from '../../core/i18n.js'
import { byName } from '../../core/search.js'
import { BRAND } from '../../brand.js'
import { icons } from '../../ui/menu-icons.js'
import { GROUPS, logoAt } from './directory.js'
import { all, status, message, called, labelOf, logoOf, limited, chosen, choose, connectTo, nameFor, signIn, remove, change, list, services, gatewayAt, products, toolName } from './connections.js'

/** @import { Connection } from '../../core/settings.js' */
/** @import { Listed } from './directory.js' */
/** @import { RuleValue } from '../../core/types.js' */

await Promise.all([styleSheet(new URL('../../ui/data-pages.css', import.meta.url)), styleSheet(new URL('connections.css', import.meta.url))])

const CHOICES = /** @type {const} */ (['allow', 'ask', 'never'])
const name = BRAND.name
/** When each connection was last used, by its id, read from the tasks' records. */
const used = signal(/** @type {Map<string, string>} */ (new Map()))
/** What is typed to find a service. */
const query = signal('')
/** Whether Disconnect is being asked, on the page open. */
const asking = signal(false)

/** The page open: '' for the list, add, add/<id>, later, address, or a connection's id. */
const pageOpen = () => app.section.value.split('/').slice(1).join('/')

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on what opened it. @param {string} to */
function go(to) {
  const from = pageOpen()
  asking.value = false
  if (message.peek()?.kind === 'error') message.value = null
  app.section.value = to ? `connections/${to}` : 'connections'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2' : `[data-page="${from}"]`))?.focus())
}

/** The tasks last read, so going from page to page doesn't read them again. */
let counted = /** @type {unknown} */ (null)
/** Reads when Jean last called each connection's tools: by the mark on its calls, or by their names for calls made before it. */
async function count() {
  if (counted === app.conversations.peek()) return
  counted = app.conversations.peek()
  const named = new Map(all().flatMap((connection) => (status.peek()[connection.id]?.tools ?? []).map((tool) => [toolName(connection, tool.name), connection.id])))
  const seen = new Map()
  for (const { path } of app.conversations.peek()) {
    for (const { at, update } of (await loadConversation(app.fs, path))?.records ?? []) {
      const id = update?.sessionUpdate === 'tool_call' && (update._meta?.service ?? named.get(String(update.name)))
      if (id && !(seen.get(id) > at)) seen.set(id, at)
    }
  }
  used.value = seen
}

// ─── Parts ───────────────────────────────────────────────────────────────────

/** A service's logo (D159), or else its first letter. @param {{ name: string, logo?: string }} entry @param {string} [kind] */
const monogram = ({ name: called, logo }, kind = 'monogram') => (logo ? html`<img class="${kind} is-logo" src=${logoAt(logo)} alt="">` : html`<span class=${kind} aria-hidden="true">${[...called][0]}</span>`)
/** A connection's logo, or its first letter. @param {Connection} connection */
const logo = (connection) => monogram({ name: connection.name, logo: logoOf(connection) }, 'item-icon')
/** The way back, to the list or another page. @param {string} to @param {string} label */
const back = (to, label) => html`<button class="back button subtle" @click=${() => go(to)}>${icons.back} ${label}</button>`
/** A page's title, the keyboard's to start from, under a logo, with its line and what it does most at its end. */
const head = (/** @type {string} */ title, /** @type {unknown} */ line = '', /** @type {unknown} */ end = nothing, /** @type {unknown} */ mark = nothing) => html`<header class="data-head">
  <div class="connection-title">${mark}<div><h2 tabindex="-1" dir="auto">${title}</h2>${line && (!Array.isArray(line) || line.length) ? html`<p class="lede">${line}</p>` : nothing}</div></div>${end}</header>`
/** Facts side by side, each kept in its own direction (an address in Arabic). @param {unknown[]} parts */
const joined = (parts) => parts.filter(Boolean).map((part, i) => html`${i ? ' · ' : ''}<bdi>${part}</bdi>`)
/** Names as the language lists them ("A, B and 35 more"), each in its own direction. @param {string[]} names */
const listOf = (names) => new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).formatToParts(names).map(({ type, value }) => (type === 'element' ? html`<bdi>${value}</bdi>` : value))
/** How the connection just asked for goes. */
const said = () => (message.value ? html`<p class="status is-${message.value.kind}" role="status">${message.value.text}</p>` : nothing)
/** A name like an address may wrap before its dot ("monday" ".com"), one in two words where its capital starts the second ("Service" "Now"). @param {string} text */
const wrapped = (text) => text.split(/(?=\.)|(?<=[a-z])(?=[A-Z])/).map((part, i) => (i ? html`<wbr>${part}` : part))
/** Its group, Other for one policy added without one. @param {Listed} entry */
const groupOf = (entry) => (GROUPS.includes(entry.group ?? '') ? entry.group : 'other')

/** A kind's rule for every service, the organisation's first. @param {string} kind @returns {RuleValue} */
const usual = (kind) => resolveRule(kind, { user: effective.value.settings.rules, policy: app.policy.rules })
/** What Jean does in this service for a kind: the user's choice for it, else the usual. @param {Connection} connection @param {string} kind */
const rule = (connection, kind) => chosen(connection.id, kind) ?? usual(kind)
/** A word on a row, where this service is freer or stricter than the usual, reading first. @param {Connection} connection */
const differs = (connection) => ['fetch', 'other'].filter((kind) => rule(connection, kind) !== usual(kind)).map((kind) => t(`connections.${kind === 'fetch' ? 'reads' : 'acts'}.${rule(connection, kind)}`))[0]
/** The user's own, which they may rename, keep to projects and disconnect; the organisation's are set. @param {Connection} connection */
const mine = (connection) => (app.settings.value.connections ?? []).some((one) => one.id === connection.id)
/** When it was made, from its ULID; nothing for an id of another shape (the organisation's). @param {Connection} connection */
const since = ({ id }) => (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id) ? new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long' }).format([...id.slice(0, 10)].reduce((time, c) => time * 32 + ALPHABET.indexOf(c), 0)) : '')

// ─── The list ────────────────────────────────────────────────────────────────

/** What needs the user, on Jean's pale yellow: a sign-in to do again, or a service that didn't answer, with what does it. @param {Connection} connection */
function waiting(connection) {
  const { error, challenge } = status.value[connection.id] ?? {}
  return html`<div class="connection-wait" role="status">${logo(connection)}<p><strong>${t(error === 'auth' ? 'connections.needsYou' : 'connections.notAnswering', { service: called(connection) })}</strong></p>
    <button class="button primary" @click=${() => (error === 'auth' ? signIn(connection, challenge) : list([connection]))}>${t(error === 'auth' ? 'connections.signIn' : 'action.retry')}</button></div>`
}

/** A connection's row: who signed in, the projects it is kept to, when it was last used, and a word on how it stands. @param {Connection} connection */
function row(connection) {
  const { tools, error } = status.value[connection.id] ?? {}
  const kept = placeable(connection) && connection.projects ? app.projects.value.filter((project) => connection.projects?.includes(project.id)).map(projectName) : []
  const last = used.value.get(connection.id)
  const facts = joined([connection.account ?? (logoOf(connection) ? '' : new URL(connection.url).host), kept.length ? products(kept) : '', last && t('connections.used', { when: relativeTime(last) })])
  const word = error ? html`<span class="data-state is-wait">${t(`connections.state.${error}`)}</span>` : differs(connection)
  return html`<li><button class="item" data-page=${connection.id} @click=${() => go(connection.id)}>${logo(connection)}
    <span class="item-text"><strong><bdi>${called(connection)}</bdi></strong><small>${facts.length ? facts : tools ? t('connections.count', { count: tools.length }) : error ? new URL(connection.url).host : '…'}</small></span>
    ${typeof word === 'string' ? html`<span class="data-state">${word}</span>` : word ?? nothing}${mine(connection) ? nothing : html`${icons.lock}<span class="visually-hidden">${lockedBy()}</span>`}${icons.chevron}</button></li>`
}

/** Settings' Connections: what needs the user, else how many, then a row each; with none, the services to connect. */
function listed() {
  const connections = byName(all(), called, locale.value)
  if (!connections.length) return html`${head(t('cap.connections.name'), t('cap.connections.text', { name }))}${finder()}`
  const due = connections.find((connection) => status.value[connection.id]?.error)
  return html`${head(t('cap.connections.name'), '', html`<button class="button" @click=${() => go('add')}>${icons.plus} ${t('cap.connections.yes')}</button>`)}
    ${due ? html`${waiting(due)}${said()}` : html`<p class="lede"><strong>${t('connections.services', { count: connections.length })}</strong> ${t('connections.lede', { name })}</p>`}
    <section><h3>${t('connections.yours')}</h3><ul class="list data-rows">${connections.map(row)}</ul></section>`
}

// ─── A connection's page ─────────────────────────────────────────────────────

/**
 * What Jean may do there, reading and acting, each Do it, Ask me first or Never for this service alone, at the end of its
 * name; never freer than the organisation lets. Its actions under it, the width of the page: up to six in a line; more,
 * as some services have, three of them and how many others, opening to all of them in columns, A to Z (D609). @param {Connection} connection
 */
function may(connection) {
  const tools = status.value[connection.id]?.tools ?? []
  const guarded = [...app.policy.guards ?? [], ...effective.value.settings.guards ?? []].some((guard) => guard.service === connection.id)
  /** @param {'fetch' | 'other'} kind @param {string} label */
  const line = (kind, label) => {
    const [them, set] = [tools.filter((tool) => Boolean(tool.annotations?.readOnlyHint) === (kind === 'fetch')).map((tool) => labelOf(tool).replace(/[.。]$/u, '')), app.policy.rules?.[kind]]
    return tools.length && !them.length ? nothing : html`<li><div class="setting"><span class="rule-kind">${t(label)}</span><span class="segmented" role="radiogroup" aria-label=${t(label)}>${CHOICES.map((choice) => html`<label>
        <input type="radio" name=${`may-${kind}`} .checked=${rule(connection, kind) === choice} ?disabled=${Boolean(set) && STRICT[choice] < STRICT[/** @type {RuleValue} */ (set)]}
          @change=${() => choose(connection.id, kind, choice === usual(kind) ? undefined : choice)}><span>${t(`rules.${choice}`)}</span></label>`)}</span></div>${them.length <= 6 ? (them.length ? html`<p class="muted small">${joined(them)}</p>` : nothing)
      : html`<details class="read-list connection-actions"><summary><span>${listOf([...them.slice(0, 3), t('connections.more', { count: them.length - 3 })])}</span><span>${t('connections.count', { count: them.length })}</span>${icons.chevron}</summary><ul>${byName(them, String, locale.value).map((one) => html`<li><bdi>${one}</bdi></li>`)}</ul></details>`}</li>`
  }
  return html`<section><h3>${t('connections.may', { name, service: called(connection) })}</h3>
    <ul class="rules connection-kinds">${line('fetch', 'connections.read')}${line('other', 'connections.act')}</ul>
    <p class="hint">${t('connections.usual', { name })}</p>
    ${guarded ? html`<p class="hint">${t('connections.guarded', { service: called(connection) })}</p>` : nothing}
    ${limited(connection) ? html`<p class="hint connection-trains">${icons.shield} ${t('connections.trains', { service: called(connection) })}</p>` : nothing}</section>`
}

/** A connection's page: how it stands, what Jean may do there, then the connection itself. @param {Connection} connection */
function page(connection) {
  const [last, tools, own] = [used.value.get(connection.id), status.value[connection.id]?.tools, mine(connection)]
  return html`${back('', t('cap.connections.name'))}
    ${head(called(connection), joined([connection.account, tools && t('connections.count', { count: tools.length }), last && t('connections.used', { when: relativeTime(last) })]), nothing, logo(connection))}
    ${status.value[connection.id]?.error ? waiting(connection) : nothing}${said()}
    ${may(connection)}
    <section><h3>${t('connections.this')}</h3><ul class="rules">
      <li class="setting"><div><span class="rule-kind">${t('connections.account')}</span><p class="muted small">${joined([connection.account ?? (!since(connection) && new URL(connection.url).host), since(connection) && t('connections.since', { date: since(connection) })])}</p></div>
        ${connection.auth === 'oauth' ? html`<button class="button subtle" @click=${() => signIn(connection)}>${t('connections.signInAgain')}</button>` : nothing}</li>
      ${own ? html`<li class="setting"><label class="rule-kind" for="connection-name">${t('projects.name')}</label><input id="connection-name" dir="auto" maxlength="40" autocomplete="off" .value=${connection.name}
        @change=${(/** @type {Event} */ e) => {
          const named = /** @type {HTMLInputElement} */ (e.target).value.trim()
          if (named && named !== connection.name) change(connection, { name: named })
        }}></li>` : nothing}
      ${own && placeable(connection) ? html`<li>${where(connection, (projects) => change(connection, { projects }))}</li>` : nothing}
      <li class="setting"><div><span class="rule-kind">${t('connections.address')}</span><p class="muted small"><bdi dir="ltr">${new URL(connection.url).host}</bdi></p></div></li>
    </ul></section>
    ${!own ? html`<p class="hint">${lockedBy()}</p>` : asking.value ? html`<div class="connection-wait" role="group" aria-label=${t('connections.disconnect')}><p>${t('connections.disconnectAsk', { service: called(connection) })}</p>
      <button class="button danger" @click=${async () => { await remove(connection); go('') }}>${t('connections.disconnect')}</button>
      <button class="button subtle" @click=${() => { asking.value = false }}>${t('connections.cancel')}</button></div>`
      : html`<div class="row"><button class="button subtle danger" @click=${() => { asking.value = true }}>${icons.trash} ${t('connections.disconnect')}</button></div>`}`
}

// ─── Connecting one ──────────────────────────────────────────────────────────

/** Tiles that open a service's page, a tick on one connected already (another account is its page's). @param {Listed[]} entries */
const tiles = (entries) => html`<ul class="services">${entries.map((entry) => html`<li><button class="service ${entry.via ? '' : 'is-soon'}" data-page=${`add/${entry.id}`}
  @click=${() => go(entry.via ? `add/${entry.id}` : 'later')}>${monogram(entry)}<span><strong><bdi>${wrapped(entry.name)}</bdi></strong>${entry.includes
    ? html`<small class="includes">${products(entry.includes)}</small>` : !entry.via ? html`<small>${t('connections.later')}</small>` : nothing}</span>${all().some((connection) => connection.url === entry.url)
    ? html`<span class="connection-had">${icons.check}<span class="visually-hidden">${t('connections.yours')}</span></span>` : nothing}</button></li>`)}</ul>`

/** The search, then the services Jean reaches by what they are for, or what is found; then those not yet, and any other by its address. */
function finder() {
  const words = query.value.trim().toLocaleLowerCase(locale.value)
  const [known, later] = [services().filter((entry) => entry.via), services().filter((entry) => !entry.via)]
  const found = words ? services().filter((entry) => [entry.name, ...entry.includes ?? []].some((one) => one.toLocaleLowerCase(locale.value).includes(words))) : null
  return html`<input type="search" class="connection-find" dir="auto" .value=${query.value} placeholder=${t('connections.find')} aria-label=${t('connections.find')}
      @input=${(/** @type {Event} */ e) => { query.value = /** @type {HTMLInputElement} */ (e.target).value }}>
    ${found ? html`<section><h3>${t('connections.found', { count: found.length })}</h3>${found.length ? tiles(found) : html`<p class="muted small">${t('find.none', { query: query.value.trim() })}</p>`}</section>`
      : GROUPS.map((group) => [group, known.filter((entry) => groupOf(entry) === group)]).filter(([, entries]) => entries.length).map(([group, entries]) => html`<section>
        <h3>${t(`connections.group.${group}`)}</h3>${tiles(/** @type {Listed[]} */ (entries))}</section>`)}
    <ul class="list data-rows">${later.length || gatewayAt.value ? html`<li><button class="item" data-page="later" @click=${() => go('later')}><span class="item-icon">${icons.cloud}</span>
        <span class="item-text"><strong>${later.length ? t('connections.laterCount', { count: later.length }) : t('gateway.title')}</strong><small dir="auto">${later.length ? t('connections.laterText') : gatewayAt.value}</small></span>${icons.chevron}</button></li>` : nothing}
      <li><button class="item" data-page="address" @click=${() => go('address')}><span class="item-icon">${icons.globe}</span>
        <span class="item-text"><strong>${t('connections.other')}</strong><small>${t('connections.otherText', { name })}</small></span>${icons.chevron}</button></li></ul>`
}

/** A service before it connects: what it brings, what Jean may do there as things stand, how it signs in. @param {Listed} entry */
function service(entry) {
  const again = all().some((connection) => connection.url === entry.url)
  /** @param {string} kind @param {string} label */
  const line = (kind, label) => html`<li class="setting"><span class="rule-kind">${t(label)}</span><span class="data-state">${t(`rules.${usual(kind)}`)}</span></li>`
  return html`${back('add', t('cap.connections.yes'))}
    ${head(entry.name, entry.includes ? products(entry.includes) : t(`connections.group.${groupOf(entry)}`), nothing, monogram(entry, 'item-icon'))}
    <section><h3>${t('connections.can', { name })}</h3><ul class="rules">${line('fetch', 'connections.read')}${line('other', 'connections.act')}</ul></section>
    <section><h3>${t('connections.how')}</h3><p>${t('connections.signInThere', { service: entry.name, name })}</p><p class="muted">${t('connections.sealed')}</p>
      ${again ? html`<p class="hint">${t('connections.another', { service: entry.name })}</p>` : nothing}</section>
    ${said()}
    <div class="row"><button class="button primary" ?disabled=${message.value?.kind === 'busy'} @click=${() => connectTo(String(entry.url), entry.name, { gateway: entry.via === 'gateway' })}>${t('connections.connectTo', { service: entry.name })}</button></div>`
}

/** What a browser can't reach yet, and the gateway that reaches it, unless the organisation set it (D191); the gateway alone once it reaches all. */
function later() {
  const set = app.policy.urls?.gateway !== undefined
  const soon = services().filter((entry) => !entry.via)
  return html`${back('add', t('cap.connections.yes'))}${head(t(soon.length ? 'connections.later' : 'gateway.title'), t('gateway.text', { name }))}
    <label class="connection-gateway">${t('gateway.title')}<input dir="ltr" type="url" spellcheck="false" autocomplete="off" placeholder="https://…" .value=${gatewayAt.value} ?disabled=${set}
      @change=${(/** @type {Event} */ e) => {
        const { gateway: _, ...urls } = app.settings.value.urls ?? {}
        const address = /** @type {HTMLInputElement} */ (e.target).value.trim()
        updateSettings({ urls: address ? { ...urls, gateway: address } : urls })
      }}></label>
    ${set ? html`<p class="hint">${lockedBy()}</p>` : nothing}
    <ul class="services">${soon.map((entry) => html`<li><span class="service is-soon">${monogram(entry)}<span><strong><bdi>${wrapped(entry.name)}</bdi></strong>${entry.includes
      ? html`<small class="includes">${products(entry.includes)}</small>` : nothing}</span></span></li>`)}</ul>`
}

/** @param {SubmitEvent} event */
async function add(event) {
  event.preventDefault()
  const { url, key, name: named } = Object.fromEntries([...new FormData(/** @type {HTMLFormElement} */ (event.target))].map(([field, value]) => [field, String(value).trim()]))
  await connectTo(url, named || nameFor(url), { key })
}

/** Any other service, by its address, with a key if it gave one. */
const address = () => html`${back('add', t('cap.connections.yes'))}${head(t('connections.other'), t('connections.otherText', { name }))}
  <form id="connection-add" class="stack" @submit=${add}>
    <label>${t('connections.address')}<input name="url" type="url" required dir="ltr" placeholder="https://…" autocomplete="off"></label>
    <label>${t('projects.name')}<input name="name" maxlength="40" dir="auto" autocomplete="off"></label>
    <label>${t('brain.key.label')}<input name="key" type="password" autocomplete="off" spellcheck="false" dir="ltr"></label>
    <p class="hint">${t('connections.keyHint')}</p>
    ${said()}
    <div class="row"><button class="button primary" ?disabled=${message.value?.kind === 'busy'}>${t('brain.connect')}</button></div>
  </form>`

/** Settings' Connections: the list, or the page open. */
export function section() {
  const open = pageOpen()
  const connection = all().find((one) => one.id === open)
  const entry = open.startsWith('add/') && services().find((one) => one.id === open.slice(4) && one.via)
  return connection ? page(connection) : entry ? service(entry) : open === 'add' ? html`${back('', t('cap.connections.name'))}${head(t('cap.connections.yes'))}${finder()}`
    : open === 'later' ? later() : open === 'address' ? address() : listed()
}

// Read again as the section is entered, or a task ends, which may have used one; kept last, as it runs on import.
effect(() => {
  void app.conversations.value
  if (app.dialog.value === 'settings' && sectionOpen() === 'connections') count().catch((error) => console.warn('Connections', error))
})
