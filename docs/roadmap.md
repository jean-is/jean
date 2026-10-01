# Roadmap

Each version is deployed as soon as it is ready. The loud public launch happens at 0.3, once Jean can do something a chat app can't. AgentGPT showed that a browser agent which can't produce real work gets a burst of curiosity and then fades.

## Build order

| Version | Theme | Contents | Done when |
|---|---|---|---|
| **0.1** | Talk | Shell: custom elements, signals, lit-html. Light style v1. Instant i18n with right-to-left support (en, fr, ar to start). `BRAND`. Offline service worker with a `capabilities.json` manifest. Storage worker and the final data layout (default project). Conversations as ACP JSONL. Basic activity view. Do it / Ask me first / Never rules. Brain rungs 2–3: OpenRouter OAuth, keys, Ollama/LM Studio. Read-aloud. Budgets in CI from the first commit. | A non-technical tester can chat in Arabic, switch to French mid-conversation, reload offline and see their history |
| **0.2** | Read and keep | On-device brain (Gemma 4 E2B), which fulfils the out-of-the-box promise. Files in: extraction for OOXML and PDF. Things Jean made: rich-text copy, CSV, print. Backup export/import plus `persist()`. "What Jean read". Dictation. | Jean answers questions about a dropped PDF with no account and no key |
| **0.3** | Discover — **public launch** | Reflexes (Kev or Laya, chosen by the multilingual test set). Discovery mechanics and the collection page. Calculations (QuickJS). Reply suggestions. Auto mode. Source chips. About 30 locales. | The "drop a CSV, get a report" demo works on a managed Windows laptop, in three languages |
| **0.4** | Remember | Memory (switches itself on), the "What Jean knows about you" page, instructions, projects, routines (`SKILL.md`), `recall`. Python sandbox (after the Pyodide spike). | Two projects keep separate memories, and a routine is created from repeated requests |
| **0.5** | Reach | Connections (MCP), web search (the brain's own search plus Wikipedia), live voice conversation | Jean summarises the user's latest emails through a connection, with citations |
| **0.6** | Delegate | Helpers, decision inbox, "Since last time", assistant names, Double-check | A large task is split, approved step by step, and the result is verified against its sources |
| Later | Together | Sync (folder or drive), share (fragment links, Web Share), collaboration (optional relay, Yjs for shared documents), enterprise policy hardening, OTel export, managed configuration | — |

## Before the public launch (0.3)

- [ ] Final name and domain chosen and registered, because data is bound to the origin (see [open-questions.md](open-questions.md))
- [ ] Multilingual reflex test set built; reflex backend chosen
- [ ] Budgets enforced in CI and met
- [ ] CSP verified in Chrome, Edge, Firefox and Safari (including the sandbox document)
- [ ] Tested on a managed Windows laptop with a weak graphics chip, and on Safari 16.4+
- [ ] Contrast audited at every lighting stage; reduced-motion path checked
- [ ] Demo video recorded: the CSV-to-report flow, in about 15 seconds
- [ ] Manifesto and README published; the line count on the homepage
