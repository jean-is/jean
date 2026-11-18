// SPDX-License-Identifier: MIT
// Jean and Tasks in Gemini, at /compare/gemini-tasks, /fr/comparer/gemini-tasks and /ko/compare/gemini-tasks, for the
// reader who searched for an alternative to the mode Google added to the Gemini app for work one hands off: tested as
// Gemini Spark from May 2026, renamed Task, a toggle beside Chat, and free of charge in six countries since November.
// People type both names, so the address, the title and the h1 say Gemini Tasks, and the title, the table's head and a
// question the old one. It works in Google's cloud across one's Google apps, with Google's AI, and isn't offered in
// the European Economic Area, Switzerland or the UK, nor on a work or school account: so the French page leads with
// where Jean works, and the English one and the Korean one, whose readers have it free of charge, with whose devices;
// all three with the AI one chooses; a Google AI plan answers in Jean too (D756). Google's own pages are what each
// fact is read from, its plans' prices as Google shows them in each language's country: its Korean page shows none
// for Pro, so neither does Jean's. What starts in the US alone, handing it work by email or by text, is said so.
// product.js writes it.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/gemini-tasks', fr: 'fr/comparer/gemini-tasks', ko: 'ko/compare/gemini-tasks' },
  sources: {
    product: { url: 'https://gemini.google/us/overview/productivity/?hl=en', checked: '2026-11-18' },
    launch: { url: 'https://blog.google/innovation-and-ai/products/gemini-app/tasks-in-gemini-free-new-features/', checked: '2026-11-18' },
    help: { url: 'https://support.google.com/gemini/answer/17094507?hl=en', checked: '2026-11-18' },
    schedules: { url: 'https://support.google.com/gemini/answer/17094710?hl=en', checked: '2026-11-18' },
    skills: { url: 'https://support.google.com/gemini/answer/17094296?hl=en', checked: '2026-11-18' },
    computer: { url: 'https://support.google.com/gemini/answer/18789153?hl=en', checked: '2026-11-18' },
    mac: { url: 'https://support.google.com/gemini/answer/17208717?hl=en', checked: '2026-11-18' },
    privacy: { url: 'https://support.google.com/gemini/answer/13594961?hl=en', checked: '2026-11-18' },
    prices: { url: 'https://gemini.google/us/subscriptions/?hl=en', checked: '2026-11-18' },
    'prices-fr': { url: 'https://gemini.google/fr/subscriptions/?hl=fr', checked: '2026-11-18' },
    'prices-ko': { url: 'https://gemini.google/kr/subscriptions/?hl=ko', checked: '2026-11-18' },
  },
  actions: ['sample', 'gemini'],
  // Its catch, by the part of its promise: work that stops with the tab, websites it doesn't act on and work that
  // lives in this browser, under the alternative; what the AI costs, what the Gemini plan takes and what the one on
  // this computer needs, under the AI.
  limits: { alternative: [0, 1, 5], where: [2, 3, 4] },
})
