# Roadmap

Each version is deployed as soon as it is ready. The loud public launch happens at 0.3, once Jean can do something a chat app can't. AgentGPT showed that a browser agent which can't produce real work gets a burst of curiosity and then fades.

## Build order

| Version | Theme | Contents | Done when |
|---|---|---|---|
| **0.1** ✅ | Talk | Shell: custom elements, signals, lit-html. Light style v1. Instant i18n with right-to-left support (en, fr, ar to start). `BRAND`. Offline service worker with a `capabilities.json` manifest. Storage worker and the final data layout (default project). Conversations as ACP JSONL. Basic activity view. Do it / Ask me first / Never rules. Brain rungs 2–3: OpenRouter OAuth, keys, Ollama/LM Studio. Read-aloud. Budgets in CI from the first commit. | A non-technical tester can chat in Arabic, switch to French mid-conversation, reload offline and see their history |
| **0.2** ✅ | Read and keep | Frozen prompt per conversation with system notes; Anthropic prompt caching and warming (D46, D49). On-device brain (Gemma 4 E2B, q4f16) behind a device check, which fulfils the out-of-the-box promise. Files in: extraction for OOXML and PDF. Things Jean made: rich-text copy, CSV, print. Backup export/import plus `persist()`. "What Jean read". Dictation. | Jean answers questions about a dropped PDF with no account and no key, and a second question about it is served from the cache |
| **0.3** | Discover — **public launch** | Reflexes (Kev-0.6B, measured on the multilingual test set). Discovery mechanics and the collection page. Deferred tools and `find_tools` (D47). Calculations (QuickJS) with codemode and `models.decide` (D48). Reply suggestions. Auto mode. Source chips. 33 locales. | The "drop a CSV, get a report" demo works on a managed Windows laptop, in three languages |
| **0.4** | Remember | Memory (switches itself on), the "What Jean knows about you" page, instructions, projects, routines (`SKILL.md`), `recall`. Python sandbox (after the Pyodide spike), with Pyodide copied in by `npm run dev`/`start`/`build` (D43). | Two projects keep separate memories, and a routine is created from repeated requests |
| **0.5** | Reach | Connections (MCP), deferred and reachable from codemode by default. Web search (the brain's own search plus Wikipedia). `models.image` in codemode. Live voice conversation. | Jean summarises the user's latest emails through a connection, with citations |
| **0.6** | Delegate | Helpers, decision inbox, "Since last time", assistant names, Double-check | A large task is split, approved step by step, and the result is verified against its sources |
| Later | Together | Sync (folder or drive), share (fragment links, Web Share), collaboration (an end-to-end-encrypted relay hosted on Jean's domain, self-hostable; Yjs for shared documents), enterprise policy hardening, OTel export, managed configuration | — |

## 0.2 status (2026-10-02)

Built: an address that keeps the open conversation (D59), Japanese (D60), frozen prompts with system notes, Anthropic caching and warming, the on-device brain behind its device check, files in (PDF, DOCX, XLSX, PPTX, text), "What Jean read", Things Jean made (rich-text copy, CSV, print), backup and restore with `persist()`, and dictation.

Checked end to end with the fake brain: a dropped PDF is answered, and the second question reuses the whole previous prefix (the fake brain reports the shared bytes as cached). Still to check by hand:

- [x] The done-when on a real device: a PDF answered by Gemma 4 E2B with no account and no key (checked by hand, 2026-10-02)
- [ ] Anthropic cache reads and warming against the real API (`cache_read_input_tokens` on the second question)
- [ ] Whisper dictation (an 80 MB download) and Chrome's on-device recognition where available. A first test on Arc found dictation silent; fixed by D61 and the Whisper `dtype` (`q8`), to check again
- [ ] One Playwright smoke test per capability (AGENTS.md) is not written yet

## Before the public launch (0.3)

- [ ] Final name and domain chosen and registered, because data is bound to the origin (see [open-questions.md](open-questions.md))
- [ ] Multilingual reflex test set built; Kev measured in every launch language (fine-tuned where it falls short)
- [ ] Budgets enforced in CI and met
- [ ] CSP verified in Chrome, Edge, Firefox and Safari (including the sandbox document)
- [ ] Tested on a managed Windows laptop with a weak graphics chip, and on Safari 16.4+
- [ ] Contrast audited at every lighting stage; reduced-motion path checked
- [ ] Demo video recorded: the CSV-to-report flow, in about 15 seconds
- [ ] Manifesto and README published; the line count on the homepage
