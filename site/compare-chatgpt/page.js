// Jean and ChatGPT, at /compare/chatgpt and /fr/comparer/chatgpt, for the reader who searched for a free
// ChatGPT alternative: a free AI first, then ChatGPT's history brought in, and the plan last, with its catch, since
// it takes This computer (D235, D262). OpenAI's pages each fact is read from are below; product.js writes the page.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/chatgpt', fr: 'fr/comparer/chatgpt', ko: 'ko/compare/chatgpt' },
  sources: {
    users: { url: 'https://openai.com/index/accelerating-the-next-phase-ai/', checked: '2026-10-20' },
    data: { url: 'https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt', checked: '2026-10-20' },
    stored: { url: 'https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services', checked: '2026-10-20' },
    pricing: { url: 'https://chatgpt.com/pricing', checked: '2026-10-20' },
    plus: { url: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus', checked: '2026-10-20' },
    export: { url: 'https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data', checked: '2026-10-20' },
    terms: { url: 'https://openai.com/policies/eu-terms-of-use/', checked: '2026-10-20' },
    parents: { url: 'https://help.openai.com/en/articles/12315553-managing-parental-controls-in-chatgpt', checked: '2026-10-20' },
  },
  actions: ['try', 'history'],
})
