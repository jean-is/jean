// A Kiwix server's stand-in (D254), answering as libkiwix does under /kiwix/: its catalogue's
// entries (OPDS), its full-text search (OpenSearch RSS, snippets with <b>) and its pages. Two
// French books share a page, as a whole Wikipedia and one of its selections do; a search across
// books in more than one language is refused, as libkiwix refuses it.

/** @typedef {{ title: string, lang: string, articles: number, pages: Record<string, string> }} Book */

/** @type {Record<string, Book>} */
export const BOOKS = {
  'wikipedia_en_100_2026-08': { title: 'Wikipedia 100', lang: 'eng', articles: 5056, pages: {
    Lighthouse: `<h1>Lighthouse</h1><table class="infobox"><tr><td><div class="infobox-caption"><p>Map of the lighthouses in this article</p></div>
      <table><tr><td><p>Heights are in metres.</p></td></tr></table></td></tr><tr><td>Type</td><td>Tower</td></tr></table>
      <p>A <b>lighthouse</b> is a tower designed to emit light from a system of lamps and lenses<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup>, to serve as a navigational aid for maritime pilots at sea.</p>
      <p>Lighthouses mark dangerous coastlines &amp; hazardous shoals.</p><h2>History</h2><p>The Pharos of Alexandria was among the first.</p>`,
    'Phare_du_Créac’h': '<p>The Phare du Créac’h is a lighthouse on the island of Ouessant, one of the most powerful in the world.</p>',
  } },
  'wikipedia_fr_all_mini_2025-10': { title: 'Wikipédia', lang: 'fra', articles: 2687612, pages: { Phare: '<p>Un <a href="Tour">phare</a> est une tour munie d’une source lumineuse, qui guide les navires.</p>' } },
  'wikipedia_fr_top_mini_2025-12': { title: 'Wikipédia &amp; ses meilleurs articles', lang: 'fra', articles: 52000, pages: { Phare: '<p>Un phare est une tour munie d’une source lumineuse.</p>' } },
}

const escape = (/** @type {string} */ text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xml = (/** @type {number} */ status, /** @type {string} */ body) => new Response(body, { status, headers: { 'content-type': 'application/xml', 'access-control-allow-origin': '*' } })

/** @param {Request | string | URL} request @param {Record<string, Book>} [books] */
export function kiwix(request, books = BOOKS) {
  const url = new URL(typeof request === 'object' && 'url' in request ? request.url : String(request))
  const path = decodeURIComponent(url.pathname.replace(/^\/kiwix\//, ''))
  if (path === 'catalog/v2/entries') {
    return xml(200, `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <title>All Entries</title>${Object.entries(books).map(([name, book]) => `\n  <entry><id>urn:uuid:${name}</id><title>${book.title}</title><language>${book.lang}</language><name>${name.replace(/_\d{4}-\d\d$/, '')}</name>
    <category>${name.split('_')[0]}</category><articleCount>${book.articles}</articleCount><link type="text/html" href="/kiwix/content/${name}"/></entry>`).join('')}\n</feed>`)
  }
  if (path === 'search') {
    const [wanted, category] = [url.searchParams.get('books.filter.lang')?.split(','), url.searchParams.get('books.filter.category')]
    const searched = Object.entries(books).filter(([name, book]) => (!wanted || wanted.includes(book.lang)) && (!category || name.startsWith(`${category}_`)))
    if (new Set(searched.map(([, book]) => book.lang)).size > 1) return xml(400, '<error>Confusion of tongues: books in more than one language.</error>')
    const words = String(url.searchParams.get('pattern')).toLowerCase().split(/\s+/)
    const items = searched.flatMap(([name, book]) => Object.entries(book.pages).flatMap(([title, html]) => {
      const text = `${title.replace(/_/g, ' ')} ${html.replace(/<[^>]*>/g, '')}`
      if (!words.some((word) => text.toLowerCase().includes(word))) return []
      const snippet = escape(text.slice(0, 120)).replace(new RegExp(`(${words.join('|')})`, 'gi'), '<b>$1</b>')
      return [`<item><title>${escape(title.replace(/_/g, ' '))}</title><link>/kiwix/content/${name}/${encodeURIComponent(title)}</link><description>${snippet}...</description><book><title>${name}</title></book><wordCount>40</wordCount></item>`]
    }))
    return xml(200, `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><title>Search: ${escape(words.join(' '))}</title>${items.join('')}</channel></rss>`)
  }
  const [, name, title] = /^content\/([^/]+)\/(.+)$/.exec(path) ?? []
  const page = books[name]?.pages[title]
  return page ? new Response(`<!DOCTYPE html><html><head><title>${title}</title></head><body>${page}</body></html>`, { headers: { 'content-type': 'text/html' } }) : xml(404, '<error>Not found</error>')
}
