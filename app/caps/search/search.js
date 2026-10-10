// Web search (docs/product.md): Jean looks things up when a question needs facts the
// conversation doesn't hold. Where the brain's provider searches itself (Anthropic, OpenRouter),
// its adapter declares the provider's own tool in place of this one (`native`); everywhere else,
// on the device too, Jean searches Wikipedia, which answers browsers directly, in the user's
// language. A Kiwix server named in Wikipedia's place is searched by every brain (D254). Every
// result is a numbered source the answer cites. No Jean server (D23). Settings has a section for
// it, where the user chooses between the web and a Kiwix server, whose books it lists.
import { html, nothing } from 'lit-html'
import { signal, computed, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, updateSettings } from '../../ui/state.js'
import { serviceURL } from '../../core/settings.js'
import { t, locale, useStrings, languageName } from '../../core/i18n.js'
import { BRAND } from '../../brand.js'
import { isKiwix, library, rootOf, searchKiwix } from './kiwix.js'

/** @import { Page, Book } from './kiwix.js' */

await useStrings('search')

/** What the brain reads back: each page a numbered source. @param {Page[]} pages @param {import('../../core/loop.js').ToolContext} ctx */
function sources(pages, ctx) {
  const numbers = ctx.cite(pages.map((page) => ({ title: page.title, url: page.url, quote: page.extract.slice(0, 150) })))
  return pages.map((page, i) => `Source [${numbers[i]}]: ${page.title} (${page.url})\n${page.extract}`).join('\n\n')
}

/** Wikipedia's search, its pages' introductions with them. @param {string} address @param {string} query @param {string} lang @param {AbortSignal} [signal] @returns {Promise<Page[]>} */
async function searchWikipedia(address, query, lang, signal) {
  const url = new URL(address.replace('{lang}', lang))
  const params = { action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: query, gsrlimit: '5', prop: 'extracts|info', exintro: '1', explaintext: '1', exlimit: '5', exchars: '1200', inprop: 'url' }
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`The search answered ${response.status}.`)
  /** @type {{ index: number, title: string, fullurl: string, extract?: string }[]} */
  const pages = ((await response.json())?.query?.pages ?? []).sort((/** @type {any} */ a, /** @type {any} */ b) => a.index - b.index)
  return pages.map((page) => ({ title: page.title, url: page.fullurl, extract: page.extract ?? '' }))
}

/** Where web search reads: Wikipedia's API, or a Kiwix server's address. */
const address = computed(() => serviceURL('wikipedia', app.settings.value, app.policy))
const kiwix = computed(() => isKiwix(address.value))

/** @param {boolean} library a Kiwix server, which the brain's own search would leave aside @returns {import('../../core/loop.js').Tool} */
const searchTool = (library) => ({
  spec: {
    name: 'web_search',
    description: library ? 'Search the offline library (Wikipedia and other books, by language) for facts the conversation does not hold. Results are numbered sources to cite.'
      : 'Search the web (Wikipedia, in any language) for facts the conversation does not hold. Results are numbered sources to cite.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, language: { type: 'string', description: 'A Wikipedia language code, e.g. "fr". Default: the user’s.' } },
      required: ['query'],
    },
    ...(!library && { native: /** @type {const} */ ('web_search') }),
  },
  kind: 'search',
  title: (args) => `Search the web: ${args?.query ?? ''}`,
  run: async (args, ctx) => {
    const query = String(args?.query ?? '').trim()
    if (!query) throw new Error('Say what to search for.')
    const lang = String(args?.language || locale.value).split('-')[0].toLowerCase().replace(/[^a-z]/g, '') || 'en'
    if (!isKiwix(address.peek())) {
      const pages = await searchWikipedia(address.peek(), query, lang, ctx.signal)
      return pages.length ? sources(pages, ctx) : 'Nothing found. Try other words, or another language.'
    }
    const { pages, languages } = await searchKiwix(address.peek(), query, lang, { signal: ctx.signal })
    if (pages.length) return sources(pages, ctx)
    return languages.length < 2 || languages.includes(lang) ? 'Nothing found. Try other words.'
      : `The library has no books in "${lang}". Search again with one of its languages: ${languages.join(', ')}.`
  },
})

effect(() => register({
  id: 'search',
  tools: [searchTool(kiwix.value)],
  lines: [{ name: 'web_search', line: 'search the web for facts the conversation does not hold' }],
  panel,
}))

// ─── Settings › Web search ───────────────────────────────────────────────────

/** The library at the address saved: its books, or that it didn't answer. */
const shelf = signal(/** @type {{ address: string, books?: Book[], failed?: boolean } | null} */ (null))
/** The library chosen before an address is saved for it; an address being tried, and why it failed. */
const choosing = signal(false)
const trying = signal(false)
const failure = signal(/** @type {'failed' | 'insecure' | null} */ (null))

/** A page served over HTTPS reaches plain HTTP only on this computer. @param {string} url */
const insecure = (url) => location.protocol === 'https:' && /^http:\/\/(?!(localhost|127\.0\.0\.1|\[::1\])(:|\/|$))/i.test(url)

/** Web search reads there from now on: a Kiwix server, or Wikipedia again when ''. @param {string} url */
function setAddress(url) {
  const { wikipedia: _, ...urls } = app.settings.value.urls ?? {}
  return updateSettings({ urls: url ? { ...urls, wikipedia: url } : urls })
}

/** Reads the books of the library saved; an answer for an address since changed is dropped. @param {string} url */
function look(url) {
  shelf.value = { address: url }
  library(url).then((books) => ({ books }), (error) => {
    console.warn(url, error)
    return { failed: true }
  }).then((found) => {
    if (shelf.peek()?.address === url) shelf.value = { address: url, ...found }
  })
}

/** Saves an address once a Kiwix server answers there, as its root. @param {SubmitEvent} event */
async function connect(event) {
  event.preventDefault()
  const typed = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('address') ?? '').trim()
  ;[trying.value, failure.value] = [true, null]
  try {
    const books = await library(typed)
    const url = rootOf(typed).href
    shelf.value = { address: url, books }
    choosing.value = false
    await setAddress(url)
  } catch (error) {
    console.warn(typed, error)
    failure.value = insecure(typed) ? 'insecure' : 'failed'
  }
  trying.value = false
}

/** Where to look: a card each, the web or a library. @param {'web' | 'library'} id @param {boolean} chosen @param {boolean} locked @param {() => void} choose */
const option = (id, chosen, locked, choose) => html`<label class="choice-option">
  <input type="radio" name="search-where" .checked=${chosen} ?disabled=${locked} @change=${choose}>
  <span><strong>${t(`search.${id}`)}</strong><small class="muted">${t(`search.${id}.text`)}</small></span>
</label>`

/** A book: its title, its languages and how many articles it holds. @param {Book} book */
const bookRow = (book) => html`<li><span class="item-text"><strong><bdi>${book.title}</bdi></strong>
  <small>${new Intl.ListFormat(locale.value, { type: 'unit' }).format(book.languages.map((code) => languageName(code, locale.value)))} · ${t('search.articles', { count: book.articles })}</small></span></li>`

/**
 * Settings › Web search: where to look, the web or a library (D254); a library's address, and
 * once one answers there, its books. The organisation may have chosen.
 */
function panel() {
  const locked = app.policy.urls?.wikipedia !== undefined
  const saved = kiwix.value ? address.value : ''
  if (saved && shelf.value?.address !== saved) look(saved)
  const books = saved ? shelf.value?.books : undefined
  const reason = failure.value ?? (saved && shelf.value?.failed ? 'failed' : null)
  return html`<p class="lede">${t('search.text', { name: BRAND.name })}</p>
    <section class="stack">
      <h3>${t('search.where')}</h3>
      ${option('web', !saved && !choosing.value, locked, () => { [choosing.value, failure.value] = [false, null]; if (saved) setAddress('') })}
      ${option('library', Boolean(saved) || choosing.value, locked, () => { choosing.value = true })}
      ${locked ? html`<p class="muted">${t('search.locked')}</p>` : nothing}
    </section>
    ${saved || choosing.value ? html`<section class="stack">
      <form class="stack" @submit=${connect}>
        <label>${t('search.address')}<input name="address" type="url" required dir="ltr" placeholder="http://localhost:8080" autocomplete="off" spellcheck="false"
          .value=${saved} ?disabled=${locked}></label>
        ${locked ? nothing : html`<div class="row"><button class="button primary" ?disabled=${trying.value}>${t('search.connect')}</button></div>`}
      </form>
      ${reason ? html`<p class="status is-error" role="status">${t(`search.${reason}`)}${!failure.value
        ? html` <button class="button subtle" @click=${() => look(saved)}>${t('action.retry')}</button>` : nothing}</p>` : nothing}
      ${books ? html`<p class="library"><span class="dot"></span>${t('search.books', { count: books.length })}</p>
        <ul class="list">${books.map(bookRow)}</ul>` : nothing}
    </section>` : nothing}`
}
