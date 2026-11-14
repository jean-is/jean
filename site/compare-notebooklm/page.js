// SPDX-License-Identifier: MIT
// Jean and NotebookLM, at /compare/notebooklm and /fr/comparer/notebooklm, for the reader who searched for an
// open-source, free or private alternative to it, or one for studying. Google renamed it Gemini Notebook in July 2026;
// people still type the old name, so the address, the title and the h1 keep it, and the eyebrow, the lede and the
// table's head say the new one beside it. Both answer from your sources and cite the passage, so the page says that as
// a tie; what sets them apart is the AI, which NotebookLM's pages give no choice of, and where the files stay. Google's
// own pages are what each fact is read from, its plans' prices as Google shows them in each language's country.
// product.js writes it.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/notebooklm', fr: 'fr/comparer/notebooklm' },
  sources: {
    rename: { url: 'https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/', checked: '2026-11-14' },
    about: { url: 'https://support.google.com/gemininotebook/answer/16164461?hl=en', checked: '2026-11-14' },
    sources: { url: 'https://support.google.com/gemininotebook/answer/16215270?hl=en', checked: '2026-11-14' },
    chat: { url: 'https://support.google.com/gemininotebook/answer/16179559?hl=en', checked: '2026-11-14' },
    audio: { url: 'https://support.google.com/gemininotebook/answer/16212820?hl=en', checked: '2026-11-14' },
    plans: { url: 'https://support.google.com/gemininotebook/answer/16213268?hl=en', checked: '2026-11-14' },
    video: { url: 'https://support.google.com/gemininotebook/answer/16454555?hl=en', checked: '2026-11-14' },
    flashcards: { url: 'https://support.google.com/gemininotebook/answer/16958963?hl=en', checked: '2026-11-14' },
    maps: { url: 'https://support.google.com/gemininotebook/answer/16212283?hl=en', checked: '2026-11-14' },
    mobile: { url: 'https://support.google.com/gemininotebook/answer/16296687?hl=en', checked: '2026-11-14' },
    home: { url: 'https://notebook.google/', checked: '2026-11-14' },
    privacy: { url: 'https://support.google.com/gemininotebook/answer/17004255?hl=en', checked: '2026-11-14' },
    prices: { url: 'https://gemini.google/us/subscriptions/?hl=en', checked: '2026-11-14' },
    'prices-fr': { url: 'https://gemini.google/fr/subscriptions/?hl=fr', checked: '2026-11-14' },
    notes: { url: 'https://support.google.com/gemininotebook/answer/16262519?hl=en', checked: '2026-11-14' },
    create: { url: 'https://support.google.com/gemininotebook/answer/16206563?hl=en', checked: '2026-11-14' },
    faq: { url: 'https://support.google.com/gemininotebook/answer/16269187?hl=en', checked: '2026-11-14' },
  },
  actions: ['sample', 'device'],
  // Its catch, by the part of its promise: no Audio Overviews, what the AI costs and what it needs, under the
  // alternative; what an AI online reads, work that lives in this browser and a notebook that doesn't come in whole,
  // under where the files stay.
  limits: { alternative: [0, 1, 2], where: [3, 4, 5] },
})
