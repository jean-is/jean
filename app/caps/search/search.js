// Web search (docs/product.md): Jean looks things up when a question needs facts the
// conversation doesn't hold, in the sources built into it that are on (D271): Wikipedia, on unless
// turned off, which answers browsers directly, in the user's language; Vikidia, the encyclopedia
// for 8 to 13 year olds; a Kiwix server's books, the offline library, which can stand for
// Wikipedia too (D254). Where the brain's provider searches itself (Anthropic, OpenRouter), its
// adapter declares the provider's own tool in place of this one (`native`) while Wikipedia from
// the web is all there is to search; another source on is searched by every brain. Every result
// is a numbered source the answer cites. No Jean server (D23). Settings has a section for it: a
// switch for each source, a Kiwix server's address and its books, then the connections that
// search the web too, as the capabilities that hold them say, and those Jean knows, a click away.
// + in the box has a switch for it (D304): off, a task started meanwhile has no web search, the
// brain's own included, and one that had it is told, its tools unchanged (D46), and refused.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { register, loaded, unlock, isDenied } from '../../ui/caps.js'
import { icons } from '../../ui/menu-icons.js'
import { app, effective, updateSettings } from '../../ui/state.js'
import { serviceURL } from '../../core/settings.js'
import { t, locale, intlLocales, useStrings, languageName } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { isKiwix, library, rootOf } from './kiwix.js'
import { SOURCES, VIKIDIA, OWN_TAB, onSite, searchSources } from './sources.js'
import { known, searchers, logoAt } from '../connections/directory.js'

/** @import { Page, Book } from './kiwix.js' */
/** @import { Source, SourceId } from './sources.js' */

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
/** The source whose address is being tried, and the one whose address failed, with why. */
const trying = signal('')
const failure = signal(/** @type {{ id: SourceId, reason: 'failed' | 'insecure' } | null} */ (null))

/**
 * Plain HTTP away from this computer, which Jean's policy never reaches: an address the policy ui/app.js
 * narrows it with leaves out (localhost, 127.0.0.1 and, in the desktop app, the computer's own, D260). @param {string} url
 */
const insecure = (url) => URL.canParse(url) && new URL(url).protocol === 'http:'
  && !document.querySelector('meta[content^="connect-src"]')?.getAttribute('content')?.includes(` http://${new URL(url).hostname}:*`)

/** Turns a source on or off. @param {SourceId} id @param {boolean} value */
const turn = (id, value) => updateSettings({ searches: [...on.peek().filter((other) => other !== id), ...(value ? [id] : [])] })

/** A source reads at a Kiwix server from now on, or at its own address again when ''. @param {SourceId} id @param {string} url */
function setAddress(id, url) {
  const { [id]: _, ...urls } = app.settings.value.urls ?? {}
  return updateSettings({ urls: url ? { ...urls, [id]: url } : urls })
}

/** Reads the books at an address. @param {string} url */
function look(url) {
  shelves.value = { ...shelves.peek(), [url]: {} }
  library(url).then((books) => ({ books }), (error) => {
    console.warn(url, error)
    return { failed: true }
  }).then((found) => { shelves.value = { ...shelves.peek(), [url]: found } })
}

/** Saves a source's address once a Kiwix server answers there, as its root; one Jean's policy blocks isn't tried. @param {SourceId} id @param {SubmitEvent} event */
async function connect(id, event) {
  event.preventDefault()
  const typed = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('address') ?? '').trim()
  if (insecure(typed)) {
    failure.value = { id, reason: 'insecure' }
    return
  }
  ;[trying.value, failure.value] = [id, null]
  try {
    const books = await library(typed)
    const url = rootOf(typed).href
    shelves.value = { ...shelves.peek(), [url]: { books } }
    await setAddress(id, url)
  } catch (error) {
    console.warn(typed, error)
    failure.value = { id, reason: 'failed' }
  }
  trying.value = ''
}

/** A book: its title, its languages and how many articles it holds. @param {Book} book */
const bookRow = (book) => html`<li><span class="item-text"><strong><bdi>${book.title}</bdi></strong>
  <small>${new Intl.ListFormat(intlLocales(), { type: 'unit' }).format(book.languages.map((code) => languageName(code, locale.value)))} · ${t('search.articles', { count: book.articles })}</small></span></li>`

/**
 * A source's Kiwix server: its address, tried before it is kept, and once one answers there, its
 * books (Wikipedia's alone, for Wikipedia). The organisation may have set it. @param {SourceId} id
 */
function kiwixForm(id) {
  const locked = app.policy.urls?.[id] !== undefined
  const address = serviceURL(id, app.settings.value, app.policy)
  const saved = address && isKiwix(address) ? address : ''
  if (saved && !shelves.value[saved]) look(saved)
  const shelf = saved ? shelves.value[saved] : undefined
  const books = shelf?.books?.filter((book) => id === 'kiwix' || book.category === id)
  const reason = failure.value?.id === id ? failure.value.reason : shelf?.failed ? (insecure(saved) ? 'insecure' : 'failed') : null
  return html`<form class="stack" @submit=${(/** @type {SubmitEvent} */ e) => connect(id, e)}>
      <label>${t('search.address')}<input name="address" type="url" required dir="ltr" placeholder="http://localhost:8080" autocomplete="off" spellcheck="false"
        .value=${saved} ?disabled=${locked}></label>
      ${locked ? html`<p class="muted">${t(app.policy.child ? 'search.parent' : 'search.locked')}</p>` : html`<div class="row"><button class="button primary" ?disabled=${trying.value === id}>${t('search.connect')}</button>${id === 'wikipedia' && saved
        ? html`<button type="button" class="button subtle" @click=${() => setAddress(id, '')}>${t('action.remove')}</button>` : nothing}</div>`}
    </form>
    ${reason ? html`<p class="status is-error" role="status">${t(`search.${reason}`)}${failure.value?.id !== id
      ? html` <button class="button subtle" @click=${() => look(saved)}>${t('action.retry')}</button>` : nothing}</p>` : nothing}
    ${books ? html`<p class="library"><span class="dot"></span>${t('search.books', { count: books.length })}</p>
      <ul class="list">${books.map(bookRow)}</ul>` : nothing}`
}

/** A service's logo, or its first letter. @param {string} name @param {string} [logo] its address */
const mark = (name, logo) => (logo ? html`<img class="item-icon is-logo" src=${logo} alt="">` : html`<span class="item-icon" aria-hidden="true">${[...name][0]}</span>`)

/** A source built into Jean: what it is, and its switch. @param {SourceId} id @param {boolean} locked */
function sourceRow(id, locked) {
  const name = t(id === 'kiwix' ? 'search.library' : `search.${id}`)
  // Its languages, those the browser has no name for left out (Sicilian, in most).
  const languages = VIKIDIA.map((code) => languageName(code, locale.value)).filter((name, i) => name.toLowerCase() !== VIKIDIA[i])
  const text = id === 'vikidia' ? t('search.vikidia.text', { languages: new Intl.ListFormat(intlLocales()).format(languages) })
    : t(id === 'kiwix' ? 'search.library.text' : 'search.wikipedia.text')
  return html`<li><span class="item">${mark(id === 'kiwix' ? 'Kiwix' : name)}<span class="item-text"><strong><bdi>${name}</bdi></strong><small>${text}</small></span></span>
    <input type="checkbox" class="switch" role="switch" aria-label=${name} .checked=${on.value.includes(id)} ?disabled=${locked}
      @change=${(/** @type {Event} */ e) => turn(id, /** @type {HTMLInputElement} */ (e.target).checked)}></li>`
}

/** A service that searches the web too: its logo's address, its name and its tools' labels. @param {{ name: string, logo?: string, tools: string[] }} service */
const serviceRow = ({ name, logo, tools }) => html`<li><span class="item">${mark(name, logo)}<span class="item-text"><strong><bdi>${name}</bdi></strong>
  <small>${new Intl.ListFormat(intlLocales(), { type: 'unit' }).format(tools)}</small></span></span></li>`

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

/** A service Jean knows that would search the web, a click away. @param {import('../connections/directory.js').Listed} entry */
const offerRow = (entry) => html`<li><span class="item">${mark(entry.name, entry.logo && logoAt(entry.logo))}<span class="item-text"><strong><bdi>${entry.name}</bdi></strong></span></span>
  <button class="button" aria-label=${t('search.connectTo', { service: entry.name })} ?disabled=${joining.value} @click=${() => join(entry)}>${t('search.connect')}</button></li>`

/**
 * Settings › Web search (D271): where to look, the sources built into Jean, each with its switch,
 * then the connections that search the web, which the brain can use as well, and those Jean knows,
 * a click away. Once on, the library asks for its Kiwix server; Wikipedia may be read from one
 * (D254). The organisation may have chosen.
 */
function panel() {
  const locked = app.policy.searches !== undefined
  const offers = isDenied('connections') ? [] : searchers(known(app.policy), [...(app.policy.connections ?? []), ...(effective.value.settings.connections ?? [])])
  return html`<p class="lede">${t('search.text', { name: BRAND.name })}</p>
    <section class="stack">
      <h3>${t('search.where')}</h3>
      <ul class="list">${SOURCES.map((id) => sourceRow(id, locked))}${searches().map(serviceRow)}${offers.map(offerRow)}</ul>
      ${locked ? html`<p class="muted">${t(app.policy.child ? 'search.parent' : 'search.locked')}</p>` : nothing}
    </section>
    ${on.value.includes('kiwix') ? html`<section class="stack">${kiwixForm('kiwix')}</section>` : nothing}
    ${on.value.includes('wikipedia') ? html`<details class="other" ?open=${isKiwix(serviceURL('wikipedia', app.settings.value, app.policy))}>
      <summary>${t('search.fromKiwix')}</summary>
      <div class="stack">${kiwixForm('wikipedia')}</div>
    </details>` : nothing}`
}
