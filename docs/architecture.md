# Architecture

## Principles as rules

| Principle | Rule that can be enforced |
|---|---|
| KISS | Hard limits in [budgets.json](../budgets.json), checked in CI. Going over means deleting something first. |
| Portable | All data is plain files: Markdown, JSONL, `SKILL.md` folders. Export is a zip; import is dropping a folder. |
| Universal | Standards, not adapters: OpenAI-compatible and Anthropic Messages, MCP, Agent Skills, ACP events, the Jev-style Decisions API. |
| Browser-ready | The browser comes first: static files, offline after the first load, opened from a link. |
| System-agnostic | `core/` uses only standard web APIs and runs unchanged in a browser, a worker, Node, Deno or Bun. Proof: core tests run under `node --test`. |
| Incremental | Capabilities are discovered as situations call for them, offered by Jean, granted by the user, and only then loaded. |

## Stack

**No build step.** Plain ES modules and an import map; types in JSDoc, checked by `tsc --noEmit` during development only. Deploying means copying the folder, and view-source *is* the source.

| Loaded upfront (3) | Size | Why |
|---|---|---|
| `@preact/signals-core` | ~1.6 KB | State: language, conversation, unlocked capabilities. Switching language is one signal. |
| `lit-html` | ~3.5 KB | Efficient streaming updates; never uses `eval`; works with Trusted Types |
| `marked` (lexer only) | ~12 KB | Its tokens are rendered as lit-html templates, so no `innerHTML` and no XSS entry point |

| Loaded on demand | Used by |
|---|---|
| `quickjs-emscripten` (~1 MB) | Calculations |
| Pyodide | Data toolkit (Python) |
| `@huggingface/transformers` | On-device brain (Gemma 4 E2B), reflexes (Kev), dictation (Whisper-class), voice detection (Silero) |
| `laya-ts` + onnxruntime-web | Reflexes, only if Laya wins the evaluation |
| `pdfjs-dist` | Reading PDFs |
| `kokoro-js` | Optional natural voices |
| MCP client (own minimal Streamable HTTP client, or the official SDK) | Connections; to be decided in 0.5 |

**Built on browser features, no dependency:**

- **Text extraction** from DOCX/XLSX/PPTX: zip + XML via `DecompressionStream` and `DOMParser`.
- **Backup zip writer:** `CompressionStream`.
- **BM25 search:** with `Intl.Segmenter` for word splitting.
- **ULIDs:** generated with `crypto.getRandomValues`.
- **Voices:** operating-system voices.
- **Coordination:** Web Locks and BroadcastChannel.

**Components are custom elements (light DOM, prefix `app-`).** Each capability is one module that defines its elements and registers its tools. Unlocking means calling `import()`, and any `<app-chart>` already on the page upgrades automatically. `:not(:defined)` styles undiscovered elements. The browser itself provides progressive discovery.

**Why not the alternatives:**

- **htmx** assumes a server that returns HTML, and Jean has none. Faking one in the service worker would move the app into it, fight token streaming, and `hx-on` relies on `eval`, which the CSP forbids.
- **React or Preact** components aren't standard elements, and they would need a build step or `htm`.
- **VanJS** is smaller still, but custom elements are needed for lazy upgrades anyway.
- **Alpine.js** needs `eval`.

## Layout

```
index.html        CSP <meta>, import map, shell
sandbox.html      strict CSP <meta>; runs untrusted code in a worker
sw.js             offline cache, per-capability caching
brand.js          export const BRAND = { name, domain }
core/             llm.js loop.js decide.js fs.js skills.js i18n.js events.js   (standard web APIs only)
ui/               base element, shell, chat, activity view, collection page, style.css
caps/             files/ made/ backup/ compute/ python/ memory/ routines/ projects/ search/
                  connections/ voice/ helpers/ brain-local/ reflexes/ suggestions/ sources/
locales/          en.json fr.json ar.json …
vendor/           signals-core, lit-html, marked (+ the on-demand ones)
scripts/          manifest.js (content hashes → capabilities.json), translate.js, budgets.js
```

## Brand

```js
// brand.js — the only place the name lives
export const BRAND = Object.freeze({ name: 'Jean', domain: 'jean.cx' })
```

- **Used for display only:** UI strings (`{name}`), the system prompt, the page title and the generated web-app manifest. The wordmark is the name set in the display font, so there's no logo file to redo.
- **Never used in anything that persists:** storage keys, OPFS paths, cache names, element prefixes, CSS classes. Renaming changes one line and requires no data migration.
- **The assistant's name is a separate setting:** `settings.assistantName ?? BRAND.name`, which a project can override.
- **Grammar:** translations never make words agree with the name. French gender agreement, Arabic gendered verbs and Slavic declension all inflect around names; in conversation, the model handles grammar itself.
- **The origin is not a variable.** Browser storage belongs to the domain. Changing the domain after launch means moving everyone's data, so settle it before the public launch.

## Core

- **`loop.js`** (~200 lines): stream the reply, run tool calls, feed results back, repeat. Rules (Do it / Ask me first / Never) are checked before each tool runs.
- **`llm.js`** (~400 lines): two adapters, OpenAI-compatible Chat Completions and Anthropic Messages, over fetch and SSE. Together they reach almost every model. pi-ai serves as a reference implementation but is not a dependency, because it pulls in three official SDKs.
  - Anthropic from the browser needs the `anthropic-dangerous-direct-browser-access: true` header.
  - OpenRouter supports an OAuth PKCE login that runs entirely in the browser.
- **Tools**, contributed by capabilities: `read`, `write`, `edit`, `run`, `search`, `recall`, `remember`, `fetch`, `offer`, `delegate`, plus connection tools.
- **`events.js`:** the ACP event stream (see [Activity events](#activity-events)).
- **`skills.js`:** loads `SKILL.md` folders and lists only their name and description in the prompt. The full file is read when relevant.
- **`decide.js`:** reflexes (see below).
- Prompt: [prompts/system.md](../prompts/system.md).

## Brain ladder

1. **On this device:** Gemma 4 E2B through Transformers.js and WebGPU. About 2 GB downloaded once, with consent; native tool calling; strong in many languages. The download screen offers "or start right now with a free account" alongside. Machines without WebGPU skip this rung.
2. **One click:** OpenRouter or Hugging Face sign-in. No key to paste.
3. **Advanced:** the user's own key, or a local server (Ollama, LM Studio, any OpenAI-compatible endpoint).

Not used: the browsers' built-in models (too experimental) and native OS models such as Apple Foundation Models (not lean).

## Reflexes

`decide(state, questions)` uses the Jev/Decisions API shape: typed questions (`noul`, `choice`, `score`) in, calibrated probabilities out. That shape is now shared by Jev, Clef, Strands Decider, Laya, Kev, Ollaya and OpenRouter's `/api/alpha/decisions`, so backends can be swapped freely.

```js
const { answers } = await decide(userMessage, {
  capability: { type: 'choice', instructions: 'Which capability, if any, would help now?', criteria: { files: '…', compute: '…', none: 'nothing new' } },
  lasting:    { type: 'noul',   instructions: 'Does the user state a lasting fact, preference or correction?' },
  demand:     { type: 'score',  instructions: 'How demanding is this request?', criteria: ['chat', 'reading', 'multi-step', 'expert'] },
})
```

| Backend | When |
|---|---|
| Kev-0.6B through Transformers.js | Default candidate: no extra runtime, because it shares the on-device brain's library |
| Laya multilingual through laya-ts | Default candidate: documented in 100+ languages, runs on a CPU |
| Jev through OpenRouter | When a cloud brain is connected (browser calls with the user's key are untested) |
| Ollaya (local server) | Advanced users |
| The brain itself, with constrained JSON | Last resort |

**Choosing between Kev and Laya:**

1. Build a multilingual test set first: about 30 languages × each reflex question × examples, generated by a frontier model and spot-checked by native speakers.
2. Pick the model that performs best on it.
3. If neither is good enough, fine-tune a "Jean reflexes" checkpoint on synthetic multilingual data and publish it under Apache 2.0.

The test set is the lasting asset, because this category will change monthly.

**Reflex questions:**

| Question | Type |
|---|---|
| Which capability, if any, would help? | choice |
| Does this need current information from the web? | yes/no |
| How demanding is the request? | score |
| Personal, health, financial or confidential content? | yes/no |
| A lasting fact, preference or correction? | yes/no |
| About the person in general, or about this project? | choice |
| Same kind of task as an earlier one? | yes/no |
| Is this action irreversible? | score |
| Does this passage help answer the question? (re-ranking) | yes/no |
| Does source [n] support this sentence? | yes/no |
| Which suggestions from the catalogue fit? | choice |
| Is the user unhappy with the last answer? | yes/no |
| Is this a separate ongoing project? | yes/no |

## Data and persistence

```
/                                OPFS root (or a mirrored real folder)
  settings.json
  instructions.md                global, written by the user
  memory.md                      global, curated by Jean
  skills/<name>/SKILL.md         global routines
  projects/
    <ulid>-<slug>/
      project.md                 front matter: name, assistantName, colour, brain, rules; body: short persona
      instructions.md
      memory.md
      skills/<name>/SKILL.md
      files/sha256-<hash>.<ext>  original
      files/sha256-<hash>.md     extracted text with page markers
      files/sha256-<hash>.meta.json
      conversations/<ulid>.jsonl
  .secrets/                      encrypted; never exported, synced or shared
  .cache/                        disposable: search index, thumbnails
```

There is always a default project, hidden until the Projects capability is discovered. One code path handles everything.

- **Writes.** A single storage worker writes with `createSyncAccessHandle`, which works in Safari 16.4+, Chrome 108+ and Firefox 111+. `createWritable` would require Safari 26+, and universal beats newest.
  - Conversations are append-only, so a crash costs at most a half-written last line, which is ignored on read.
  - Files that get rewritten whole are written to a temporary file first, then swapped in.
- **Several tabs.** Web Locks serialise writes per file; BroadcastChannel tells other tabs to refresh their signals.
- **Format changes.** Every file carries a `format` version and is upgraded lazily when read.
- **Preventing loss:**
  - Browsers delete *all* of a site's data at once when they evict it, so call `navigator.storage.persist()`.
  - Encourage installing the app: Safari can wipe sites that haven't been visited for 7 days unless they are installed.
  - Offer backup early.
  - On Chrome and Edge, mirroring to a real folder is continuous backup.
  - Show usage in plain words ("Jean uses 340 MB on this device").
  - When space runs low, evict model weights first and never user data.
- **Secrets.** API keys and tokens are encrypted with a non-extractable `CryptoKey` kept in IndexedDB (the only use of IndexedDB). They are never included in exports, syncs or shares.
- **Layout rules that keep sync possible:**
  - One file per entity, named by ULID and never renamed.
  - Attachments named by content hash.
  - No central index of record.
  - `author` and timestamps on every entity.
  - Only `core/fs.js` touches storage.

## Service worker

- **On install:** cache the shell and *all* locale files (a few KB each), so switching language is instant, even offline.
- **On unlock:** cache the capability's files, listed in `capabilities.json`, which `scripts/manifest.js` generates with content hashes. The cache itself is the record of what has been unlocked.
- **On update:** download the new shell and new versions of *unlocked* capabilities only, then delete old caches.
- **Model weights** live in their own cache, separate from app versions, so an app update never re-downloads 2 GB.
- **Offline:** history, files and the on-device brain keep working. If only a cloud brain is connected, Jean says so plainly.

## Security

Two HTML documents, each with its own CSP in a `<meta>` tag, which works on any static host.

**`index.html`** runs only Jean's own code:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self';
img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self';
connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*;
worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
require-trusted-types-for 'script'; trusted-types lit-html app-markdown
```

- **Why `connect-src` is broad:** users can add any OpenAI-compatible endpoint, and untrusted code never runs in this document. Organisations tighten it with an HTTP header (see [enterprise.md](enterprise.md)).
- **If an on-demand runtime turns out to need `'unsafe-eval'`,** give it its own worker document rather than loosening `index.html`.

**`sandbox.html`** is loaded in `<iframe sandbox="allow-scripts">` (never with `allow-same-origin`):

- **No access to Jean's storage.** Its origin is opaque.
- **Untrusted code only ever runs in a Worker** created from a `blob:` URL, so it inherits the sandbox's strict CSP. Workers have no navigation, no WebRTC and no `sendBeacon`, so every network path goes through `connect-src`.
- **Pyodide and QuickJS both run here.** QuickJS also restricts code to the functions Jean hands it, with memory and time limits.
- **Engineering spike (0.4):** choose between two ways of giving Pyodide its files.
  - **(a)** The host serves `/vendor/pyodide/` with `Access-Control-Allow-Origin: *`, and the sandbox's `connect-src` is limited to that path, stamped with the deployment origin.
  - **(b)** The parent document transfers Pyodide's files as buffers, and the sandbox runs with `connect-src 'none'`.

  Prefer (b) if Pyodide's loader allows it. Verify how `'self'` behaves in an opaque-origin sandbox in every browser before relying on it. If Pyodide needs `'unsafe-eval'`, that is acceptable *inside the sandbox only*: there is nothing to steal and nowhere to send it.

**Output previews** (charts, HTML) use separate iframes with `sandbox="allow-scripts"` only, and they never receive secrets.

## Languages (i18n)

- **Strings.** They live in `locales/<lang>.json`, with English as the source and `{name}` placeholders.
  - Plurals use `Intl.PluralRules` (Arabic has six forms).
  - Dates, numbers, lists and relative times use `Intl`.
  - Language names come from `Intl.DisplayNames`, so each language appears in its own name with no extra data.
- **Instant switching.** The locale is a signal, so every bound piece of text re-renders. `<html lang dir>` flips with it, and CSS uses logical properties only, so right-to-left layouts mirror immediately.
- **Details that are easy to miss:**
  - Every message element gets `dir="auto"`, so an English reply renders correctly in an Arabic UI.
  - Enter never sends while an IME is composing (`isComposing`).
  - `Intl.Segmenter` handles counting and truncation in Chinese, Japanese, Korean and Thai.
  - Fonts: the system font for every script, plus the display face only where it applies (see [design.md](design.md)).
- **Translation.** An LLM translates from English with a script, and native speakers review through PRs. There are about 150 strings.
- **Conversations.** The system prompt stays in English, with a `<language>` section. Changing the UI language updates only that section, and Jean's next reply follows.

## Retrieval and extraction

- **Extraction:**
  - DOCX, XLSX and PPTX are zip files of XML: about 100 lines with `DecompressionStream` and `DOMParser`.
  - PDFs use pdf.js, loaded on demand.
  - Scans and images go to the brain's vision ability (Gemma 4 E2B accepts images).
- **Retrieval, without a vector database:**
  1. If a document fits within about 25% of the active brain's context, include it whole. Provider prompt caching makes that cheap.
  2. Otherwise, the brain searches like a person, with `search(query)` and `read(file, pages)`. Search is a BM25 index over page-aware chunks, with `Intl.Segmenter` splitting words and a reflex re-ranking the results. A French question about an English PDF works because the brain writes its search query in the document's language.
  3. A multilingual embedding model is added only if the test set proves it necessary.
- **One engine, three uses:** project files, past conversations (`recall`) and memory.

## Activity events

Jean's internal event format is ACP's `session/update` vocabulary: `user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, plus `session/request_permission`. No library is needed; the types come from ACP's published JSON schema as JSDoc type definitions.

```jsonl
{"at":"2026-10-01T10:02:11Z","by":"jean","update":{"sessionUpdate":"plan","entries":[{"content":"Read the invoices","priority":"high","status":"completed"},{"content":"Total per client","priority":"high","status":"in_progress"}]}}
{"at":"2026-10-01T10:02:12Z","by":"jean","update":{"sessionUpdate":"tool_call","toolCallId":"t3","title":"Read invoices.csv","kind":"read","status":"completed","locations":[{"path":"files/invoices.csv"}]}}
```

- **One stream, one record.** The core emits the events, the UI renders them live, and the conversation JSONL stores them. Each line wraps an ACP update in an envelope that adds a timestamp and an author.
  - Text chunks are merged into one record when a message finishes, and each tool call is stored in its final state.
  - The transcript is therefore a standard, readable record that can be replayed, and the brain's context is derived from that same file.
- **Plain-language, translated labels.** The UI renders each label from `kind` plus `locations` with a translated template, so switching language relabels history instantly. `title` (required by ACP) is kept as a fallback in the original language.
- **Approvals map directly onto rules.** `allow_always` writes a "Do it" rule, `reject_always` writes "Never", and the "once" options keep "Ask me first".
- **Outside the vocabulary:** actions such as sending an email through MCP use `kind: "other"` plus a namespaced extension field.
- **Reflex decisions** shown to the user appear as collapsed `think` entries.
- **Helpers** are child sessions, referenced from the parent's tool call.
- **Enterprise audit:** a ~50-line adapter maps the stream to OpenTelemetry GenAI conventions (`invoke_agent`, `execute_tool`, `chat`).
- **AG-UI** is the better fit when a UI fronts an agent running on a server, which Jean's is not. A bridge from ACP to AG-UI exists if that is ever needed.

## Web search

In order of preference:

1. The connected brain's own search
2. Wikipedia and Wikidata, which browsers can call directly
3. An endpoint set in settings or policy (SearXNG with CORS enabled, or Brave, Tavily or Exa with the user's keys)

There is no Jean proxy by default. Fetching an arbitrary URL hits the same CORS wall and follows the same order.

## Voice pipeline

- **Speech to text:** a Whisper-class model through Transformers.js (shared runtime), or Chrome's on-device recognition where available.
- **Text to speech:** `speechSynthesis` with local voices, or Kokoro.
- **Live conversation:** Silero voice detection (~2 MB ONNX) → speech-to-text → brain (streamed) → speech, sentence by sentence. Speaking over Jean interrupts it.
- **Real-time speech models** come from the provider (OpenAI Realtime over WebRTC, Gemini Live); `wss:` is already allowed in `connect-src`.

## Sources

- [Can I Use: createWritable](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable) · [Can I Use: createSyncAccessHandle](https://caniuse.com/mdn-api_filesystemfilehandle_createsyncaccesshandle) · [PowerSync: SQLite persistence on the web](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) · [On-device speech recognition explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md)
- [ACP: tool calls](https://agentclientprotocol.com/protocol/tool-calls) · [ACP: plans](https://agentclientprotocol.com/protocol/agent-plan)
- [Gemma 4 WebGPU](https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU) · [kev-0.6b-ONNX](https://huggingface.co/onnx-community/kev-0.6b-ONNX) · [Laya](https://github.com/vcsoc/laya)
- [pi system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts)
