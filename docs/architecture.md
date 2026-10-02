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

**First load without a bundle.** `npm run manifest` writes a `<link rel="modulepreload">` into `index.html` for every module the first load imports, so the browser fetches the whole graph in one round trip instead of discovering it one import level at a time. Only the lit-html files Jean imports are vendored. CI fails if the links are stale. The first screen loads only what it shows: the dialogs, the Anthropic adapter (D76), and since 0.5 the agent loop and the other adapters (D94) load when first needed.

| Loaded upfront (3) | Size | Why |
|---|---|---|
| `@preact/signals-core` | ~1.6 KB | State: language, conversation, unlocked capabilities. Switching language is one signal. |
| `lit-html` | ~3.5 KB | Efficient streaming updates; never uses `eval`; works with Trusted Types |
| `marked` (lexer only) | ~12 KB | Its tokens are rendered as lit-html templates, so no `innerHTML` and no XSS entry point |

| Loaded on demand | Used by |
|---|---|
| `quickjs-emscripten-core` with the `@jitl/quickjs-wasmfile-release-sync` variant (~600 KB with its wasm) | Calculations and codemode. Copied flat into `vendor/quickjs/` and handed to the sandbox by the parent (D65, D66) |
| `pyodide` 314.0.7 (about 13 MB: loader, runtime, standard library, lock file) | Data toolkit (Python), in its own sandbox document. Copied into `vendor/pyodide/` by `npm run dev`, `npm start` and `npm run build`, never committed (D43, D80) |
| `@huggingface/transformers` with `onnxruntime-web` | On-device brain (Gemma 4 E2B), reflexes (Kev-0.6B), dictation and live conversation (Whisper base, and Silero for voice detection). Copied into `vendor/transformers/` (D52) |
| `pdfjs-dist` (legacy build) | Reading PDFs. Copied into `vendor/pdfjs/` with its character maps and standard fonts (D52) |
| `kokoro-js` | Optional natural voices |
| No MCP SDK: Jean's own client, `caps/connections/mcp.js` (about 150 lines, both protocol eras, D87) | Connections |

**Built on browser features, no dependency:**

- **Text extraction** from DOCX/XLSX/PPTX: zip via `DecompressionStream` and a small tag scanner (not `DOMParser`, so it also runs in workers and under `node --test`).
- **Backup zip writer:** `CompressionStream`.
- **BM25 search** (`core/search.js`): with `Intl.Segmenter` for word splitting. It ranks deferred tools and past conversations (`recall`), and `alike()` tells requests of the same kind apart (D83).
- **ULIDs:** generated with `crypto.getRandomValues`.
- **Voices:** operating-system voices.
- **Coordination:** Web Locks and BroadcastChannel.

**Routing is one hash** (`#/c/<conversation ulid>`, D59; in a project other than home, `#/p/<project ulid>/c/<conversation ulid>`, D82), read by `ui/router.js`: enough to reload or go back to the same conversation, on any static host.

**Components are custom elements (light DOM, prefix `app-`).** Each capability is one module that defines its elements and registers its tools. Unlocking means calling `import()`, and any `<app-chart>` already on the page upgrades automatically. `:not(:defined)` styles undiscovered elements. The browser itself provides progressive discovery.

**Why not the alternatives:**

- **htmx** assumes a server that returns HTML, and Jean has none. Faking one in the service worker would move the app into it, fight token streaming, and `hx-on` relies on `eval`, which the CSP forbids.
- **React or Preact** components aren't standard elements, and they would need a build step or `htm`.
- **VanJS** is smaller still, but custom elements are needed for lazy upgrades anyway.
- **Alpine.js** needs `eval`.

## Layout

```
index.html        CSP <meta>, light or dark (D85), import map, shell
sandbox.html      strict CSP <meta> and a hash-allowed relay; runs untrusted code in a worker (D65); Python's twin is caps/python/sandbox.html (D80)
sw.js             offline cache, per-capability caching
brand.js          export const BRAND = { name, domain }
core/             llm.js anthropic.js images.js loop.js fs.js files.js extract.js zip.js backup.js prompt.js events.js i18n.js
                  deferred.js search.js decide.js memory.js skills.js … types.d.ts   (standard web APIs only)
ui/               base element, shell, chat, activity view, caps.js (the unlock gate), style.css,
                  discovery.js collection.js auto.js picker.js, dialogs.js and brains.js (loaded when a dialog opens, D76),
                  knows.js ("What Jean knows about you", 0.4), sandbox.js (the sandbox client, 0.4)
caps/             files/ made/ backup/ brain-local/ voice/        (0.2)
                  compute/ reflexes/                            (0.3; reflexes/questions.js is the question catalogue)
                  memory/ projects/ routines/ python/           (0.4)
                  search/ connections/ live/                    (0.5; connections/ holds the MCP client, mcp.js, and sign-in, auth.js)
                  helpers/                                      (later)
locales/          the 33 launch languages: en.json fr.json ar.json ja.json …
vendor/           signals-core, lit-html, marked (+ the on-demand ones); generated from node_modules, never committed
scripts/          vendor.js, manifest.js (content hashes → capabilities.json; generated, never committed), graph.js, budgets.js, serve.js,
                  reflexes.js (measures Kev on the test set)
test/             node --test suites; fixtures/fake-brain.js and fake-mail.js (an MCP mail service with OAuth sign-in);
                  reflexes/ (the multilingual reflex test set and results.md)
e2e/              Playwright smoke tests, Chromium and WebKit (npm run e2e)
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

- **`loop.js`** (~220 lines): stream the reply, run tool calls, feed results back, repeat. Rules (Do it / Ask me first / Never) are checked before each tool runs, including calls made from scripts. The prompt and the declared tools are frozen for the conversation; changes arrive as system notes (see [Prompt, tools and caching](#prompt-tools-and-caching)).
  - `tools` is every tool that can be called; it may be a function, read again at each step, so a capability turned on mid-turn can be called at once. `declared` is the subset the brain sees, and `hidden` tools are never declared (D64).
  - `meta` is recorded on the brain entry; Auto uses it to say why it chose that brain (D70).
  - Sources are numbered from `firstSource`: tools call `ctx.cite()`, and the brain's own search sends `cite` events that become ` [n]` after the cited text; both are recorded as `_meta.sources` (D90). A tool can record more in `ctx.meta` (a picture). A `pause` from the provider (Anthropic's `pause_turn`) is sent back and resumed.
- **`llm.js`** (~320 lines) and **`anthropic.js`** (~240): two adapters, OpenAI-compatible Chat Completions and Anthropic Messages, over fetch and SSE. Together they reach almost every model. `llm.js` imports `anthropic.js` the first time an Anthropic brain is used (D76). pi-ai serves as a reference implementation but is not a dependency, because it pulls in three official SDKs.
  - Anthropic from the browser needs the `anthropic-dangerous-direct-browser-access: true` header.
  - OpenRouter supports an OAuth PKCE login that runs entirely in the browser.
- **Tools**, contributed by capabilities: `read`, `write`, `edit`, `run`, `python`, `search`, `web_search`, `recall`, `remember`, `routine`, `save_routine`, `fetch`, `offer`, `delegate`, `find_tools`, plus connection tools (deferred, D89). Three hidden tools, `file`, `decide` and `image`, are only for scripts (D64, D92). Built so far: `read`, `run`, `python`, `web_search`, `find_tools`, `offer`, `remember`, `recall`, `routine`, `save_routine`, `file`, `decide`, `image`, and every connection's tools.
- **`images.js`** (0.5): pictures from the provider's image model, for `models.image` (D92), imported on first use.
- **`events.js`:** the ACP event stream (see [Activity events](#activity-events)), and `splitSuggestions()`, which hides the brain's `<suggestions>` block from the answer (D69).
- **`deferred.js`:** `find_tools`, tool signatures, and `reach`, which says how to call a tool that isn't declared (D63).
- **`search.js`:** BM25 over short texts.
- **`decide.js`:** the reflex mechanism: Kev's input sequence and its answers in the Decisions API shape (see [Reflexes](#reflexes)). The questions themselves are product policy and live in `caps/reflexes/questions.js` (D62).
- **`skills.js`** (0.4): reads and writes `SKILL.md` folders (routines, D83); only their name and description go into the prompt, and the `routine` tool reads the steps when relevant.
- **`memory.js`** (0.4): the `memory.md` format, one line per entry with where it came from, and the newest lines that fit the prompt (D79).
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
// ui/discovery.js, with the questions from caps/reflexes/questions.js
const { demand, personal, capability } = await decide(message, {
  demand:     { type: 'score',  instructions: 'How demanding is this request?', criteria: ['a quick chat or a simple fact', 'reading, writing or summarising', 'several steps of work or analysis', 'expert reasoning'] },
  personal:   { type: 'noul',   instructions: 'Does the message share personal, health, financial or confidential information?' },
  capability: { type: 'choice', instructions: 'Which of these would help with this message, if any?', criteria: { compute: 'exact numbers, maths, or analysing a table of data', none: 'nothing new is needed' } },
})
```

The mechanism is in `core/decide.js`; which questions are asked, and how answers are read, is product policy in `caps/reflexes/questions.js` (D62). In the UI, reflexes are called **Intuition**.

| Backend | When |
|---|---|
| **Kev-0.6B** through Transformers.js | Default (D41), built in 0.3 (D67): q4f16 on WebGPU when the adapter has `shader-f16`, otherwise q4 on WebAssembly. About 345 MB, downloaded once with consent; no extra runtime, because it shares the on-device brain's library. About 60 ms per message on WebGPU after warm-up. |
| Jev through OpenRouter | When a cloud brain is connected (browser calls with the user's key are untested) |
| Ollaya (local server) | Advanced users |
| The brain itself, with constrained JSON | Last resort |

**How Kev is asked (D67).** All of a state's questions go into one forward pass: the state, then each question with its options between Kev's delimiters, whose ids come from its `config.json` (the model card's sample code escapes them by mistake, which makes every score flat). Each option's score is softmaxed within its question. A score is read as its most likely level, not its expected value, because Kev hedges toward the middle. A yes, or an offer, needs 0.6. Every message gets one pass for demand, personal and capability, and a second for "unhappy" with the previous answer; both are capped at 2.5 s.

**Measuring Kev.** Kev was trained in English on a multilingual base (Qwen3), so it has to prove itself in every launch language:

1. ✅ Build a multilingual test set: `test/reflexes/<lang>.json`, 40 labelled examples per launch language (personal, unhappy, demand and capability 8 each; table and email 4 each), machine-translated from the English source. There is no native-speaker review (D44).
2. ✅ Measure Kev on it, language by language: `npm run reflexes` runs Kev on the CPU under Node, with Jean's own questions and thresholds, and writes [test/reflexes/results.md](../test/reflexes/results.md).
3. Where Kev falls short, fine-tune a "Jean reflexes" checkpoint from it on synthetic multilingual data and publish it under Apache 2.0.

**What the measurement showed (D68):** 53–78% by language, 67% overall. Table is reliable everywhere (95%); capability and email are fine in the major languages. Personal and unhappy are near chance, because Kev mostly says no, so Jean behaves as if Intuition were off for them: harmless, but useless. The low-resource languages (Amharic, Hausa, Swahili, Yoruba, Malay) score lowest. Rewording showed the 0.6B model can't judge "wordy" or "jargon" at all. Step 3 is needed before launch.

The test set is the lasting asset, because this category will change monthly.

**Reflex questions:**

| Question | Type | Status |
|---|---|---|
| Which capability, if any, would help? | choice | 0.3 |
| How demanding is the request? | score | 0.3 |
| Personal, health, financial or confidential content? | yes/no | 0.3 |
| Is the user unhappy with the last answer? | yes/no | 0.3 |
| Does this text compare numbers across several items? ("As a table") | yes/no | 0.3 |
| Is this a decision or announcement to pass on? ("Draft an email") | yes/no | 0.3 |
| Does this need current information from the web? | yes/no | Later |
| A lasting fact, preference or correction? (offers Memory) | yes/no | 0.4 |
| About the person in general, or about this project? | choice | Later |
| Same kind of task as an earlier one? | yes/no | Later |
| Is this action irreversible? | score | Later |
| Does this passage help answer the question? (re-ranking) | yes/no | Later |
| Does source [n] support this sentence? | yes/no | Later |
| Is this a separate ongoing project? | yes/no | Later |

Follow-ups are one yes/no question each rather than one choice over the catalogue, because several can fit (D69).

## Data and persistence

```
/                                OPFS root (or a mirrored real folder)
  settings.json
  instructions.md                global, written by the user (front matter: format; body: the instructions)
  memory.md                      global, curated by Jean: "- line <!-- at=… by=… conversation=… -->" (D79)
  skills/<name>/SKILL.md         global routines (Agent Skills; metadata: format, author, created, D83)
  projects/
    <ulid>-<slug>/
      project.md                 front matter: format, name, colour, default (home), cloud: false, createdAt, by
                                 (later: assistantName, brain, rules; body: short persona)
      instructions.md
      memory.md                  this project's (the home project uses the global one)
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

- **On install:** cache the shell (`sandbox.html` included) and *all* locale files (a few KB each), so switching language is instant, even offline. Files are fetched through the HTTP cache, which the page has just filled, and checked against the integrity hashes in `capabilities.json`; a stale copy is fetched again from the network.
- **On unlock:** cache the capability's files, listed in `capabilities.json`, which `scripts/manifest.js` generates with content hashes. The cache itself is the record of what has been unlocked.
- **On update:** download the new shell and new versions of *unlocked* capabilities only, then delete old caches.
- **Model weights** live in their own cache, separate from app versions, so an app update never re-downloads 3 GB.
- **Offline:** history, files and the on-device brain keep working. If only a cloud brain is connected, Jean says so plainly.

## Security

Two HTML documents, each with its own CSP in a `<meta>` tag, which works on any static host.

**`index.html`** runs only Jean's own code:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-<import map>' 'sha256-<light or dark>'; style-src 'self';
img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self';
connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*;
worker-src 'self' blob:; manifest-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
require-trusted-types-for 'script'; trusted-types lit-html app-urls
```

- **Why `connect-src` is broad:** users can add any OpenAI-compatible endpoint, and untrusted code never runs in this document. Organisations tighten it with an HTTP header (see [enterprise.md](enterprise.md)).
- **If an on-demand runtime turns out to need `'unsafe-eval'`,** give it its own worker document rather than loosening `index.html`.

**`sandbox.html`** is loaded in `<iframe sandbox="allow-scripts">` (never with `allow-same-origin`). As built in 0.3 (D65):

```text
default-src 'none'; script-src 'sha256-<relay>' blob: 'wasm-unsafe-eval'; worker-src blob:;
connect-src 'none'; base-uri 'none'; form-action 'none'
```

- **No access to Jean's storage.** Its origin is opaque.
- **No network at all.** The document holds only a small inline relay, allowed by its hash; it loads nothing from anywhere, so how `'self'` behaves in an opaque origin never matters. `test/html.test.js` checks the hash and that the frame never gets `allow-same-origin`.
- **The parent sends everything in.** `caps/compute/compute.js` fetches the worker's source and QuickJS's files (their list comes from `capabilities.json`) and posts them to the relay.
- **Untrusted code only ever runs in a Worker** created from a `blob:` URL, so it inherits the sandbox's strict CSP. Workers have no navigation, no WebRTC and no `sendBeacon`, so every network path goes through `connect-src`.
- **A classic worker.** Browsers refuse module workers from `blob:` URLs in an opaque origin (checked in Chromium). A classic worker can still `import()` blob modules and compile wasm: it turns each QuickJS module into a blob URL, leaves first, and passes `wasmBinary` and `wasmLocation`, so Emscripten never resolves a URL against a `blob:` base.
- **QuickJS limits:** 64 MB of memory, 20 s of computing time (time spent waiting on Jean or on the user's approval doesn't count), a 40 s watchdog in the parent, 20 s to start, and 8,000 characters of output. A script reaches only the functions Jean hands it (see [Codemode](#prompt-tools-and-caching)).
- **Pyodide runs in a twin document** (0.4, D80): `caps/python/sandbox.html`, the same relay and policy plus `'unsafe-eval'`, which Pyodide's runtime needs when it starts (Emscripten builds some functions with `eval`). There is still nothing to steal and nowhere to send it, and Calculations keep the stricter `sandbox.html`.
- **Where Pyodide's files come from** (D43): Jean's own pinned `pyodide` npm package, copied into `vendor/pyodide/` by `npm run dev`, `npm start` and `npm run build`. They are never committed and never taken from outside Jean's folder. The capability manifest lists them under the Python capability, never in the shell.
- **How it gets them** (the 0.4 spike chose option (b), D80): the parent sends the files in, as for QuickJS, and the worker's `fetch` serves only those, under an address that never resolves; `connect-src 'none'` stays. Option (a), serving `vendor/pyodide/` with CORS to the sandbox, was not needed.
- **Python's limits:** the standard library only (no package can be fetched); `import js` reaches an empty object; no cap on memory or computing time inside Pyodide (it would need a cross-origin isolated page), so the parent's 40 s watchdog stops a script that goes quiet; 60 s to start. `ui/sandbox.js` is the client both runtimes share.

**Output previews** (charts, HTML) use separate iframes with `sandbox="allow-scripts"` only, and they never receive secrets.

## Languages (i18n)

- **Strings.** They live in `locales/<lang>.json`, with English as the source and `{name}` placeholders.
  - Plurals use `Intl.PluralRules` (Arabic has six forms).
  - Dates, numbers, lists and relative times use `Intl`.
  - Language names come from `Intl.DisplayNames`, so each language appears in its own name with no extra data.
- **Choosing.** `preferredLocales` matches `navigator.languages` to the catalogues on language and likely script (`Intl.Locale.maximize`), so `zh-TW` finds `zh-Hant`, `pt-BR` finds `pt` and `iw` finds `he`. The first match is the starting language, and the language menu lists every match first, in the browser's order, under "Your languages".
- **One catalogue per person.** `useLocale()` fetches only the chosen language's catalogue; English, the fallback, is fetched only when that one can't be (D76). The first-load budget counts the largest catalogue.
- **Instant switching.** The locale is a signal, so every bound piece of text re-renders. `<html lang dir>` flips with it, and CSS uses logical properties only, so right-to-left layouts mirror immediately.
- **Details that are easy to miss:**
  - Every message element gets `dir="auto"`, so an English reply renders correctly in an Arabic UI.
  - Enter never sends while an IME is composing (`isComposing`).
  - `Intl.Segmenter` handles counting and truncation in Chinese, Japanese, Korean and Thai.
  - Fonts: the system font for every script, plus the display face only where it applies (see [design.md](design.md)).
- **Translation.** An LLM translates from English. There are about 230 strings, and no per-language human review (D44): anyone can fix a string with a PR.
  - Sentences are rephrased so nothing agrees grammatically with `{name}` (in Polish, Russian, Ukrainian, Italian, Portuguese, Hebrew, Urdu, Hindi and Marathi, and with Korean particles, among others).
  - `test/locales.test.js` checks that every catalogue has the same keys and placeholders as English, that each plural covers every category the language uses (from `Intl.PluralRules`; current CLDR gives French a "many" form), and that the language menu matches the catalogues.
- **Shipped:** all 33 launch languages, since 0.3 (`LOCALES` in `ui/state.js`): am, ar, bn, de, en, es, fa, fr, ha, he, hi, id, it, ja, ko, mr, ms, nl, pl, pt, ru, sw, ta, te, th, tl, tr, uk, ur, vi, yo, zh-Hans, zh-Hant.
- **Conversations.** The system prompt stays in English, with a `<language>` section. Changing the UI language mid-conversation appends a system note rather than editing that section (D46), and Jean's next reply follows.

## Prompt, tools and caching

pi 1.0 adopted four mechanisms on 2026-10-01: mid-conversation system messages, deferred tool loading, codemode and cache warming. Here they are, fitted to Jean. They share one idea: what the brain has already read never changes, so providers can cache it and on-device runtimes can keep it in memory.

**A frozen prefix (D46).** When a conversation starts, Jean fixes the system prompt and the list of declared tools. Neither changes until the conversation ends. Providers cache prompts by prefix (Anthropic reads tools, then system, then messages), so a single changed byte at the front re-bills the whole conversation. On-device, the same rule lets the runtime keep its KV cache between turns, which matters most on weak graphics chips.

**System notes (D46).** When something changes mid-conversation, Jean appends a system note to the transcript at that point instead of editing the prompt. Changes include the language, rules, instructions, memory, routines, the project, newly unlocked tools and the date.

- **Sections (D81).** The project, instructions, memory, routines and, since 0.5, the connected services (`<connections>`, D89) are sections of the frozen prompt; the prompt state keeps a fingerprint of each, and a section that changed arrives whole in a note ("The <memory> section is now: …").

- **Recorded in the transcript.** A note is a record in the conversation JSONL, an ACP extension update (`_system_note`) holding the English text the brain sees and structured data for the UI label. Replaying the file rebuilds exactly what the brain was told, and when.
- **Rendered per adapter:**
  - **Anthropic,** on models that accept it: a `role: "system"` message, placed after the next user message as the API requires.
  - **OpenAI and OpenRouter:** a `system` message where the note falls.
  - **Other servers and the on-device brain,** whose chat templates allow a system message only at the start: a tagged block at the top of the next user turn.
- **Never deleted.** Removing an earlier note is an edit, and an edit would break the cache from that point on.

**Deferred tools (D47).** The conversation declares only the tools that were unlocked when it started. Anything that arrives later is deferred: a capability discovered mid-conversation, and every connection's tools (connections can bring hundreds).

- **Always findable.** `find_tools` and `offer` come from the `discovery` capability, which is always loaded, so every new conversation declares them (D63).
- **Finding them.** `find_tools(query)` ranks the tools that aren't declared by name and description, with the BM25 engine in `core/search.js`, and returns up to five signatures (`name({ file: string, pages?: string }): what it does`).
- **The note.** A capability turned on mid-conversation adds the system note "New tools can be found with find_tools: run." (`data: { kind: 'tools', added, deferred: true }`). A conversation from 0.2, which has no `find_tools`, gets "New tools are available: …" and the tools declared instead.
- **Calling them.** With `run` declared, deferred tools are called from a script, so the declared list never changes. Otherwise `find_tools` (or an accepted offer) declares the tools it found from the next request on, at the cost of one cache miss. The tool call records this as `_meta.declare`, so replaying the transcript rebuilds the declared list.
- **Hidden tools** are never declared and exist only for scripts: `file` (a shared file's whole text) and `decide` (the reflexes) (D64).
- **Native deferral.** Where a provider supports it (Anthropic's `defer_loading` with tool additions), the adapter may use it instead. The behaviour stays the same.
- **The next conversation** declares the newly unlocked capability's tools directly. Connection tools stay deferred (`deferred: true`): `<connections>` names them, `find_tools` finds them, a script calls them (D89). Pinning a connection's tools comes later.

**Codemode (D48).** The `run` tool (Calculations) executes a JavaScript snippet in QuickJS. Top-level `await` works, and the result is what the script returns or, as in a console, its last expression. Inside it, Jean exposes what the user has granted, and nothing else:

| Global | What it does |
|---|---|
| `file(name)` | The whole text of a shared file (spreadsheets as tab-separated rows), through the hidden `file` tool |
| `csv(text)` | Turns CSV or tab-separated text into rows: objects keyed by the header, numbers as numbers |
| `tools.<name>(args)` | Calls any granted tool, deferred ones included; later, connection tools too. `run` and `offer` can't be called from a script. |
| `searchTools(query)` | Same as `find_tools`, from inside a script |
| `models.decide(state, questions)` | Asks Kev on the device, when Intuition is on, through the hidden `decide` tool (the [Reflexes](#reflexes) shape); Jev when a cloud brain is connected, later |
| `models.image(description)` | Makes a picture with the image model of a connected brain's provider, kept in the project's files and shown under the answer, through the hidden `image` tool (0.5, D92) |

- **Same rules.** Every nested call goes through Do it / Ask me first / Never (`ctx.call` in `core/loop.js`). A call that needs approval pauses the script until the user answers, and that wait doesn't count against its computing time.
- **Visible.** Each nested call carries `_meta.parent` and shows in the activity view as a child of the `run` call.
- **Out of the brain's context.** `toChatMessages` leaves nested calls out: the script's result already holds what matters (D64).
- **Keys stay outside.** The script runs in the sandbox (see [Security](#security)). Each call crosses to Jean as a message, and Jean makes it with its own keys, so the sandbox never sees a secret.
- **Direct calls stay.** Declared tools remain callable without code, because small brains call tools more reliably than they write scripts. Codemode pays off with strong brains, many tools and data-heavy work.
- **Short description.** The `run` line in the prompt is one sentence; the tool's own description names each global.

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
- **Source numbers (D71).** When a message is sent, each shared file gets a number on its link (`_meta.source`), kept if the same file was shared before. The brain sees `<document source="n" name="…">`, and `read` output starts with "Source [n]:". The UI turns `[n]` into a chip only when n is a known source; clicking it opens the file.
- **Sources from tools and the web (D90).** Each turn continues the numbering. A connection's result lists every page, email or document it brings in as "Source [n]: …" (a result that names none is one source); Wikipedia's results do the same; the brain's own search cites pages, and the loop writes ` [n]` after the cited text. Chips for web pages open them in a new tab; others show their title. A "Sources" list follows the answer.

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
- **Outside the vocabulary:** a connection's tools that change something, such as sending an email, use `kind: "other"`; read-only ones use `fetch` (D89). The brain's own web searches are shown from its kept blocks, under the brain entry.
- **Reflex decisions** shown to the user appear as collapsed `think` entries. Auto's choice is recorded on the brain entry (`rawInput.auto: { level, reason }`) and shown in plain words, such as "kept on this device: personal content" (D70).
- **A script's calls** are tool calls with `_meta.parent` set to their `run` call, shown nested under it.
- **Helpers** are child sessions, referenced from the parent's tool call.
- **Enterprise audit:** a ~50-line adapter maps the stream to OpenTelemetry GenAI conventions (`invoke_agent`, `execute_tool`, `chat`).
- **AG-UI** is the better fit when a UI fronts an agent running on a server, which Jean's is not. A bridge from ACP to AG-UI exists if that is ever needed.

## Web search

In order of preference:

1. The connected brain's own search. Built in 0.5 (D91): the `web_search` tool is marked `native`, and the adapter declares the provider's own tool in its place: Anthropic's `web_search_20260209` (dynamic filtering) from Claude 4.6 on and `web_search_20250305` before, or OpenRouter's `openrouter:web_search`. Anthropic's search blocks are kept on the brain entry and replayed as received; an organisation that turned search off gets Wikipedia instead.
2. Wikipedia, which browsers can call directly: built in 0.5, in the user's language, for every other brain, the device's included. Its address is `DEFAULT_URLS.wikipedia`, replaceable in settings or policy (`urls.wikipedia`).
3. An endpoint set in settings or policy (SearXNG with CORS enabled, or Brave, Tavily or Exa with the user's keys): later.

There is no Jean proxy by default. Fetching an arbitrary URL hits the same CORS wall and follows the same order.

## Connections (MCP)

Built in 0.5 (D87–D89). A connection is an address and, when the service asks for one, a key or a sign-in.

- **The directory** (`caps/connections/directory.js`, D95) lists the services Jean knows: tiles for those a browser can reach and sign in to, and a muted list of the ones that can't yet. Policy merges into it by `id`: an address (a gateway), a `clientId` used instead of dynamic registration, `hidden`, `ready`. `npm run directory` checks every entry from an unknown origin, without registering anything.
- **The client** (`caps/connections/mcp.js`) speaks Streamable HTTP: the stateless 2026-07-28 revision first, and the `initialize` handshake and session of 2025-03-26 to 2025-11-25 when a server answers like an earlier one.
- **Signing in** (`caps/connections/auth.js`) follows MCP authorization from the browser: protected resource and authorization server metadata, dynamic registration as a public client, PKCE with a `resource` indicator, the `iss` check. The redirect comes back to Jean's own address with `?state=`. Client ID Metadata Documents wait for the domain (D27).
- **Secrets.** Keys and tokens are encrypted in `.secrets/` like brain keys, never backed up; tokens are renewed before they expire.
- **Tools** are named `<service>_<tool>`, deferred, and listed in `<connections>`. A read-only tool is "Using the internet" (`fetch`); any other is "Sending and sharing" (`other`); both ask first by default. Policy can add connections (`connections`).
- **The browser's limits.** A service has to answer with CORS for a browser to reach it, and expose `Mcp-Session-Id` (2025 sessions) and, ideally, `WWW-Authenticate`. When it doesn't, Jean says it couldn't connect; there is no proxy (D23).

## Voice pipeline

- **Speech to text:** a Whisper-class model through Transformers.js (shared runtime), or Chrome's on-device recognition where available.
- **Text to speech:** `speechSynthesis` with local voices, or Kokoro.
- **Live conversation** (0.5, D93): an AudioWorklet feeds 16 kHz audio to Silero voice detection (~2 MB ONNX) in dictation's worker → Whisper → the brain (streamed) → the system's voices, sentence by sentence. A turn starts after 250 ms of speech and ends after 800 ms of silence; speaking over Jean for half a second interrupts it. `caps/live/turns.js` holds the turn-taking, tested under `node --test`.
- **Real-time speech models** come from the provider (OpenAI Realtime over WebRTC, Gemini Live); `wss:` is already allowed in `connect-src`.

## Sources

- [Can I Use: createWritable](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable) · [Can I Use: createSyncAccessHandle](https://caniuse.com/mdn-api_filesystemfilehandle_createsyncaccesshandle) · [PowerSync: SQLite persistence on the web](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) · [On-device speech recognition explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md)
- [ACP: tool calls](https://agentclientprotocol.com/protocol/tool-calls) · [ACP: plans](https://agentclientprotocol.com/protocol/agent-plan)
- [Gemma 4 WebGPU](https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU) · [gemma-4-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) · [kev-0.6b-ONNX](https://huggingface.co/onnx-community/kev-0.6b-ONNX)
- [pi system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts) · [Pi 1.0](https://earendil.com/posts/pi-1-0/) · [pi codemode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md)
