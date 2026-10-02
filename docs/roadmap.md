# Roadmap

Each version is deployed as soon as it is ready. The loud public launch happens at 0.3, once Jean can do something a chat app can't. AgentGPT showed that a browser agent which can't produce real work gets a burst of curiosity and then fades.

## Build order

| Version | Theme | Contents | Done when |
|---|---|---|---|
| **0.1** ✅ | Talk | Shell: custom elements, signals, lit-html. Light style v1. Instant i18n with right-to-left support (en, fr, ar to start). `BRAND`. Offline service worker with a `capabilities.json` manifest. Storage worker and the final data layout (default project). Conversations as ACP JSONL. Basic activity view. Do it / Ask me first / Never rules. Brain rungs 2–3: OpenRouter OAuth, keys, Ollama/LM Studio. Read-aloud. Budgets in CI from the first commit. | A non-technical tester can chat in Arabic, switch to French mid-conversation, reload offline and see their history |
| **0.2** ✅ | Read and keep | Frozen prompt per conversation with system notes; Anthropic prompt caching and warming (D46, D49). On-device brain (Gemma 4 E2B, q4f16) behind a device check, which fulfils the out-of-the-box promise. Files in: extraction for OOXML and PDF. Things Jean made: rich-text copy, CSV, print. Backup export/import plus `persist()`. "What Jean read". Dictation. | Jean answers questions about a dropped PDF with no account and no key, and a second question about it is served from the cache |
| **0.3** ✅ | Discover — **public launch** | Reflexes (Kev-0.6B, measured on the multilingual test set). Discovery mechanics and the collection page. Deferred tools and `find_tools` (D47). Calculations (QuickJS) with codemode and `models.decide` (D48). Reply suggestions. Auto mode. Source chips. 33 locales. | The "drop a CSV, get a report" demo works on a managed Windows laptop, in three languages |
| **0.4** ✅ | Remember | Memory (switches itself on), the "What Jean knows about you" page, instructions, projects (each with its light colour, which tints the little light: `--tint`, D78), routines (`SKILL.md`), `recall`. Python sandbox (after the Pyodide spike), with Pyodide copied in by `npm run dev`/`start`/`build` (D43). | Two projects keep separate memories, and a routine is created from repeated requests |
| **0.5** | Reach | Connections (MCP), deferred and reachable from codemode by default. Web search (the brain's own search plus Wikipedia). `models.image` in codemode. Live voice conversation. | Jean summarises the user's latest emails through a connection, with citations |
| **0.6** | Delegate | Helpers, decision inbox, "Since last time", assistant names, Double-check | A large task is split, approved step by step, and the result is verified against its sources |
| Later | Together | Sync (folder or drive), share (fragment links, Web Share), collaboration (an end-to-end-encrypted relay hosted on Jean's domain, self-hostable; Yjs for shared documents), enterprise policy hardening, OTel export, managed configuration | — |

## 0.2 status (2026-10-02)

Built: an address that keeps the open conversation (D59), Japanese (D60), frozen prompts with system notes, Anthropic caching and warming, the on-device brain behind its device check, files in (PDF, DOCX, XLSX, PPTX, text), "What Jean read", Things Jean made (rich-text copy, CSV, print), backup and restore with `persist()`, and dictation.

Checked end to end with the fake brain: a dropped PDF is answered, and the second question reuses the whole previous prefix (the fake brain reports the shared bytes as cached). Still to check by hand:

- [x] The done-when on a real device: a PDF answered by Gemma 4 E2B with no account and no key (checked by hand, 2026-10-02)
- [ ] Anthropic cache reads and warming against the real API (`cache_read_input_tokens` on the second question)
- [ ] Whisper dictation (an 80 MB download) and Chrome's on-device recognition where available. A first test on Arc found dictation silent; fixed by D61 and the Whisper `dtype` (`q8`), to check again
- [x] Playwright smoke tests (AGENTS.md): written in 0.3 (`npm run e2e`, D66). They cover talking, files and calculations, the collection page (where every capability is turned on) and the picker; backup, Things Jean made, dictation and the on-device brain have no flow of their own yet

## 0.3 status (2026-10-02)

Built: deferred tools and `find_tools`, with `offer` declared in every new conversation (D63, D64). Calculations: `run` in the QuickJS sandbox, with codemode (`file()`, `csv()`, `tools.<name>()`, `searchTools()`, `models.decide()`) (D65, D66). Intuition: Kev-0.6B on the device (D67). Discovery: offers above the box and inside answers, and the "What Jean can do" page (D72, D73). Reply suggestions (D69). Auto and the brain picker (D70). Source chips (D71). All 33 launch languages. Playwright smoke tests (D66). Also fixed: the local-brain address field no longer resets while the user types.

Checked end to end, with `npm run e2e` in Chromium and WebKit against the fake brain:

- The CSV demo in English, French and Japanese: drop `sales.csv`, ask, accept the offer, and get the exact totals (2540, 1960, 1515) with a [1] chip, and the script's own read nested under the calculation.
- Arabic, right to left. Follow-ups as buttons. The collection page and the picker.
- Scripts have no `fetch`, `XMLHttpRequest` or WebSocket. An endless loop and a memory blow-up are stopped (checked in headless Chromium and WebKit).

Kev ran in the browser on WebGPU (about 60 ms per message after warm-up) and was measured in all 33 languages (D68, [results](../test/reflexes/results.md)). Still to check by hand:

- [ ] The done-when on a real managed Windows laptop, with Edge or Chrome, in three languages
- [ ] The sandbox in Firefox (Playwright's Firefox wouldn't start in the build environment) and in real Safari and Edge
- [ ] Intuition on a machine without WebGPU (the q4 WebAssembly path): how long a message waits
- [ ] Auto's tiers against real providers: the model ids exist, and the picker shows their prices
- [ ] A fine-tuned "Jean reflexes" checkpoint (D68)

To try Calculations by hand, use a real browser: the Claude desktop app's built-in browser pane doesn't render opaque-origin sandboxed frames at all. This doesn't affect users.

Budgets at the end of the build: core 2,928 of 3,000 lines, app 8,144 of 10,000, first load 97.0 of 100 KB gzipped, base prompt 182 of 200 tokens.

## 0.4 status (2026-10-02)

Built: Memory, with `remember` and `recall` (D79), offered by the brain, by Intuition's new "lasting fact?" question (measured, D84) or from the house. "What Jean knows about you": the user's instructions (everywhere, and per project) and every noticed line, editable in place, deletable or made an instruction, plus the routines. Instructions, memory, routines and the project are frozen sections of the prompt, changed by notes (D81). Projects, each a folder with its own conversations, files, instructions, memory and routines, its own light (the room and the little light take its colour, D78), its place in the address, and an option to keep it on this device (D82). Routines as Agent Skills, saved by the brain when the user asks, after "Make this a routine" is offered for the third request of a kind (D83). The data toolkit: Python (Pyodide, standard library only) in its own sandbox, after the spike chose to send its files in (D80). 69 new strings in all 33 languages. Also fixed: opening one dialog from another (the picker's "All brains", the house's "Turn on" for Projects) no longer closes the new one; in right-to-left languages an empty box shows its placeholder right to left.

Checked end to end, with `npm run e2e` in Chromium and WebKit against the fake brain:

- The done-when: two projects keep separate memories, on the page and in what the brain is told; a written instruction reaches the next conversation's prompt; three alike requests offer a routine, which the brain saves (finding `save_routine` with `find_tools`, since the conversation started before Routines were on), and the next conversation lists it.
- Python: the standard library, no network (`pyfetch` fails), no package (`import pandas` says only the standard library is here), the value of the last line as the result, shared files read through `file()`.
- The new screens in Arabic (right to left) and Japanese.

Still to check by hand:

- [ ] Memory with real brains: does a strong cloud brain call `remember` for lasting facts only, and does the on-device brain call it at all?
- [ ] `find_tools` then `save_routine` with real brains, when Routines arrive mid-conversation
- [ ] Python in Firefox, real Safari and Edge, and its start-up time on a weak laptop (about 13 MB, then about 1.5 s from the cache on an M-series Mac)
- [ ] A project's light at every stage of the room's warmth, by day and by night, and with `prefers-contrast: more`

Budgets at the end of the build: core 2,963 of 3,000 lines, app 9,190 of 10,000, first load 96.6 of 100 KB gzipped (the largest catalogue is now Russian), CSS 9.1 of 12 KB, base prompt 182 of 200 tokens. The first load has 3.4 KB left: 0.5 will need room.

## Before the public launch (0.3)

- [ ] Final name and domain chosen and registered, because data is bound to the origin (see [open-questions.md](open-questions.md))
- [x] Multilingual reflex test set built; Kev measured in every launch language (D68)
- [ ] Kev fine-tuned where it falls short: personal and unhappy everywhere, and the low-resource languages (D68)
- [ ] Budgets enforced in CI and met (met in `npm run check`; there is no CI yet)
- [ ] CSP verified in Chrome, Edge, Firefox and Safari, including the sandbox document (Chromium and WebKit done through the smoke tests)
- [ ] Tested on a managed Windows laptop with a weak graphics chip, and on Safari 16.4+
- [ ] Contrast audited at every lighting stage; reduced-motion path checked
- [ ] Demo video recorded: the CSV-to-report flow, in about 15 seconds
- [ ] Manifesto and README published; the line count on the homepage
