# Roadmap

Each version is deployed as soon as it is ready. The loud public launch happens at 0.3, once Jean can do something a chat app can't. AgentGPT showed that a browser agent which can't produce real work gets a burst of curiosity and then fades.

## Build order

| Version | Theme | Contents | Done when |
|---|---|---|---|
| **0.1** ✅ | Talk | Shell: custom elements, signals, lit-html. Light style v1. Instant i18n with right-to-left support (en, fr, ar to start). `BRAND`. Offline service worker with a `capabilities.json` manifest. Storage worker and the final data layout (default project). Conversations as ACP JSONL. Basic activity view. Do it / Ask me first / Never rules. Brain rungs 2–3: OpenRouter OAuth, keys, Ollama/LM Studio. Read-aloud. Budgets in CI from the first commit. | A non-technical tester can chat in Arabic, switch to French mid-conversation, reload offline and see their history |
| **0.2** ✅ | Read and keep | Frozen prompt per conversation with system notes; Anthropic prompt caching and warming (D46, D49). On-device brain (Gemma 4 E2B, q4f16) behind a device check, which fulfils the out-of-the-box promise. Files in: extraction for OOXML and PDF. Things Jean made: rich-text copy, CSV, print. Backup export/import plus `persist()`. "What Jean read". Dictation. | Jean answers questions about a dropped PDF with no account and no key, and a second question about it is served from the cache |
| **0.3** ✅ | Discover — **public launch** | Reflexes (Kev-0.6B, measured on the multilingual test set). Discovery mechanics and the collection page. Deferred tools and `find_tools` (D47). Calculations (QuickJS) with codemode and `models.decide` (D48). Reply suggestions. Auto mode. Source chips. 33 locales. | The "drop a CSV, get a report" demo works on a managed Windows laptop, in three languages |
| **0.4** ✅ | Remember | Memory (switches itself on), the "What Jean knows about you" page, instructions, projects (each with its light colour, which tints the little light: `--tint`, D78), routines (`SKILL.md`), `recall`. Python sandbox (after the Pyodide spike), with Pyodide copied in by `npm run dev`/`start`/`build` (D43). | Two projects keep separate memories, and a routine is created from repeated requests |
| **0.5** ✅ | Reach | Connections (MCP), deferred and reachable from codemode by default. Web search (the brain's own search plus Wikipedia). `models.image` in codemode. Live voice conversation. | Jean summarises the user's latest emails through a connection, with citations |
| **0.6** ✅ | Delegate | Helpers, decision inbox, "Since last time", assistant names, Double-check | A large task is split, approved step by step, and the result is verified against its sources |
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

## 0.5 status (2026-10-02)

Built: Connections over MCP, with Jean's own client for both protocol eras (the stateless 2026-07-28, and the handshake and sessions of 2025, D87) and sign-in with OAuth from the browser, or a key (D88). A connection's tools are deferred, listed in a frozen `<connections>` section, found with `find_tools` or called from a script, and ask first by default (D89). Every source a tool or the brain's own search brings in is numbered by the loop and becomes a chip, with a "Sources" list under the answer (D90). Web search: the brain's own (Anthropic, OpenRouter), otherwise Wikipedia in the user's language (D91). `models.image` in codemode, kept in the project and shown in the answer (D92). Live conversation: Silero and Whisper on the device, the answer read aloud as it streams, interrupted by speaking (D93). The loop and the brains' adapters now load with the first message (D94), and the app's line budget is 15,000 (D86, decided before 0.5). 25 new strings in all 33 languages. Also fixed: "Not now" on an offer above the box (Backup, Intuition, now Live conversation) no longer brings the offer straight back.

Added after 0.5: a directory of the services Jean knows, in Connections (D95). Notion, Canva, Miro and Granola connect in one click. Gmail, Google Drive, Google Calendar, Microsoft 365, Slack, Dropbox, Google Chat, Google Meet, Google Tasks, Figma and Atlassian are listed as not available yet, and policy can turn them on with a gateway or a registered client. `npm run directory` checks them again. 4 new strings in all 33 languages.

Checked end to end, with `npm run e2e` in Chromium and WebKit against the fake brain and a fake mail service (`test/fixtures/fake-mail.js`):

- The done-when: Jean signs in to the mail service (discovery, registration, PKCE, the issuer check), finds its tool with `find_tools`, asks before reading, and sums up the three latest emails, each cited as a chip with its subject, and listed under Sources.
- A service of the 2025 revision, reached from a script: the handshake, the session, the nested call under `run`.
- Web search through Wikipedia's address in settings: two web pages as chips that open; the search in the activity view.
- `models.image` from a script, through the Images API of an OpenAI-compatible server: the picture kept and shown, ready to save.
- The live conversation offer after three dictations, in English, Arabic and Japanese, and its button once on.
- Under `node --test`: both MCP eras, header mirroring, a forgotten session, the whole sign-in against the fake service (and a hostile one), Anthropic's search blocks and citations, its fallback when an organisation turns search off, OpenRouter's annotations, `pause_turn`, the numbering of sources, pictures from both providers, and live conversation's turn-taking.
- The Connections dialog, the approval and the cited answer by eye, in English, Arabic (right to left) and Japanese.

Still to check by hand:

- [ ] A real remote MCP server from a browser: whether it answers with CORS, exposes `Mcp-Session-Id` and `WWW-Authenticate`, accepts dynamic registration, and renews tokens. CORS and registration are checked for the directory's services (`npm run directory`, D95). Still to do: a real sign-in to each ready one (Notion, Canva, Miro, Granola), and a token renewal
- [ ] Anthropic's own web search against the real API: citations as chips, a second question replaying the results, `pause_turn` on a long search
- [ ] OpenRouter's web search: where its annotations arrive in the stream. If they all come at the end, the `[n]` marks land after the follow-ups, where they are hidden, and only the Sources list shows them
- [ ] `models.image` with OpenAI and OpenRouter keys
- [ ] Live conversation on a real microphone: Silero's thresholds, whether Jean's voice through speakers interrupts it (echo cancellation doesn't reach system voices everywhere), Safari's `AudioContext` at 16 kHz
- [ ] Signing in to a connection from a private Safari window: with no OPFS, anything set up before the redirect is lost

Budgets at the end of the build: core 2,999 of 3,000 lines, app 10,222 of 15,000 (D86), first load 90.2 of 100 KB gzipped (D94), CSS 9.3 of 12 KB, the largest catalogues 7.5 of 8 KB (Russian and Ukrainian), base prompt 182 of 200 tokens. The core and the catalogues are nearly full: 0.6 will need to make room in both.

## 0.6 status (2026-10-02)

Made room first, raising no limit: three modules that only one capability uses moved into it, and the core went from 2,999 to 2,577 lines (D96). Each language's catalogue split in two, the room's and the dialogs', which load with the dialogs: the largest first catalogue went from 7.6 to 5.9 KB (D97).

Built: Helpers, with `delegate` splitting a large task into up to five parts that helpers do at the same time, each a child turn with the same brain, rules and source numbers, recorded under its part and shown as a tree in the activity view (D98). The decision inbox: approvals and helpers' questions wait as cards under the answer, answered in any order, with "Always allow" settling the other cards of its kind (D99). Double-check: the claims of an answer that cite sources are checked against those sources by the brain that answered, one request outside the conversation, and shown under the answer with a way to correct what isn't supported (D100). "Since last time": opened after 8 hours away with services connected, Jean starts with a brief of what's new there, in a turn that can only read (D101). Assistant names: a project's assistant gets a name and a few words on how to be, in the header and the prompt (D102). 33 new strings in all 33 languages.

Checked end to end, with `npm run e2e` in Chromium and WebKit against the fake brain and the fake mail service:

- The done-when: a briefing is split between two helpers; each finds the mail tool and asks before reading, so two cards wait in the inbox, approved one at a time; the answer cites three emails, and Double-check finds two claims in their sources and one that isn't ("The bakery is closed on Monday"), with the follow-up to correct it.
- A helper's question in the inbox beside an approval, answered first; the answer uses it.
- Back after two days: the brief opens in a new conversation, asks before reading, and a send the brain tries is refused without a card (Chromium only: WebKit runs here like a private window, with nothing kept for the next visit).
- A project's assistant named Margot, with a way of being: the header, the prompt's first line and its `<project>` section.
- Double-check offered after three cited answers, in English, Arabic and Japanese.
- Under `node --test`: a helper's turn (its own history, approvals named under its call, its records under the delegate call at the parent's step, no thinking blocks, shared numbering, nothing in the parent's context but its report), the claims of an answer (lists, tables, Japanese), passages from long sources, a tool result's numbered sources, verdicts, a helper's declarations kept its own, and the catalogue parts.
- The inbox, the checked answer, the house, the project dialog and the brief by eye, in English (dark, and at phone width), Arabic (right to left) and Japanese.

Still to check by hand:

- [ ] Helpers with real brains: does a strong cloud brain split only large tasks, and give each part everything it needs? Does the on-device brain ever call `delegate`?
- [ ] Three helpers at once against providers' rate limits (OpenRouter's free models especially)
- [ ] Double-check with real brains: one verdict per line, in any language of the claims; its cost on long answers
- [ ] "Since last time" with a real service after a real night away, and in Safari (whether `pagehide` stamps the visit)
- [ ] The inbox with a screen reader: cards arriving while another is focused

Budgets at the end of the build: core 2,616 of 3,000 lines, app 10,914 of 15,000, first load 92.7 of 100 KB gzipped, CSS 9.9 of 12 KB, the largest catalogues 6.5 of 8 KB (Russian, Ukrainian and Telugu; their dialogs' part 3.0), base prompt 182 of 200 tokens.

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
