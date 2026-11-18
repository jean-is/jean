// SPDX-License-Identifier: MIT
// Jean and ChatGPT Work, at /compare/chatgpt-work and /fr/comparer/chatgpt-work, for the reader who searched for an
// open-source alternative to the assistant OpenAI added to ChatGPT in July 2026: a page of its own beside ChatGPT's,
// since that search wants work carried through to finished files, at a desk and often for a team, where ChatGPT's
// wants a free chat. Work also runs from a web page, so what sets the two apart isn't the install but whose AI does
// the work and where it stays; a ChatGPT plan answers in Jean too (D235, D262). OpenAI's pages each fact is read
// from are below, its repository's for what is open; product.js writes the page.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/chatgpt-work', fr: 'fr/comparer/chatgpt-work', ko: 'ko/compare/chatgpt-work' },
  sources: {
    work: { url: 'https://openai.com/chatgpt-work/', checked: '2026-11-18' },
    launch: { url: 'https://openai.com/index/chatgpt-for-your-most-ambitious-work/', checked: '2026-11-18' },
    help: { url: 'https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex', checked: '2026-11-18' },
    use: { url: 'https://learn.chatgpt.com/docs/use-chatgpt', checked: '2026-11-18' },
    scheduled: { url: 'https://learn.chatgpt.com/docs/automations', checked: '2026-11-18' },
    skills: { url: 'https://learn.chatgpt.com/docs/build-skills', checked: '2026-11-18' },
    usage: { url: 'https://learn.chatgpt.com/docs/pricing', checked: '2026-11-18' },
    pricing: { url: 'https://chatgpt.com/pricing', checked: '2026-11-18' },
    data: { url: 'https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt', checked: '2026-11-18' },
    export: { url: 'https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data', checked: '2026-11-18' },
    codex: { url: 'https://github.com/openai/codex', checked: '2026-11-18' },
  },
  actions: ['sample', 'chatgpt'],
  // Its catch, by the part of its promise: work that stops with the tab and lives in this browser, under the
  // alternative; what the AI costs, what the ChatGPT plan takes and what the one on this computer needs, under the AI.
  limits: { alternative: [2, 4], where: [0, 1, 3] },
})
