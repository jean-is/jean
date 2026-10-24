// Jean and Open WebUI (D445), at /compare/open-webui and /fr/comparer/open-webui, for the technical reader who runs
// Ollama and wants a front end without a server: the one comparison page that names MCP and models, as /enterprise
// does. Ollama answers a page in a browser only once it allows the page's address, so the top shows that setting
// beside its button (`brain.local.hint`). Open WebUI's documentation and licence are what each fact is read from;
// product.js writes the page.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/open-webui', fr: 'fr/comparer/open-webui', ko: 'ko/compare/open-webui' },
  sources: {
    docs: { url: 'https://docs.openwebui.com/', checked: '2026-10-20' },
    features: { url: 'https://docs.openwebui.com/features/', checked: '2026-10-20' },
    start: { url: 'https://docs.openwebui.com/getting-started/quick-start/', checked: '2026-10-20' },
    mcp: { url: 'https://docs.openwebui.com/features/extensibility/mcp', checked: '2026-10-20' },
    license: { url: 'https://github.com/open-webui/open-webui/blob/main/LICENSE', checked: '2026-10-20' },
  },
  actions: ['local', 'host'],
})
