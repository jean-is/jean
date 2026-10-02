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

**First load without a bundle.** `npm run manifest` writes a `<link rel="modulepreload">` into `index.html` for every module the first load imports, so the browser fetches the whole graph in one round trip instead of discovering it one import level at a time. Only the lit-html files Jean imports are vendored. CI fails if the links are stale.

| Loaded upfront (3) | Size | Why |
|---|---|---|
| `@preact/signals-core` | ~1.6 KB | State: language, conversation, unlocked capabilities. Switching language is one signal. |
| `lit-html` | ~3.5 KB | Efficient streaming updates; never uses `eval`; works with Trusted Types |
| `marked` (lexer only) | ~12 KB | Its tokens are rendered as lit-html templates, so no `innerHTML` and no XSS entry point |

| Loaded on demand | Used by |
|---|---|
| `quickjs-emscripten` (~1 MB) | Calculations and codemode |
| Pyodide | Data toolkit (Python). Copied into `vendor/pyodide/` by `npm run dev`, `npm start` and `npm run build`, never committed (D43) |
| `@huggingface/transformers` with `onnxruntime-web` | On-device brain (Gemma 4 E2B), reflexes (Kev-0.6B), dictation (Whisper base), voice detection (Silero). Copied into `vendor/transformers/` (D52) |
| `pdfjs-dist` (legacy build) | Reading PDFs. Copied into `vendor/pdfjs/` with its character maps and standard fonts (D52) |
| `kokoro-js` | Optional natural voices |
| MCP client (own minimal Streamable HTTP client, or the official SDK) | Connections; to be decided in 0.5 |

**Built on browser features, no dependency:**

- **Text extraction** from DOCX/XLSX/PPTX: zip via `DecompressionStream` and a small tag scanner (not `DOMParser`, so it also runs in workers and under `node --test`).
- **Backup zip writer:** `CompressionStream`.
- **BM25 search:** with `Intl.Segmenter` for word splitting.
- **ULIDs:** generated with `crypto.getRandomValues`.
- **Voices:** operating-system voices.
- **Coordination:** Web Locks and BroadcastChannel.

**Routing is one hash** (`#/c/<conversation ulid>`, D59), read by `ui/router.js`: enough to reload or go back to the same conversation, on any static host.

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
core/             llm.js loop.js fs.js files.js extract.js zip.js backup.js prompt.js events.js i18n.js …
                  (standard web APIs only; decide.js and skills.js come later)
ui/               base element, shell, chat, activity view, caps.js (the unlock gate), style.css
caps/             files/ made/ backup/ brain-local/ voice/        (0.2)
                  compute/ python/ memory/ routines/ projects/ search/ connections/ helpers/ reflexes/
                  suggestions/ sources/                         (later)
locales/          en.json fr.json ar.json …
vendor/           signals-core, lit-html, marked (+ the on-demand ones); generated from node_modules, never committed
scripts/          vendor.js, manifest.js (content hashes → capabilities.json), translate.js, budgets.js
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

- **`loop.js`** (~200 lines): stream the reply, run tool calls, feed results back, repeat. Rules (Do it / Ask me first / Never) are checked before each tool runs. The prompt and the declared tools are frozen for the conversation; changes arrive as system notes (see [Prompt, tools and caching](#prompt-tools-and-caching)).
- **`llm.js`** (~400 lines): two adapters, OpenAI-compatible Chat Completions and Anthropic Messages, over fetch and SSE. Together they reach almost every model. pi-ai serves as a reference implementation but is not a dependency, because it pulls in three official SDKs.
  - Anthropic from the browser needs the `anthropic-dangerous-direct-browser-access: true` header.
  - OpenRouter supports an OAuth PKCE login that runs entirely in the browser.
- **Tools**, contributed by capabilities: `read`, `write`, `edit`, `run`, `search`, `recall`, `remember`, `fetch`, `offer`, `delegate`, `find_tools`, plus connection tools (deferred by default).
- **`events.js`:** the ACP event stream (see [Activity events](#activity-events)).
- **`skills.js`:** loads `SKILL.md` folders and lists only their name and description in the prompt. The full file is read when relevant.
- **`decide.js`:** reflexes (see below).
- Prompt: [prompts/system.md](../prompts/system.md).

## Brain ladder

1. **On this device:** Gemma 4 E2B, quantised to q4f16, through Transformers.js and WebGPU. Native tool calling, 140+ languages, image and audio input. About 3.1 GB for text, downloaded once with consent; the image and audio encoders follow the first time they're needed. The download screen offers "or start right now with a free account" alongside.
   - **Offered only where it runs:** WebGPU with `shader-f16`, enough memory (3–5 GB while answering) and enough free storage. Other devices, including Safari before 26 (no WebGPU), skip this rung.
   - **Not chosen:** Qwen3-0.6B. It is six times smaller, but too weak for multi-step tool use and document answers in most launch languages, and it can't read images. Kev covers the small, runs-everywhere slot (D42).
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
| **Kev-0.6B** through Transformers.js | Default (D41): ~340 MB, no extra runtime, because it shares the on-device brain's library |
| Jev through OpenRouter | When a cloud brain is connected (browser calls with the user's key are untested) |
| Ollaya (local server) | Advanced users |
| The brain itself, with constrained JSON | Last resort |

**Measuring Kev.** Kev was trained in English on a multilingual base (Qwen3), so it has to prove itself in every launch language:

1. Build a multilingual test set: the 33 launch languages × each reflex question × examples, generated by a frontier model. There is no native-speaker review (D44).
2. Measure Kev on it, language by language.
3. Where Kev falls short, fine-tune a "Jean reflexes" checkpoint from it on synthetic multilingual data and publish it under Apache 2.0.

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
      files/sha256-<hash>.md     extracted text, a "[[page N]]" line before each page
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

- **On install:** cache the shell and *all* locale files (a few KB each), so switching language is instant, even offline. Files are fetched through the HTTP cache, which the page has just filled, and checked against the integrity hashes in `capabilities.json`; a stale copy is fetched again from the network.
- **On unlock:** cache the capability's files, listed in `capabilities.json`, which `scripts/manifest.js` generates with content hashes. The cache itself is the record of what has been unlocked.
- **On update:** download the new shell and new versions of *unlocked* capabilities only, then delete old caches.
- **Model weights** live in their own cache, separate from app versions, so an app update never re-downloads 3 GB.
- **Offline:** history, files and the on-device brain keep working. If only a cloud brain is connected, Jean says so plainly.

## Security

Two HTML documents, each with its own CSP in a `<meta>` tag, which works on any static host.

**`index.html`** runs only Jean's own code:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-<import map>'; style-src 'self';
img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self';
connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*;
worker-src 'self' blob:; manifest-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
require-trusted-types-for 'script'; trusted-types lit-html app-urls
```

- **Why `connect-src` is broad:** users can add any OpenAI-compatible endpoint, and untrusted code never runs in this document. Organisations tighten it with an HTTP header (see [enterprise.md](enterprise.md)).
- **If an on-demand runtime turns out to need `'unsafe-eval'`,** give it its own worker document rather than loosening `index.html`.

**`sandbox.html`** is loaded in `<iframe sandbox="allow-scripts">` (never with `allow-same-origin`):

- **No access to Jean's storage.** Its origin is opaque.
- **Untrusted code only ever runs in a Worker** created from a `blob:` URL, so it inherits the sandbox's strict CSP. Workers have no navigation, no WebRTC and no `sendBeacon`, so every network path goes through `connect-src`.
- **Pyodide and QuickJS both run here.** QuickJS also restricts code to the functions Jean hands it, with memory and time limits.
- **Where Pyodide's files come from** (D43): Jean's own pinned `pyodide` npm package, copied into `vendor/pyodide/` by `npm run dev`, `npm start` and `npm run build`. They are never committed and never taken from outside Jean's folder. The capability manifest lists them under the Python capability, never in the shell.
- **Engineering spike (0.4):** choose between two ways of giving Pyodide its files inside the sandbox.
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
- **Translation.** An LLM translates from English with a script. There are about 150 strings, and no per-language human review (D44): anyone can fix a string with a PR.
- **Shipped so far:** en, fr, ar, ja (Japanese early, for CJK checks: D60).
- **Launch languages (33):** am, ar, bn, de, en, es, fa, fr, ha, he, hi, id, it, ja, ko, mr, ms, nl, pl, pt, ru, sw, ta, te, th, tl, tr, uk, ur, vi, yo, zh-Hans, zh-Hant.
- **Conversations.** The system prompt stays in English, with a `<language>` section. Changing the UI language mid-conversation appends a system note rather than editing that section (D46), and Jean's next reply follows.

## Prompt, tools and caching

pi 1.0 adopted four mechanisms on 2026-10-01: mid-conversation system messages, deferred tool loading, codemode and cache warming. Here they are, fitted to Jean. They share one idea: what the brain has already read never changes, so providers can cache it and on-device runtimes can keep it in memory.

**A frozen prefix (D46).** When a conversation starts, Jean fixes the system prompt and the list of declared tools. Neither changes until the conversation ends. Providers cache prompts by prefix (Anthropic reads tools, then system, then messages), so a single changed byte at the front re-bills the whole conversation. On-device, the same rule lets the runtime keep its KV cache between turns, which matters most on weak graphics chips.

**System notes (D46).** When something changes mid-conversation, Jean appends a system note to the transcript at that point instead of editing the prompt. Changes include the language, rules, instructions, memory, the project, newly unlocked tools and the date.

- **Recorded in the transcript.** A note is a record in the conversation JSONL, an ACP extension update (`_system_note`) holding the English text the brain sees and structured data for the UI label. Replaying the file rebuilds exactly what the brain was told, and when.
- **Rendered per adapter:**
  - **Anthropic,** on models that accept it: a `role: "system"` message, placed after the next user message as the API requires.
  - **OpenAI and OpenRouter:** a `system` message where the note falls.
  - **Other servers and the on-device brain,** whose chat templates allow a system message only at the start: a tagged block at the top of the next user turn.
- **Never deleted.** Removing an earlier note is an edit, and an edit would break the cache from that point on.

**Deferred tools (D47).** The conversation declares only the tools that were unlocked when it started. Anything that arrives later is deferred: a capability discovered mid-conversation, and every connection's tools (connections can bring hundreds).

- **Finding them.** `find_tools(query)` searches deferred tools by name and description, with the same BM25 engine as document search. It returns their signatures.
- **Calling them.** Deferred tools are called through codemode, so the declared list never changes. If codemode isn't loaded yet, `find_tools` declares the tools it found from the next request on, at the cost of one cache miss.
- **Native deferral.** Where a provider supports it (Anthropic's `defer_loading` with tool additions), the adapter may use it instead. The behaviour stays the same.
- **The next conversation** declares the newly unlocked capability's tools directly. Connection tools stay deferred unless the user pins them.

**Codemode (D48).** The `run` tool (Calculations) executes a JavaScript snippet in QuickJS. Inside it, Jean exposes what the user has granted, and nothing else, as async functions:

| Global | What it does |
|---|---|
| `tools.<name>(args)` | Calls any granted tool: Jean's own, and connection tools, deferred ones included |
| `searchTools(query)` | Same as `find_tools`, from inside a script |
| `models.decide(state, questions)` | Asks a decision model: Kev on the device, or Jev when a cloud brain is connected (the [Reflexes](#reflexes) shape) |
| `models.image(prompt)` | Generates an image with the connected provider's image model |

- **Same rules.** Every nested call goes through Do it / Ask me first / Never. A call that needs approval pauses the script until the user answers.
- **Visible.** Each nested call shows in the activity view as a child of the `run` call.
- **Keys stay outside.** The script runs in the sandbox (see [Security](#security)). Each call crosses to Jean as a message, and Jean makes it with its own keys, so the sandbox never sees a secret.
- **Direct calls stay.** Declared tools remain callable without code, because small brains call tools more reliably than they write scripts. Codemode pays off with strong brains, many tools and data-heavy work.
- **Short description.** The `run` tool line names each global in one line and points to a reference the brain reads only when it needs it, like a routine.

**Thinking blocks are kept (D54).** Anthropic's thinking blocks are stored on each step's brain entry and replayed unchanged to the model that wrote them, because current models bind them to the conversation: dropping them is an edit, which costs the cache from that point on.

**Prompt caching and warming on Anthropic (D49).**

- **Breakpoints.** One explicit `cache_control` breakpoint on the last block of the system prompt, plus top-level automatic caching for the growing conversation.
- **Warming.** When the user starts typing in a conversation whose cache has probably expired, Jean sends the same prefix with `max_tokens: 0`, unstreamed. "Probably expired" means no request for about 5 minutes, the default cache lifetime.
  - The API writes the cache and returns no content, so the real reply starts sooner.
  - The warm-up repeats the real request's thinking and effort settings, so the cache it writes is the one the reply reads.
  - Its breakpoint sits on the last message already in the conversation, never on the placeholder.
  - **Skipped** when the prefix is below the model's minimum cacheable size (a short new conversation) or a request went out recently.
- **Other providers.** OpenAI caches automatically. Local servers keep their own KV cache, which the frozen prefix keeps valid.
- **On the device (D58).** The brain's worker keeps the text and tokens it has read; a prompt that continues them only reads the new part. A follow-up question about a long document starts as fast as a short one.

## Retrieval and extraction

- **Extraction:**
  - DOCX, XLSX and PPTX are zip files of XML: about 100 lines with `DecompressionStream` and `DOMParser`.
  - PDFs use pdf.js, loaded on demand.
  - Scans and images go to the brain's vision ability (Gemma 4 E2B accepts images).
- **Retrieval, without a vector database:**
  1. If a document fits within about 25% of the active brain's context, include it whole. Provider prompt caching makes that cheap. Otherwise its first pages go in, up to that budget, and the `read(file, pages)` tool reaches the rest. The choice is made once, when the message is sent, and recorded on the file's link, so the prefix never changes (D55).
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
- [Gemma 4 WebGPU](https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU) · [gemma-4-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) · [kev-0.6b-ONNX](https://huggingface.co/onnx-community/kev-0.6b-ONNX)
- [pi system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts) · [Pi 1.0](https://earendil.com/posts/pi-1-0/) · [pi codemode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md)
