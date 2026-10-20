// Jean and Claude Cowork (D445), at /compare/claude-cowork and /fr/comparer/claude-cowork, for the reader who
// searched for an open-source alternative to it. There is no Claude Code page: that search wants tools for writing
// software, and Jean reaches a Claude plan through Claude Code (D235), which this page names as the way. Anthropic's
// pages each fact is read from are below; product.js writes the page.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/claude-cowork', fr: 'fr/comparer/claude-cowork' },
  sources: {
    cowork: { url: 'https://claude.com/product/cowork', checked: '2026-10-20' },
    merged: { url: 'https://claude.com/resources/articles/cowork-is-now-claude', checked: '2026-10-20' },
    pricing: { url: 'https://claude.com/pricing', checked: '2026-10-20' },
    training: { url: 'https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training', checked: '2026-10-20' },
    export: { url: 'https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data', checked: '2026-10-20' },
  },
  actions: ['sample', 'claude'],
})
