// Web search (docs/product.md): Jean looks things up when a question needs facts the
// conversation doesn't hold, in the sources built into it that are on (D271): Wikipedia, on unless
// turned off, which answers browsers directly, in the user's language; Vikidia, the encyclopedia
// for 8 to 13 year olds; a Kiwix server's books, the offline library, which can stand for
// Wikipedia too (D254). Where the brain's provider searches itself (Anthropic, OpenRouter), its
// adapter declares the provider's own tool in place of this one (`native`) while Wikipedia from
// the web is all there is to search; another source on is searched by every brain. Every result
// is a numbered source the answer cites. No Jean server (D23). Settings has a section for it (D531):
// who searches where, a switch for each source, the offline library's page with its Kiwix server's
// address and its books, then the connections that search the web too, as the capabilities that
// hold them say, and those Jean knows, a click away.
// + in the box has a switch for it (D304): off, a task started meanwhile has no web search, the
// brain's own included, and one that had it is told, its tools unchanged (D46), and refused.
import { html, svg, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { register, loaded, unlock, isDenied } from '../../ui/caps.js'
import { icons, icon } from '../../ui/menu-icons.js'
import { app, effective, updateSettings, activeBrain, brainsHere, cloudAllowed } from '../../ui/state.js'
import { serviceURL, isLocal } from '../../core/settings.js'
import { t, locale, intlLocales, useStrings, languageName } from '../../core/i18n.js'
import { isKiwix, library, rootOf } from './kiwix.js'
import { SOURCES, VIKIDIA, OWN_TAB, onSite, searchSources } from './sources.js'
import { known, searchers, logoAt } from '../connections/directory.js'

/** @import { Page, Book } from './kiwix.js' */
/** @import { Source, SourceId } from './sources.js' */
/** @typedef {import('../../core/types.js').BrainConfig} BrainConfig */

await useStrings('search')

/** What the brain reads back: each page a numbered source, with its picture's address. @param {Page[]} pages @param {import('../../core/loop.js').ToolContext} ctx */
function numbered(pages, ctx) {
  const numbers = ctx.cite(pages.map((page) => ({ title: page.title, url: page.url, quote: page.extract.slice(0, 150), picture: page.picture })))
  return pages.map((page, i) => `Source [${numbers[i]}]: ${page.title} (${page.url})\n${page.picture ? `Picture: ${page.picture}\n` : ''}${page.extract}`).join('\n\n')
}

/** The sources on: the organisation's, else the user's, else Wikipedia alone. */
const on = computed(() => /** @type {SourceId[]} */ (app.policy.searches ?? app.settings.value.searches ?? ['wikipedia']))
/** Each source on, at its address: the library only once it has one. */
const reading = computed(() => SOURCES.filter((id) => on.value.includes(id)).map((id) => ({ id, address: serviceURL(id, app.settings.value, app.policy) })).filter((source) => source.address))

/** Whether the user turned web search off, from + in the box (D304). */
const off = computed(() => app.settings.value.search === false)

/** How the brain hears of each source. */
const NAMED = { wikipedia: 'the web (Wikipedia, in any language)', vikidia: 'Vikidia (the encyclopedia for children)', kiwix: 'the offline library (Wikipedia and other books)' }

/** @param {Source[]} sources @returns {import('../../core/loop.js').Tool} */
function searchTool(sources) {
  const names = sources.map(({ id, address }) => (id === 'wikipedia' && isKiwix(address) ? 'Wikipedia (offline)' : NAMED[id]))
  return {
    spec: {
      name: 'web_search',
      description: `Search ${names.length ? new Intl.ListFormat('en').format(names) : NAMED.wikipedia} for facts the conversation does not hold. Results are numbered sources to cite.`,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, language: { type: 'string', description: 'A language code, e.g. "fr". Default: the user’s.' } },
        required: ['query'],
      },
      // The brain's own search, while Wikipedia from the web is all there is (or nothing is on).
      ...(sources.every(({ id, address }) => id === 'wikipedia' && !isKiwix(address)) && { native: /** @type {const} */ ('web_search') }),
    },
    kind: 'search',
    title: (args) => `Search the web: ${args?.query ?? ''}`,
    run: async (args, ctx) => {
      const query = String(args?.query ?? '').trim()
      if (!query) throw new Error('Say what to search for.')
      if (!reading.peek().length) return 'Web search has no source on. The user can turn Wikipedia or another one on in Settings › Web search.'
      const lang = String(args?.language || locale.value).split('-')[0].toLowerCase().replace(/[^a-z]/g, '') || 'en'
      const { pages, notes } = await searchSources(reading.peek(), query, lang, { signal: ctx.signal })
      return [pages.length ? numbered(pages, ctx) : 'Nothing found. Try other words, or another language.', ...notes].join('\n\n')
    },
  }
}

/** Its row in + (D304): a switch, which leaves the menu open, as Keep on this device does. */
const row = () => html`<button type="button" role="switch" aria-checked=${off.value ? 'false' : 'true'}
  @click=${() => updateSettings({ search: off.peek() })}>${icons.websearch}<span>${t('cap.search.name')}</span></button>`

effect(() => register({
  id: 'search',
  tools: [{ ...searchTool(reading.value), off: off.value }],
  lines: off.value ? [] : [{ name: 'web_search', line: 'search the web for facts the conversation does not hold' }],
  // Vikidia's pages refuse to show beside the conversation: the browser opens them in a tab at once.
  ownTab: (url) => OWN_TAB.some((id) => onSite(serviceURL(id, app.settings.peek(), app.policy), url)),
  slots: {
    settings: { at: 90, id: 'search', label: 'cap.search.name', icon: icons.websearch, draw: panel, also: () => 'Kiwix Wikipedia Vikidia' },
    add: { at: 7, draw: row },
  },
}))

// ─── Settings › Web search ───────────────────────────────────────────────────

/** The books at each Kiwix address read, or that it didn't answer. */
const shelves = signal(/** @type {Record<string, { books?: Book[], failed?: boolean }>} */ ({}))
/** Whether the library's address is being tried, and why the one typed failed. */
const trying = signal(false)
const failure = signal(/** @type {'failed' | 'insecure' | null} */ (null))
/** A shelf of books: the offline library's mark. */
const bookshelf = icon(svg`<path d="M5.5 4.5v15M9.5 4.5v15M13.2 5.3l3.6 13.9M3.5 19.5h17"/>`)
/** Names as a list, in the user's language. @param {string[]} names */
const listed = (names) => new Intl.ListFormat(intlLocales()).format(names)

/**
 * Plain HTTP away from this computer, which Jean's policy never reaches: an address the policy ui/app.js
 * narrows it with leaves out (localhost, 127.0.0.1 and, in the desktop app, the computer's own, D260). @param {string} url
 */
const insecure = (url) => URL.canParse(url) && new URL(url).protocol === 'http:'
  && !document.querySelector('meta[content^="connect-src"]')?.getAttribute('content')?.includes(` http://${new URL(url).hostname}:*`)

/** Turns a source on or off. @param {SourceId} id @param {boolean} value */
const turn = (id, value) => updateSettings({ searches: [...on.peek().filter((other) => other !== id), ...(value ? [id] : [])] })

/** Where sources read from now on: a Kiwix server's address each, or their own again when ''; and which are on. @param {Partial<Record<SourceId, string>>} next @param {SourceId[]} [searches] */
function setAddresses(next, searches) {
  const urls = { ...app.settings.value.urls }
  for (const [id, url] of /** @type {[SourceId, string][]} */ (Object.entries(next))) if (url) urls[id] = url; else delete urls[id]
  return updateSettings({ urls, ...(searches && { searches }) })
}

/** Reads the books at an address. @param {string} url */
function look(url) {
  shelves.value = { ...shelves.peek(), [url]: {} }
  library(url).then((books) => ({ books }), (error) => {
    console.warn(url, error)
    return { failed: true }
  }).then((found) => { shelves.value = { ...shelves.peek(), [url]: found } })
}

// Each time Web search is entered, the library is read again: its server may have stopped, or come back.
let inside = false
effect(() => { const here = app.dialog.value === 'settings' && app.section.value.split('/')[0] === 'search'; if (here && !inside) shelves.value = {}; inside = here })

/** The library's address, once a Kiwix server answered there, what it holds or that it doesn't answer, and whether Wikipedia is read there. */
function kept() {
  const address = serviceURL('kiwix', app.settings.value, app.policy)
  const saved = address && isKiwix(address) ? address : ''
  if (saved && !shelves.value[saved]) look(saved)
  return { saved, shelf: saved ? shelves.value[saved] : undefined, wiki: Boolean(saved) && serviceURL('wikipedia', app.settings.value, app.policy) === saved }
}

/** The languages of a source's books at a Kiwix server. @param {string} address @param {SourceId} id */
function languagesAt(address, id) {
  if (!shelves.value[address]) look(address)
  const codes = (shelves.value[address]?.books ?? []).filter((book) => book.category === id).flatMap((book) => book.languages)
  return listed([...new Set(codes)].map((code) => languageName(code, locale.value)))
}

/**
 * Keeps the library's address once a Kiwix server answers there, as its root, and turns the library on; Wikipedia read
 * there moves with it. One Jean's policy blocks isn't tried. @param {SubmitEvent} event
 */
async function connect(event) {
  event.preventDefault()
  const typed = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('address') ?? '').trim()
  failure.value = insecure(typed) ? 'insecure' : null
  if (failure.value) return
  trying.value = true
  try {
    const found = await library(typed)
    const url = rootOf(typed).href
    shelves.value = { ...shelves.peek(), [url]: { books: found } }
    await setAddresses({ kiwix: url, ...(kept().wiki && { wikipedia: url }) }, [...on.peek().filter((id) => id !== 'kiwix'), 'kiwix'])
  } catch (error) {
    console.warn(typed, error)
    failure.value = 'failed'
  }
  trying.value = false
}

/** Forgets the library: its address, Wikipedia's when it is read there, and its switch. */
const forget = () => setAddresses({ kiwix: '', ...(kept().wiki && { wikipedia: '' }) }, on.peek().filter((id) => id !== 'kiwix'))

/** Opens the section ('') or the library's page, the keyboard on its title, or back on the library's row. @param {string} to */
function go(to) {
  failure.value = null
  app.section.value = to ? `search/${to}` : 'search'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '#library-title' : '[data-page="library"]'))?.focus())
}

/** Whether a brain searches the web itself, its provider's own search declared in place of web_search (D91). @param {BrainConfig | null | undefined} brain */
const searchesItself = (brain) => Boolean(brain && !isLocal(brain) && cloudAllowed() && (brain.api === 'anthropic' || brain.provider === 'openrouter'))

/**
 * Who searches where, in whole sentences, for the brains here (D531): the brain that answers (Auto's in the cloud) by
 * itself while Wikipedia from the web is all there is to search, the others in the sources on; or every brain in them;
 * then the connections that search too. Off, that nothing searches.
 */
function where() {
  if (off.value) return [t('search.now.off')]
  const sources = listed(reading.value.map(({ id }) => t(id === 'kiwix' ? 'search.library.in' : `search.${id}`)))
  const brain = effective.value.settings.auto ? [activeBrain.value, ...brainsHere.value].find((one) => one && !isLocal(one)) : activeBrain.value
  const itself = searchesItself(brain) && reading.value.every(({ id, address }) => id === 'wikipedia' && !isKiwix(address))
  const rest = reading.value.length ? t(itself ? 'search.now.others' : 'search.now.every', { sources }) : t('search.now.nowhere')
  const services = searches().map(({ name }) => name)
  return [...(itself ? [t('search.now.own'), ...(brainsHere.value.some((one) => !searchesItself(one)) ? [rest] : [])] : [rest, ...(searchesItself(brain) && !isKiwix(serviceURL('wikipedia', app.settings.value, app.policy)) ? [t('search.now.again')] : [])]),
    ...(services.length ? [t('search.now.services', { services: listed(services) })] : [])]
}

/** A book: its title, its languages and how many articles it holds. @param {Book} book */
const bookRow = (book) => html`<li><span class="item-text"><strong><bdi>${book.title}</bdi></strong>
  <small>${new Intl.ListFormat(intlLocales(), { type: 'unit' }).format(book.languages.map((code) => languageName(code, locale.value)))} · ${t('search.articles', { count: book.articles })}</small></span></li>`

/** A service's logo, or its first letter. @param {string} name @param {string} [logo] its address */
const mark = (name, logo) => (logo ? html`<img class="item-icon is-logo" src=${logo} alt="">` : html`<span class="item-icon" aria-hidden="true">${[...name][0]}</span>`)

/**
 * Wikipedia or Vikidia: in which languages, or from the offline library, and its switch. Vikidia says whether it has the
 * user's language. @param {'wikipedia' | 'vikidia'} id @param {boolean} locked
 */
function sourceRow(id, locked) {
  const [name, address] = [t(`search.${id}`), serviceURL(id, app.settings.value, app.policy)]
  const yours = VIKIDIA.includes(locale.value.split('-')[0])
  const text = isKiwix(address) ? t('search.fromLibrary', { languages: languagesAt(address, id) }) : id === 'wikipedia' ? t('search.wikipedia.text')
    : t(yours ? 'search.vikidia.text' : 'search.vikidia.not', { count: VIKIDIA.length - (yours ? 1 : 0) })
  return html`<li>${mark(name)}<span class="item-text"><strong><bdi>${name}</bdi></strong><small>${text}</small></span>
    <input type="checkbox" class="switch" role="switch" aria-label=${name} .checked=${on.value.includes(id)} ?disabled=${locked}
      @change=${(/** @type {Event} */ e) => turn(id, /** @type {HTMLInputElement} */ (e.target).checked)}></li>`
}

/** The offline library's row, which opens its page: its books and where, or how it stands in a word. */
function libraryRow() {
  const { saved, shelf } = kept()
  const state = !saved ? 'notSet' : !on.value.includes('kiwix') ? 'off' : shelf?.failed ? 'unanswered' : ''
  return html`<li><button class="item" data-page="library" @click=${() => go('library')}><span class="item-icon">${bookshelf}</span>
    <span class="item-text"><strong>${t('search.library')}</strong><small>${shelf?.books ? html`${t('search.books', { count: shelf.books.length })} · <bdi>${new URL(saved).host}</bdi>`
      : t('search.library.row')}</small></span>${state ? html`<span class="data-state ${state === 'unanswered' ? 'is-wait' : ''}">${t(`search.${state}`)}</span>` : nothing}${icons.chevron}</button></li>`
}

/** A connection that searches the web too, which opens Connections: its logo, its name and its tools' labels. @param {{ name: string, logo?: string, tools: string[] }} service */
const serviceRow = ({ name, logo, tools }) => html`<li><button class="item" @click=${() => { app.section.value = 'connections' }}>${mark(name, logo)}<span class="item-text"><strong><bdi>${name}</bdi></strong>
  <small>${new Intl.ListFormat(intlLocales(), { type: 'unit' }).format(tools)}</small></span>${icons.chevron}</button></li>`

/** What else searches the web, as each capability loaded says (a connection's tools, D271). */
const searches = () => [...loaded.value.values()].flatMap((cap) => cap.searches?.() ?? [])

/** The service being connected from here. */
const joining = signal(false)

/** Connects a service Jean knows, Connections turned on for it, as the box's / does (D199). @param {import('../connections/directory.js').Listed} entry */
async function join(entry) {
  joining.value = true
  if (await unlock('connections')) await (await import('../connections/connections.js')).connectService(entry)
  joining.value = false
}

/** A service Jean knows that would search the web, what it does and Connect. @param {import('../connections/directory.js').Listed} entry */
const offerRow = (entry) => html`<li>${mark(entry.name, entry.logo && logoAt(entry.logo))}<span class="item-text"><strong><bdi>${entry.name}</bdi></strong><small>${t('search.searches')}</small></span>
  <button class="button" aria-label=${t('search.connectTo', { service: entry.name })} ?disabled=${joining.value} @click=${() => join(entry)}>${t('search.connect')}</button></li>`

/** Who set the sources, when someone did: the organisation, or a parent. */
const lockedBy = () => html`<p class="muted">${icons.lock} ${t(app.policy.child ? 'search.parent' : 'search.locked')}</p>`

/**
 * Settings › Web search (D271, D531): its title with web search's own switch, the one in + (D304), and who searches
 * where, a sentence a line; Where to look, Wikipedia's and Vikidia's switches and the offline library's row, which opens
 * its page; then the connections that search the web, and those Jean knows, a click away. The organisation, or a
 * parent, may have chosen the sources.
 */
function panel() {
  if (app.section.value === 'search/library') return libraryPage()
  const locked = app.policy.searches !== undefined
  const offers = isDenied('connections') ? [] : searchers(known(app.policy), [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])])
  const services = [...searches().map(serviceRow), ...offers.map(offerRow)]
  return html`<header class="general-head"><div><h2 id="search-title">${t('cap.search.name')}</h2><p class="lede">${where().map((line, i) => html`${i ? html`<br>` : nothing}${line}`)}</p></div>
      <input type="checkbox" class="switch" role="switch" aria-labelledby="search-title" .checked=${!off.value} @change=${() => updateSettings({ search: off.peek() })}></header>
    <section><h3>${t('search.where')}</h3><ul class="list general">${sourceRow('wikipedia', locked)}${sourceRow('vikidia', locked)}${app.policy.child ? nothing : libraryRow()}</ul>
      ${locked ? lockedBy() : nothing}</section>
    ${services.length ? html`<section><h3>${t('search.services')}</h3><ul class="list general">${services}</ul></section>` : nothing}
    <p class="hint">${t('search.also')}</p>`
}

/**
 * The offline library's page (D531): its switch; its Kiwix server's address, tried before it is kept, with the addresses
 * reached from here said before it is; once one answers, its books; and where it holds Wikipedia, reading Wikipedia
 * there rather than from the web. The organisation, or a parent, may have set the address.
 */
function libraryPage() {
  const { saved, shelf, wiki } = kept()
  const fixed = app.policy.urls?.kiwix !== undefined
  const reason = failure.value ?? (shelf?.failed ? (insecure(saved) ? 'insecure' : 'failed') : null)
  const switched = (/** @type {(on: boolean) => unknown} */ set) => (/** @type {Event} */ e) => set(/** @type {HTMLInputElement} */ (e.target).checked)
  return html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('cap.search.name')}</button>
    <header class="general-head"><div><h2 id="library-title" tabindex="-1">${t('search.library')}</h2><p class="lede">${t('search.library.text')}</p></div>
      <input type="checkbox" class="switch" role="switch" aria-labelledby="library-title" .checked=${on.value.includes('kiwix')} ?disabled=${app.policy.searches !== undefined}
        @change=${switched((value) => turn('kiwix', value))}></header>
    <form class="stack" @submit=${connect}>
      <label>${t('search.address')}<input name="address" type="url" required dir="ltr" placeholder="http://localhost:8080" autocomplete="off" spellcheck="false" .value=${saved} ?disabled=${fixed}></label>
      ${fixed ? lockedBy() : html`<div class="row"><button class="button primary" ?disabled=${trying.value}>${t('search.connect')}</button>${saved
        ? html`<button type="button" class="button subtle" @click=${forget}>${t('action.remove')}</button>` : nothing}</div>`}
    </form>
    ${reason ? html`<p class="status is-error" role="status">${t(`search.${reason}`)}${failure.value ? nothing : html` <button class="button subtle" @click=${() => look(saved)}>${t('action.retry')}</button>`}</p>`
      : shelf?.books ? html`<p class="library" role="status"><span class="dot"></span>${t('search.answering')}</p>` : html`<p class="hint">${t('search.insecure')}</p>`}
    ${shelf?.books ? html`<section><h3>${t('search.books', { count: shelf.books.length })}</h3><ul class="list">${shelf.books.map(bookRow)}</ul></section>` : nothing}
    ${shelf?.books?.some((book) => book.category === 'wikipedia') ? html`<ul class="list general"><li>${mark(t('search.wikipedia'))}<span class="item-text"><strong>${t('search.readHere')}</strong>
      <small>${t('search.readHere.text', { languages: languagesAt(saved, 'wikipedia') })}</small></span><input type="checkbox" class="switch" role="switch" aria-label=${t('search.readHere')}
        .checked=${wiki} ?disabled=${app.policy.urls?.wikipedia !== undefined} @change=${switched((value) => setAddresses({ wikipedia: value ? saved : '' }))}></li></ul>` : nothing}`
}
