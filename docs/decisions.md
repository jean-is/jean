# Decisions

Made on 2026-10-01 unless stated otherwise. Each entry gives the decision, why, and what was rejected. To change one, add a new entry that supersedes it; don't edit history.

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | **Reboot from scratch** rather than refactor DEVS | No users or years of fixes to protect; cutting 95% is harder than writing ~5k clean lines | Incremental pruning of DEVS |
| D2 | **First user: a non-technical knowledge worker**; one job: files in, things out | A sharp job beats an architecture ("swarm") as a pitch | Developers first; generic chat |
| D3 | **Open source, reputation first;** money secondary | The goal is craft and reach; plain files keep the Obsidian-style door open | Designing a paid relay now |
| D4 | **Working name Jean, held in the `BRAND` variable,** display only | The name may change; data must not depend on it | Name in identifiers or storage |
| D5 | **"Incremental" means game-like progressive discovery** | Teaches itself; the simple first screen and the small first load are one decision | Feature-complete UI from day one |
| D6 | **Discovery triggers: events, reflexes, `offer()` — never keywords** | Must work in every language | Regex/keyword intent rules |
| D7 | **One agent loop plus helpers;** no orchestrator or methodologies | 2026 winners are single-loop agents; delegation is one tool | DEVS's decomposer/teams/synthesis and 8D/DMAIC templates |
| D8 | **pi-style prompts** (~150 tokens, sections) | Small on-device brains, calm instructions, cache-friendly | DEVS's 2k-token persona prompts |
| D9 | **No build step:** ES modules, import map, JSDoc + `tsc --noEmit` | View-source is the source; deploying is copying; no toolchain rot | Vite/TypeScript build; React; htmx |
| D10 | **Custom elements + `@preact/signals-core` + `lit-html` + `marked` (lexer)** | Standard elements upgrade when their module loads, which *is* progressive discovery; CSP-safe | Preact + htm; VanJS; Alpine (needs `eval`); htmx (needs a server) |
| D11 | **Data as plain files in OPFS** behind `core/fs.js` | Portable, readable, sync-friendly, user-owned | Yjs as the whole data layer; IndexedDB records |
| D12 | **Writes via a storage worker using `createSyncAccessHandle`** | Works from Safari 16.4; `createWritable` needs Safari 26 | Main-thread `createWritable` only |
| D13 | **Keep QuickJS** for JavaScript | Code can only reach what Jean hands it; hard memory and time limits; same sandbox in every host | Running JavaScript in a sandboxed iframe (can still navigate itself, WebRTC not covered by CSP, can freeze the tab) |
| D14 | **Pyodide with no network,** enforced by a CSP `<meta>` in `sandbox.html` | Static hosting can't set headers; untrusted code only in a worker that inherits the strict CSP | Pyodide in a plain worker (its `js` bridge can call `fetch`) |
| D15 | **Brain ladder:** on-device Gemma 4 E2B → one-click cloud → keys/local servers | Works out of the box; universal; multilingual | Browser built-in models (too experimental); Apple Foundation Models / native shells (not lean) |
| D16 | **Reflexes through a Decisions API (Jev shape);** local Kev or Laya, chosen by evaluation | Cheap, private, multilingual decisions without paying LLM prices | The brain for every decision; hosted Jev/Clef as default (need a server or account) |
| D17 | **ACP `session/update` as the event and transcript format** | Standard, small, semantic (kind, locations, plan, permissions map onto rules) | A custom format; AG-UI (built for a UI fronting a server agent) |
| D18 | **Projects are self-contained folders;** an agent is a project with an identity | One mechanism for contexts and agents; folder operations give backup, share and sync | Separate "agents" and "spaces" concepts; `spaceId` on every record |
| D19 | **UI word "Project"** | Already taught by Claude and ChatGPT; translates everywhere | Space (collides with ChatGPT Space), Agent (jargon), Room (French "pièce" ambiguity), Folder (confusing) |
| D20 | **Rules: Do it / Ask me first / Never** | Clear, maps onto ACP permission options, lockable by policy | Free-form permissions |
| D21 | **MCP for connections** | Open standard; replaces DEVS's 30k lines of connectors | Proprietary connector code; an app catalogue |
| D22 | **`SKILL.md` for routines** | Portable across Claude, Codex and others | DEVS marketplace YAML |
| D23 | **Web search via the brain's own search, Wikipedia, or a configured endpoint;** no Jean proxy by default | DEVS's `proxy.devs.new` was a server in disguise | Running a search proxy |
| D24 | **No vector database:** whole document if it fits, else agentic BM25 search with reflex re-ranking | The brain writes queries in the document's language; fewer moving parts | Embeddings-first RAG |
| D25 | **i18n built in everywhere,** with instant switching, ~30 languages | Jean is for every region; signals make switching free | English-first with translations later |
| D26 | **Dictation and read-aloud from day one;** live conversation discovered | Accessibility first | Voice entirely gated |
| D27 | **Data bound to the origin:** settle the domain before launch | A domain change means migrating everyone's data | Launching on a temporary domain |

## Added while building 0.1 (2026-10-02)

| # | Decision | Why | Rejected |
|---|---|---|---|
| D28 | **Trusted Types on, with one extra policy, `app-urls`,** that only allows same-origin script URLs (the storage worker, the service worker) | Without it, Trusted Types blocks `new Worker()` and service-worker registration; with it, no other script URL can ever be created | Dropping `require-trusted-types-for` |
| D29 | **The inline import map is allowed by its SHA-256 hash in the CSP,** guarded by `test/html.test.js` | Browsers don't support external import maps; a hash keeps `'unsafe-inline'` out | `'unsafe-inline'`; a bundler |
| D30 | **Organisation policy is opt-in** via `<meta name="app-policy" content="policy.json">` | No 404 noise for everyone else; organisations already edit `index.html` and send headers | Always fetching `policy.json` |
| D31 | **Tool calls are emitted at the end of each model step,** not mid-stream | After an Anthropic mid-stream refusal fallback, earlier tool calls must not run | Streaming tool calls as they complete |
| D32 | **Anthropic defaults:** `claude-opus-5-5`, adaptive thinking with summarized display, server-side refusal fallbacks (`fallbacks: "default"`), eager tool-input streaming; OpenAI gets `max_completion_tokens` | Current API guidance; summaries feed the activity view | SDKs; `budget_tokens` (rejected by current models) |
| D33 | **Provider endpoints in `PROVIDERS` and the OpenRouter OAuth URLs are provider identities,** not hidden dependencies: every base URL can be overridden in settings or policy | The "no hard-coded third-party URL" rule targets services Jean depends on, not the provider a user explicitly picks | Configuring every provider by hand |
| D34 | **Display face: Instrument Serif (OFL), regular and italic Latin subsets** (15 KB each); Arabic headings use the system font | Warm, editorial, memorable; within the 30 KB budget | Variable fonts with many axes (too heavy) |
| D35 | **Markdown images from model output are never loaded,** only their alt text is shown | An image URL is a classic way for injected instructions to leak data | Rendering images |
| D36 | **Brain entries store provider and model as data;** labels are rendered in the current language | Switching language relabels history, as planned for the activity view | Storing only the rendered title |
| D37 | **Development uses a deterministic fake brain** (`test/fixtures/fake-brain.js`) | End-to-end checks without keys, downloads or network | Testing only against real providers |
