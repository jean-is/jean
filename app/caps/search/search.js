// Web search (docs/product.md): Jean looks things up when a question needs facts the
// conversation doesn't hold. Where the brain's provider searches itself (Anthropic, OpenRouter),
// its adapter declares the provider's own tool in place of this one (`native`); everywhere else,
// on the device too, Jean searches Wikipedia, which answers browsers directly, in the user's
// language. Every result is a numbered source the answer cites. No Jean server (D23).
import { register } from '../../ui/caps.js'
import { app } from '../../ui/state.js'
import { serviceURL } from '../../core/settings.js'
import { locale } from '../../core/i18n.js'

/** @type {import('../../core/loop.js').Tool} */
const searchTool = {
  spec: {
    name: 'web_search',
    description: 'Search the web (Wikipedia, in any language) for facts the conversation does not hold. Results are numbered sources to cite.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, language: { type: 'string', description: 'A Wikipedia language code, e.g. "fr". Default: the user’s.' } },
      required: ['query'],
    },
    native: 'web_search',
  },
  kind: 'search',
  title: (args) => `Search the web: ${args?.query ?? ''}`,
  run: async (args, ctx) => {
    const query = String(args?.query ?? '').trim()
    if (!query) throw new Error('Say what to search for.')
    const lang = String(args?.language || locale.value).split('-')[0].toLowerCase().replace(/[^a-z]/g, '') || 'en'
    const url = new URL(serviceURL('wikipedia', app.settings.value, app.policy).replace('{lang}', lang))
    const params = { action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: query, gsrlimit: '5', prop: 'extracts|info', exintro: '1', explaintext: '1', exlimit: '5', exchars: '1200', inprop: 'url' }
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
    const response = await fetch(url, { signal: ctx.signal })
    if (!response.ok) throw new Error(`The search answered ${response.status}.`)
    /** @type {{ index: number, title: string, fullurl: string, extract?: string }[]} */
    const pages = ((await response.json())?.query?.pages ?? []).sort((/** @type {any} */ a, /** @type {any} */ b) => a.index - b.index)
    if (!pages.length) return 'Nothing found. Try other words, or another language.'
    const numbers = ctx.cite(pages.map((page) => ({ title: page.title, url: page.fullurl, quote: page.extract?.slice(0, 150) })))
    return pages.map((page, i) => `Source [${numbers[i]}]: ${page.title} (${page.fullurl})\n${page.extract ?? ''}`).join('\n\n')
  },
}

register({
  id: 'search',
  tools: [searchTool],
  lines: [{ name: 'web_search', line: 'search the web for facts the conversation does not hold' }],
})
