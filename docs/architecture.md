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

**First load without a bundle.** `npm run manifest` writes a `<link rel="modulepreload">` into `index.html` for every module the first load imports, so the browser fetches the whole graph in one round trip instead of discovering it one import level at a time. Only the lit-html files Jean imports are vendored. CI fails if the links are stale. The first screen loads only what it shows: the dialogs, the Anthropic adapter (D76), since 0.5 the agent loop and the other adapters (D94), since D140 Auto's choice of a brain, and since D148 the rest of what a message needs on its way (`ui/send.js`: the prompt, what the brain reads of the files, the run and its approvals, cache warming) load when first needed, sending as soon as the user types.

| Loaded upfront (3) | Size | Why |
|---|---|---|
| `@preact/signals-core` | ~1.6 KB | State: language, conversation, unlocked capabilities. Switching language is one signal. |
| `lit-html` | ~3.5 KB | Efficient streaming updates; never uses `eval`; works with Trusted Types |
| `marked` (lexer only) | ~12 KB | Its tokens are rendered as lit-html templates, so no `innerHTML` and no XSS entry point |

| Loaded on demand | Used by |
|---|---|
| `quickjs-emscripten-core` with the `@jitl/quickjs-wasmfile-release-sync` variant (~600 KB with its wasm) | The Computer's JavaScript: `javascript` (codemode) and `node`. Copied flat into `vendor/quickjs/` and handed to the sandbox by the parent (D65, D66, D162) |
| `pyodide` 314.0.7 (about 13 MB: loader, runtime, standard library, lock file) | The Computer's Python: `python`, `python3`, `pip` (packages from a registry, through Jean). Copied into `vendor/pyodide/` by `npm run dev`, `npm start` and `npm run build`, never committed (D43, D80, D162) |
| `just-bash` 3.6.0 (its browser build, 353 KB gzipped), with `diff`, `sprintf-js`, `turndown` and `fflate` | The Computer's shell: bash and its commands over a virtual filesystem, in the sandbox's worker. Copied flat into `vendor/just-bash/`, the CommonJS ones wrapped as modules (D162) |
| `@huggingface/transformers` with `onnxruntime-web` | On-device brain (Gemma 4 E2B), reflexes (Kev-0.6B), dictation and live conversation (Whisper base, and Silero for voice detection). Copied into `vendor/transformers/` (D52) |
| `pdfjs-dist` (legacy build) | Reading PDFs. Copied into `vendor/pdfjs/` with its character maps and standard fonts (D52) |
| `kokoro-js` | Optional natural voices |
| No MCP SDK: Jean's own client, `caps/connections/mcp.js` (about 150 lines, both protocol eras, D87) | Connections |

**Built on browser features, no dependency:**

- **Text extraction** from DOCX/XLSX/PPTX: zip via `DecompressionStream` and a small tag scanner (not `DOMParser`, so it also runs in workers and under `node --test`).
- **Backup zip writer:** `CompressionStream`.
- **BM25 search** (`core/search.js`): with `Intl.Segmenter` for word splitting. It ranks deferred tools and past conversations (`recall`), and `alike()` tells requests of the same kind apart (D83). Search as people type matches parts of words in a fold of the text as long as the text, case and accents aside (`fold()`, `ranges()`, D133).
- **ULIDs:** generated with `crypto.getRandomValues`.
- **Voices:** operating-system voices.
- **Coordination:** Web Locks and BroadcastChannel.

**Routing is one hash** (`#/c/<conversation ulid>`, D59; in a project other than home, `#/p/<project ulid>/c/<conversation ulid>`, D82; Settings open over either, `…/settings/<section>`, D137), read by `ui/router.js`: enough to reload or go back to the same conversation and the same section of Settings, on any static host.

**Components are custom elements (light DOM, prefix `app-`).** Each capability is one module that defines its elements and registers its tools. Unlocking means calling `import()`, and any `<app-chart>` already on the page upgrades automatically. `:not(:defined)` styles undiscovered elements. The browser itself provides progressive discovery.

**Why not the alternatives:**

- **htmx** assumes a server that returns HTML, and Jean has none. Faking one in the service worker would move the app into it, fight token streaming, and `hx-on` relies on `eval`, which the CSP forbids.
- **React or Preact** components aren't standard elements, and they would need a build step or `htm`.
- **VanJS** is smaller still, but custom elements are needed for lazy upgrades anyway.
- **Alpine.js** needs `eval`.

## Layout

```
index.html        CSP <meta>, light or dark (D85) and the look (D111) before the first paint, import map, shell
sandbox.html      strict CSP <meta> and a hash-allowed relay; runs untrusted code in a worker (D65): the Computer's (D162)
preview.html      an HTML file in the preview: a relay writes it in place of itself, under the policy Settings gives it, by default its own scripts and no network (D126, D143)
manifesto.html    MANIFESTO.md as a page, in English, with manifesto.css over ui/style.css; linked from Settings; no script but index.html's first-paint line
sw.js             offline cache, per-capability caching
brand.js          export const BRAND = { name, domain }
core/             llm.js anthropic.js loop.js fs.js files.js zip.js prompt.js events.js i18n.js
                  deferred.js search.js decide.js memory.js skills.js … types.d.ts   (standard web APIs only; a module only one
                  capability, or one part of the UI, uses lives with it, D96, D148)
ui/               base element, shell, chat, activity view, caps.js (the unlock gate), style.css, state.js, send.js (a message
                  on its way and its answer, loaded once the user types, D148),
                  discovery.js auto.js picker.js, dialogs.js (Settings, with the brains and the house in it, D113, D128, D134) and brains.js (loaded
                  when a dialog opens, D76), speech.js (read-aloud) and voices.js (the voice for each answer, loaded with it, D114;
                  language.js tells the answer's language and ranks the voices, tested in Node),
                  knows.js (Settings' About you, Skills and Routines, 0.4, D134), sandbox.js (the sandbox client, 0.4),
                  looks.js (the themes, D111), touches.js (the user's own, loaded once there are some), inbox.js (Mail's list),
                  preview.js and preview.css (a file, as what it is, beside the conversation; loaded when one first opens, D126;
                  csp.js writes a web page's policy, D143, tested in Node),
                  dock.js and dock.css (the side of the window the preview and the browser share, tiled and resized; loaded with the first, D144),
                  looks/mail.css looks/paper.css (each loaded when chosen, before style.css, which is the room)
caps/             files/ made/ backup/ brain-local/ voice/        (0.2; files/extract.js and backup/archive.js since D96)
                  reflexes/                                     (0.3; reflexes/questions.js is the question catalogue; compute/ was Calculations')
                  memory/ projects/ skills/                     (0.4; skills/ was routines/ until D115; python/ was the data toolkit's)
                  search/ connections/ live/                    (0.5; connections/ holds the MCP client, mcp.js, and sign-in, auth.js)
                  helpers/ check/ since/ names/                 (0.6; check/claims.js is Double-check's text work, tested in Node)
                  routines/                                     (0.7; routines/schedule.js and skills/sources.js, discovery indexes, tested in Node)
                  find/                                         (after 0.7: search, ⌘K, D133)
                  browser/                                      (after 0.7: pages beside the conversation, D140; browser.html frames
                                                                other sites, pages.js is tested in Node)
                  ask/                                          (after 0.7: questions for the user, always there, D146; answers.js
                                                                is tested in Node)
                  you/                                          (after 0.7: noting the user's name while there is none, always there, D150)
                  folders/                                      (0.8: a folder of the computer, D141, D149, D152; work.js lists,
                                                                finds, reads and changes, word.js changes a Word document in place,
                                                                copy.js is a folder's copy where it can't be opened in place,
                                                                site.js puts a page of it together for the browser (D156), all
                                                                tested in Node)
                  sync/                                         (after 0.8: Jean's files mirrored into a folder a drive syncs, D157;
                                                                mirror.js is a round on any two FS, tested in Node)
                  computer/                                     (after 0.8: a computer in the sandbox, D162; Calculations and the
                                                                data toolkit fold into it; computer-worker.js runs the shell,
                                                                QuickJS and Pyodide; mount.js keeps /workspace in step, net.js
                                                                judges and makes requests, both tested in Node)
locales/          the 33 launch languages: en.json fr.json ar.json ja.json …, dialogs/ with the dialogs' strings (D97), and browser/,
                  ask/, folders/, sync/ and computer/ with the browser's, the questions', Folders', Sync's and the Computer's own, loaded and cached with them (D140,
                  D146, D152, D157)
vendor/           signals-core, lit-html, marked (+ the on-demand ones); generated from node_modules, never committed
desktop/          dmg-background.svg, the macOS disk image's window, drawn when the image is made (D155)
scripts/          vendor.js, manifest.js (content hashes → capabilities.json; generated, never committed), graph.js, budgets.js, serve.js,
                  desktop.js (the desktop apps in dist/desktop/, with Neutralino, D155; never committed),
                  reflexes.js (measures Kev on the test set)
test/             node --test suites; fixtures/fake-brain.js and fake-mail.js (an MCP mail service with OAuth sign-in), keys.js (which
                  modules use which strings);
                  reflexes/ (the multilingual reflex test set and results.md)
e2e/              Playwright smoke tests, Chromium and WebKit (npm run e2e)
.gitlab-ci.yml    CI: npm run check and npm run e2e, side by side, in Playwright's image
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

- **`loop.js`** (~250 lines): stream the reply, run tool calls, feed results back, repeat; a tool can run a helper's turn under its call. Rules (Do it / Ask me first / Never) are checked before each tool runs, including calls made from scripts. The prompt and the declared tools are frozen for the conversation; changes arrive as system notes (see [Prompt, tools and caching](#prompt-tools-and-caching)).
  - `tools` is every tool that can be called; it may be a function, read again at each step, so a capability turned on mid-turn can be called at once. `declared` is the subset the brain sees, and `hidden` tools are never declared (D64).
  - `meta` is recorded on the brain entry; Auto uses it to say why it chose that brain (D70).
  - Sources are numbered from `firstSource`: tools call `ctx.cite()`, and the brain's own search sends `cite` events that become ` [n]` after the cited text; both are recorded as `_meta.sources` (D90). A tool can record more in `ctx.meta` (a picture). A `pause` from the provider (Anthropic's `pause_turn`) is sent back and resumed.
  - A tool's `check` (0.8, D152) runs before a call the rules don't refuse: it can ask even where they allow (a change in the user's folder), and give the card what it shows (the diff, as ACP `diff` content). What a run adds to `ctx.content` is kept on its record before its result, and `ctx.answer` is what the user answered.
  - Helpers (0.6, D98): a tool can run `ctx.turn()`, a child turn with the same brain, rules, approvals and source numbers (`numbers`), its own prompt, history and tools. Its brain entries and calls are recorded under the calling tool's record (ids prefixed with it, `_meta.parent`, no thinking blocks) at the parent's step; its text is the call's result.
- **`llm.js`** (~320 lines) and **`anthropic.js`** (~240): two adapters, OpenAI-compatible Chat Completions and Anthropic Messages, over fetch and SSE. Together they reach almost every model. `llm.js` imports `anthropic.js` the first time an Anthropic brain is used (D76). pi-ai serves as a reference implementation but is not a dependency, because it pulls in three official SDKs.
  - Anthropic from the browser needs the `anthropic-dangerous-direct-browser-access: true` header.
  - OpenRouter supports an OAuth PKCE login that runs entirely in the browser.
- **Tools**, contributed by capabilities: `read`, `write`, `edit`, `bash`, `javascript` (`run` until D162), `python`, `search`, `web_search`, `recall`, `remember`, `skill`, `save_skill`, `fetch`, `browse`, `offer`, `delegate`, `find_tools`, plus connection tools (deferred, D89). Three hidden tools, `file`, `decide` and `image`, are only for scripts (D64, D92); `helper` is hidden too, called by `delegate`. `ask_user` asks the user questions, from Jean or, saying which part it is for, from a helper (D98, D146); scripts can't call it. `save_name` notes the first name the user gives for themselves, offered only while they have never set one, and never to helpers (D150). `routine` and `save_routine` are hidden aliases of `skill` and `save_skill`, for conversations that declared them before D115. `schedule` makes a routine (D122); `suggest_skill` is deferred, found with `find_tools` (D121). Built so far: `read`, `write`, `edit`, `bash`, `javascript`, `python`, `web_search`, `browse` (D140), `find_tools`, `offer`, `remember`, `recall`, `skill`, `save_skill`, `suggest_skill`, `schedule`, `delegate`, `file`, `decide`, `image`, `helper`, `ask_user`, and every connection's tools. `write` and `edit` come with Things Jean made; Word and Excel files are written by `caps/made/formats.js` (D119). `list`, `find_in_files`, `open` and `change` work in the conversation's folder, deferred and named in `<folder>` (0.8, D141, D152).
- Pictures from the provider's image model, for `models.image` (D92), are `caps/compute/picture.js` since D96, imported on first use.
- **`events.js`:** the ACP event stream (see [Activity events](#activity-events)), and `splitSuggestions()`, which hides the brain's `<suggestions>` block from the answer (D69).
- **`deferred.js`:** `find_tools`, tool signatures, and `reach`, which says how to call a tool that isn't declared (D63).
- **`search.js`:** BM25 over short texts, and matching as people type (D133).
- **`decide.js`:** the reflex mechanism: Kev's input sequence and its answers in the Decisions API shape (see [Reflexes](#reflexes)). The questions themselves are product policy and live in `caps/reflexes/questions.js` (D62).
- **`skills.js`** (0.4): reads and writes `SKILL.md` folders (skills, D83, D115); only their name and description go into the prompt, and the `skill` tool reads the steps when relevant. A skill from elsewhere keeps its `source` and `digest` in its `metadata` (D121).
- **`memory.js`** (0.4): the `memory.md` format, one line per entry with where it came from, and the newest lines that fit the prompt (D79).
- Prompt: [prompts/system.md](../prompts/system.md).

## Brain ladder

1. **On this device:** Gemma 4 E2B, quantised to q4f16, through Transformers.js and WebGPU. Native tool calling, 140+ languages, image and audio input. About 3.1 GB for text, downloaded once with consent; the image and audio encoders follow the first time they're needed. The download screen offers "or start right now with a free account" alongside.
   - **Offered only where it runs:** WebGPU with `shader-f16`, enough memory (3–5 GB while answering) and enough free storage. Other devices, including Safari before 26 (no WebGPU), skip this rung.
   - **Not chosen:** Qwen3-0.6B. It is six times smaller, but too weak for multi-step tool use and document answers in most launch languages, and it can't read images. Kev covers the small, runs-everywhere slot (D42).
2. **One click:** OpenRouter or Hugging Face sign-in. No key to paste.
3. **Advanced:** the user's own key (OpenAI, Anthropic, Google Gemini, Vertex AI, Mistral AI, OpenRouter, Vercel AI Gateway, Hugging Face, Groq, Cerebras, Together AI, Fireworks AI, xAI; D136), or a local server (Ollama, LM Studio, any OpenAI-compatible endpoint).

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
| Does source [n] support this sentence? | yes/no | Asked of the brain that answered instead (Double-check, D100) |
| Is this a separate ongoing project? | yes/no | Later |

Follow-ups are one yes/no question each rather than one choice over the catalogue, because several can fit (D69).

## Data and persistence

```
/                                OPFS root (or a mirrored real folder)
  settings.json                  format 2 since D122: capability ids as they are now
  instructions.md                global, written by the user (front matter: format; body: the instructions)
  memory.md                      global, curated by Jean: "- line <!-- at=… by=… conversation=… -->" (D79)
  skills/<name>/SKILL.md         global skills (Agent Skills; metadata: format, author, created, D83; source, digest, D121)
  routines/<ulid>.md             the home project's routines (front matter: the schedule, lastRun; body: the request, D122)
  projects/
    <ulid>-<slug>/
      project.md                 front matter: format, name, colour, default (home), cloud: false, createdAt, by,
                                 assistantName (0.6); body: how its assistant should be (0.6); later: brain, rules, folder (its name, D149)
      instructions.md
      memory.md                  this project's (the home project uses the global one)
      skills/<name>/SKILL.md
      routines/<ulid>.md
      files/sha256-<hash>.<ext>  original
      files/sha256-<hash>.md     extracted text, a "[[page N]]" line before each page
      files/sha256-<hash>.meta.json
      conversations/<ulid>.jsonl
      workspace/                 the Computer's /workspace when no folder is open: the user's files, by their names (D162)
  .secrets/                      encrypted; never exported, synced or shared
  .cache/                        disposable: search index, thumbnails, skills indexes (skills/, a day each, D121), sync.json (D157)
```

There is always a default project, hidden until the Projects capability is discovered. One code path handles everything.

- **Writes.** A single storage worker writes with `createSyncAccessHandle`, which works in Safari 16.4+, Chrome 108+ and Firefox 111+. `createWritable` would require Safari 26+, and universal beats newest.
  - Conversations are append-only, so a crash costs at most a half-written last line, which is ignored on read.
  - Files that get rewritten whole are written to a temporary file first, then swapped in.
- **Several tabs.** Web Locks serialise writes per file; BroadcastChannel tells other tabs to refresh their signals.
- **A project's or a conversation's folder** (0.8, D141, D149, D152). A project can be opened on a folder of the user's computer, and so can a conversation, each keeping its own across visits; a new conversation starts on its project's. Its files are read and changed there, through an `FS` per folder in use (`folderFS` in `ui/opfs.js`), whose storage worker starts from the folder's handle instead of the private root (`root`): it writes with `createWritable`, without the temporary copy, which would show in the user's folder, and tells Jean's other tabs nothing. `stat` gives a file's size and `lastModified`, which a change checks against what the conversation read. The handles are kept in IndexedDB's `app-folders` under the ULID of the project or conversation they belong to, with the folders "Always allow" was given for; `project.md` (`folder`) and the conversation's `<folder>` section keep the folder's name, so a missing handle is asked for again by name. Tools work in the folder of the conversation that asked (D147). Everything in the tree above stays in the private file system. This needs Chromium; elsewhere a folder, picked or dropped, is a read-only copy for the visit (`caps/folders/copy.js`), and the files Jean changed are saved as one zip.
- **Format changes.** Every file carries a `format` version and is upgraded lazily when read.
- **Preventing loss:**
  - Browsers delete *all* of a site's data at once when they evict it, so call `navigator.storage.persist()`.
  - Encourage installing the app: Safari can wipe sites that haven't been visited for 7 days unless they are installed.
  - Offer backup early.
  - On Chrome and Edge, mirroring to a real folder is continuous backup, with the folder access that Folders brings (D141): built as Sync (D157), into a folder that a cloud drive keeps the same on the user's other computers.
  - Show usage in plain words ("Jean uses 340 MB on this device").
  - When space runs low, evict model weights first and never user data.
- **Secrets.** API keys and tokens are encrypted with a non-extractable `CryptoKey` kept in IndexedDB. They are never included in exports, syncs or shares. Nor are the folder handles of projects and conversations (D141, D149), which can't be kept in a file or encrypted: IndexedDB keeps them (D152).
- **Layout rules that keep sync possible:**
  - One file per entity, named by ULID and never renamed.
  - Attachments named by content hash.
  - No central index of record.
  - `author` and timestamps on every entity.
  - Only `core/fs.js` touches storage.

## Service worker

- **On install:** cache the shell (`sandbox.html` and `preview.html` included) and *all* locale files (a few KB each), so switching language is instant, even offline. Files are fetched through the HTTP cache, which the page has just filled, and checked against the integrity hashes in `capabilities.json`; a stale copy is fetched again from the network. The PNG icons drawn for installs stay out: only the browser or the system fetches them, once (D131).
- **On unlock:** cache the capability's files, listed in `capabilities.json`, which `scripts/manifest.js` generates with content hashes. The cache itself is the record of what has been unlocked.
- **On update:** download the new shell and new versions of *unlocked* capabilities only, then delete old caches. When the user lets it in, the new version takes the page's place where it was, behind a view transition that holds the page left until the new one is drawn (`ui/update.js`, D138).
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

**`sandbox.html`** is loaded in `<iframe sandbox="allow-scripts">` (never with `allow-same-origin`). As built in 0.3 (D65), with `'unsafe-eval'` for Pyodide since the Computer (D162):

```text
default-src 'none'; script-src 'sha256-<relay>' blob: 'wasm-unsafe-eval' 'unsafe-eval'; worker-src blob:;
connect-src 'none'; base-uri 'none'; form-action 'none'
```

- **No access to Jean's storage.** Its origin is opaque.
- **No network at all.** The document holds only a small inline relay, allowed by its hash; it loads nothing from anywhere, so how `'self'` behaves in an opaque origin never matters. `test/html.test.js` checks the hash and that the frame never gets `allow-same-origin`.
- **The parent sends everything in.** `ui/sandbox.js` fetches the worker's source and, the first time a run needs it, an engine's files (their list comes from `capabilities.json`), and posts them to the relay.
- **Untrusted code only ever runs in a Worker** created from a `blob:` URL, so it inherits the sandbox's strict CSP. Workers have no navigation, no WebRTC and no `sendBeacon`, so every network path goes through `connect-src`.
- **A classic worker.** Browsers refuse module workers from `blob:` URLs in an opaque origin (checked in Chromium). A classic worker can still `import()` blob modules and compile wasm: it turns each QuickJS module into a blob URL, leaves first, and passes `wasmBinary` and `wasmLocation`, so Emscripten never resolves a URL against a `blob:` base.
- **QuickJS limits:** 64 MB of memory, 20 s of computing time (time spent waiting on Jean or on the user's approval doesn't count), a 40 s watchdog in the parent (a command's time and 20 s more for bash), 20 s to start, and 8,000 characters of output. A script reaches only the functions Jean hands it (see [Codemode](#prompt-tools-and-caching)).
- **Pyodide runs in the same document** since D162 (it had a twin from 0.4, D80): `'unsafe-eval'` is there because Pyodide's runtime needs it when it starts (Emscripten builds some functions with `eval`). There is still nothing to steal and nowhere to send it.
- **Where Pyodide's files come from** (D43): Jean's own pinned `pyodide` npm package, copied into `vendor/pyodide/` by `npm run dev`, `npm start` and `npm run build`. They are never committed and never taken from outside Jean's folder. The capability manifest lists them under the Python capability, never in the shell.
- **How it gets them** (the 0.4 spike chose option (b), D80): the parent sends the files in, as for QuickJS, and the worker's `fetch` serves only those, under an address that never resolves; `connect-src 'none'` stays. Packages come through Jean, from the registry Settings name (D162).
- **Python's limits:** `import js` reaches only `fetch` (Jean's) and a few constructors pyfetch needs; no cap on memory or computing time inside Pyodide (it would need a cross-origin isolated page), so the parent's watchdog stops a script that goes quiet while nothing waits on Jean; 60 s to start. `ui/sandbox.js` is the client.
- **The internet goes through Jean** (D162). The worker has no network of its own: a request crosses to Jean, which judges it by Settings › Computer (`caps/computer/net.js`), asks first for a new site, and makes it with no cookies and no referrer, through the relay when there is one, with a registry's key added there. See [Computer](#computer).

**The preview** (D126) shows an HTML file in `preview.html`, framed with `sandbox="allow-scripts"` only, so its origin is opaque, and given nothing but the page and its policy. `preview.html`'s own policy is the most Settings can allow (D143):

```text
default-src 'none'; script-src 'unsafe-inline' data: https:; style-src 'unsafe-inline' https:; img-src data: https:; media-src data: https:;
font-src data: https:; connect-src https: http://localhost:* http://127.0.0.1:*; frame-src 'none'; base-uri 'none'; form-action 'none'
```

Its relay, inline under `'unsafe-inline'` (a hash would turn that keyword off), writes a doctype, then the policy Jean sent as a `<meta>`, then the page. The page keeps the document's policy and adds that one, so it gets exactly what Settings allows. `ui/csp.js` makes it, and what the frame allows, from five switches in Approvals, which `pages` in `policy.json` can set and lock:

| Switch | Default | Adds |
|---|---|---|
| Run its code | on | `script-src 'unsafe-inline'`, and `data:` for a page of the user's folder (D156) |
| Go full screen | on | `fullscreen *` in the frame's `allow` (D158) |
| Save files | on | Jean saves a file the page hands it, on a click (D158) |
| Load things from the internet | off | `https:` for pictures, sounds, fonts, styles and, when they run, scripts |
| Send and receive over the internet | off | `connect-src`: any https site (`*`), or only the sites listed under the switch, each added with Enter: `example.com`, `*.example.com`, `*.com`, and this computer over http (`localhost:3000`, `localhost:*`) |

- **What the frame allows** (D158): `allow="clipboard-write *"`, and `fullscreen *` when switched on, set before its address since a frame takes it as it loads. `*`, because WebKit doesn't take an opaque origin for its address's (`'src'`, the default); only Jean's addresses show in the frame. Copying is no switch: `execCommand('copy')` already works on a click, and WebKit doesn't ask for `writeText`.
- **Saving a file goes through Jean** (D158). The sandbox never has `allow-downloads`: WebKit takes a frame's download for a navigation, which `index.html`'s `frame-src 'self'` refuses for `blob:` and `data:`. So the relay watches `URL.createObjectURL` before the page runs, and a link with `download` to a `blob:` or `data:` address, clicked or clicked by the page's code while off the page (`click()`, or `dispatchEvent` as FileSaver does), hands the file to Jean, which saves it with `save()` when Save files is on and the user has just clicked (`navigator.userActivation`).
- **Its styles apply; its scripts run unless switched off.** In a document, unlike the sandbox's worker, a script has WebRTC, which no policy closes (Chromium and WebKit ignore `webrtc 'block'`): the risk D126 avoided, now accepted for pages that are charts and buttons (D143).
- **Nowhere to go.** No network, no form, no pop-up, and `index.html`'s `frame-src 'self'` refuses to take the frame to any other address; its links move only within the page. `test/html.test.js` checks the policy each switch and list makes, which sites are taken as typed, that `preview.html`'s is the loosest, that the relay writes the policy before the page, `frame-src 'self'` and the frame's one sandbox flag.
- **Everything else shows in Jean's own document,** from what Jean keeps: pictures as pictures (a drawing as an `<img>`, where its scripts never run), a PDF's pages drawn by pdf.js with the options it reads them with, and documents, spreadsheets and decks from their text, through lit-html.

**The browser** (D140) frames other sites' pages in `caps/browser/browser.html`, a document with no script, whose policy alone lets a frame show another site, so `index.html` keeps `frame-src 'self'`:

```text
default-src 'none'; style-src 'sha256-<its style>'; frame-src https: http://localhost:* http://127.0.0.1:*;
base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'
```

- **Jean puts each page's frame in it**, from its own document and origin: a fresh frame for each address, with no referrer, `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-storage-access-by-user-activation"`, and never top navigation, so the site keeps its own origin and storage but can't take Jean's place.
- **Jean's tab keeps to Jean while a page opens.** Arc puts a page that refuses to be framed in the place of the page around it, past the sandbox. From the moment a page opens until 3 seconds after it loads, a navigation of Jean's tab to the site on show is called off (the Navigation API's `navigate`, where it can be), and leaving any other way asks first (`beforeunload`).
- **The one frame with both flags.** It only ever holds another site: Jean never opens one of its own addresses there, and the policy refuses a blob or data. For another site's page, both flags are strictly safer than no `sandbox` at all. `test/html.test.js` checks the policy, that no other module combines them, and that the flags have no top navigation.
- **What Jean can't see.** The page's address once it moves on, its title, and whether it refused to be framed (`X-Frame-Options`, `frame-ancestors`): browsers hide all of these from the framing page. Back walks the tab's history only while its entries are known to be the site's (`caps/browser/pages.js`); a fresh frame first drops what is ahead of Jean's entry, which closing Settings leaves. A way out, a new tab, stays under a site's page until the site shows it works.
- **What the brain reads** of a page, `browse` fetches without cookies, and only where the site allows other sites to read it (CORS).
- **The conversation's folder** (D156) shows there at `<folder>/<path>`, never in that frame: in a frame of the preview's kind (`preview.html`, `sandbox="allow-scripts"`), under the page policy plus `data:` for scripts. No service worker serves an opaque origin (checked in Chromium and WebKit), and a frame of Jean's origin with scripts is never allowed, so Folders puts the page together (`caps/folders/site.js`): its style sheets as `<style>`, imports inside; scripts, pictures, sounds and fonts as `data:` addresses; modules through an import map of `data:` addresses, their relative imports made absolute first; and the data files its scripts name, which a small `fetch` in front of the page serves. Only files inside the folder whose names don't start with a dot. A folder shows its `index.html` or the list of what it holds; a picture, a film, a sound or a text shows as itself. The relay tells the browser where a link leads, and the browser follows it: another of the folder's pages, or a site. A page made or changed by `change` in the conversation on screen opens there (or, before the browser is on, has it offered), and the page on show comes again when one of the files it was made of changes size or date, checked every 1.5 s while it shows.

## Languages (i18n)

- **Strings.** They live in `locales/<lang>.json`, with English as the source and `{name}` placeholders.
  - Plurals use `Intl.PluralRules` (Arabic has six forms).
  - Dates, numbers, lists and relative times use `Intl`.
  - Language names come from `Intl.DisplayNames`, so each language appears in its own name with no extra data.
- **Choosing.** `preferredLocales` matches `navigator.languages` to the catalogues on language and likely script (`Intl.Locale.maximize`), so `zh-TW` finds `zh-Hant`, `pt-BR` finds `pt` and `iw` finds `he`. The first match is the starting language, and the language menu lists every match first, in the browser's order, under "Your languages".
- **One catalogue per person, in parts.** `useLocale()` fetches only the chosen language's catalogue; English, the fallback, is fetched only when that one can't be (D76). The strings only dialogs show are in a second part, `locales/dialogs/<lang>.json`, which `ui/dialogs.js` loads with `useStrings('dialogs')`; every module that shows a dialog imports it (D97). A capability whose strings would weigh on the first load brings its own part, `locales/<id>/<lang>.json`, loaded with `useStrings(id)` and cached with the capability; the browser is the first (D140), questions the second (D146). The first-load budget counts the largest first part; each part has the per-file budget.
- **Instant switching.** The locale is a signal, so every bound piece of text re-renders. `<html lang dir>` flips with it, and CSS uses logical properties only, so right-to-left layouts mirror immediately.
- **Details that are easy to miss:**
  - Every message element gets `dir="auto"`, so an English reply renders correctly in an Arabic UI.
  - Enter never sends while an IME is composing (`isComposing`).
  - `Intl.Segmenter` handles counting and truncation in Chinese, Japanese, Korean and Thai.
  - Fonts: the system font for every script, plus the display face only where it applies (see [design.md](design.md)).
- **Translation.** An LLM translates from English. There are about 230 strings, and no per-language human review (D44): anyone can fix a string with a PR.
  - Sentences are rephrased so nothing agrees grammatically with `{name}` (in Polish, Russian, Ukrainian, Italian, Portuguese, Hebrew, Urdu, Hindi and Marathi, and with Korean particles, among others).
  - `test/locales.test.js` checks that every catalogue has the same keys and placeholders as English, part by part, that each plural covers every category the language uses (from `Intl.PluralRules`; current CLDR gives French a "many" form), that the language menu matches the catalogues, that every string is used, and that a dialogs string is used only by modules that import `ui/dialogs.js`.
- **Shipped:** all 33 launch languages, since 0.3 (`LOCALES` in `ui/state.js`): am, ar, bn, de, en, es, fa, fr, ha, he, hi, id, it, ja, ko, mr, ms, nl, pl, pt, ru, sw, ta, te, th, tl, tr, uk, ur, vi, yo, zh-Hans, zh-Hant.
- **Conversations.** The system prompt stays in English, with a `<language>` section. Changing the UI language mid-conversation appends a system note rather than editing that section (D46), and Jean's next reply follows.

## Prompt, tools and caching

pi 1.0 adopted four mechanisms on 2026-10-01: mid-conversation system messages, deferred tool loading, codemode and cache warming. Here they are, fitted to Jean. They share one idea: what the brain has already read never changes, so providers can cache it and on-device runtimes can keep it in memory.

**A frozen prefix (D46).** When a conversation starts, Jean fixes the system prompt and the list of declared tools. Neither changes until the conversation ends. Providers cache prompts by prefix (Anthropic reads tools, then system, then messages), so a single changed byte at the front re-bills the whole conversation. On-device, the same rule lets the runtime keep its KV cache between turns, which matters most on weak graphics chips.

**System notes (D46).** When something changes mid-conversation, Jean appends a system note to the transcript at that point instead of editing the prompt. Changes include the language, rules, instructions, memory, skills, the project, newly unlocked tools and the date.

- **Sections (D81).** The project, instructions, memory, skills and, since 0.5, the connected services (`<connections>`, D89) are sections of the frozen prompt; the prompt state keeps a fingerprint of each, and a section that changed arrives whole in a note ("The <memory> section is now: …"). Since 0.6 the project's section also holds what the user calls its assistant and how it should be (D102). Since D140, `<page>` says which page the browser beside the conversation shows. Since 0.8, `<folder>` names the conversation's folder, its top level and its four tools, and carries its `AGENTS.md` when the user took it for that conversation (D141, D149, D152).
- **Notes a message comes with.** A brief of what's new ("Since last time", D101) starts with a note saying when the user was last here; the turn that answers it can only read.

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
- **Calling them.** With `javascript` (or `run`) declared, deferred tools are called from a script, so the declared list never changes. Otherwise `find_tools` (or an accepted offer) declares the tools it found from the next request on, at the cost of one cache miss. The tool call records this as `_meta.declare`, so replaying the transcript rebuilds the declared list. A brain that calls a deferred tool by its exact name, as `<connections>` gives it, gets it run under the rules without declaring anything; if a required argument is missing, it gets the tool's signature back instead (D104).
- **Hidden tools** are never declared and exist only for scripts: `file` (a shared file's whole text) and `decide` (the reflexes) (D64).
- **Native deferral.** Where a provider supports it (Anthropic's `defer_loading` with tool additions), the adapter may use it instead. The behaviour stays the same.
- **The next conversation** declares the newly unlocked capability's tools directly. Connection tools stay deferred (`deferred: true`): `<connections>` names them, `find_tools` finds them, a script calls them (D89). Pinning a connection's tools comes later.

**Codemode (D48).** The `javascript` tool (`run` until D162) executes a JavaScript snippet in QuickJS, on the conversation's computer. Top-level `await` works, and the result is what the script returns or, as in a console, its last expression. Inside it, Jean exposes what the user has granted, and nothing else:

| Global | What it does |
|---|---|
| `file(name)` | The whole text of a shared file (spreadsheets as tab-separated rows), through the hidden `file` tool |
| `csv(text)` | Turns CSV or tab-separated text into rows: objects keyed by the header, numbers as numbers |
| `tools.<name>(args)` | Calls any granted tool, deferred ones included, and connection tools. `bash`, `javascript`, `python`, `offer` and `delegate` can't be called from a script. |
| `fs.readFile(path)`, `fs.writeFile(path, text)`, `fs.readdir(path)` | The computer's files: /workspace, where what changed is kept after the run (D162) |
| `fetch(url, init)` | The internet, through Jean, as Settings › Computer allow (D162) |
| `searchTools(query)` | Same as `find_tools`, from inside a script |
| `models.decide(state, questions)` | Asks Kev on the device, when Intuition is on, through the hidden `decide` tool (the [Reflexes](#reflexes) shape); Jev when a cloud brain is connected, later |
| `models.image(description)` | Makes a picture with the image model of a connected brain's provider, kept in the project's files and shown under the answer, through the hidden `image` tool (0.5, D92) |

- **Same rules.** Every nested call goes through Do it / Ask me first / Never (`ctx.call` in `core/loop.js`). A call that needs approval pauses the script until the user answers, and that wait doesn't count against its computing time.
- **Visible.** Each nested call carries `_meta.parent` and shows in the activity view as a child of the `javascript` call.
- **Out of the brain's context.** `toChatMessages` leaves nested calls out: the script's result already holds what matters (D64).
- **Keys stay outside.** The script runs in the sandbox (see [Security](#security)). Each call crosses to Jean as a message, and Jean makes it with its own keys, so the sandbox never sees a secret.
- **Direct calls stay.** Declared tools remain callable without code, because small brains call tools more reliably than they write scripts. Codemode pays off with strong brains, many tools and data-heavy work.
- **Short description.** The `javascript` line in the prompt is one sentence; the tool's own description names each global.

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
  - Pictures (PNG, JPEG, WebP or GIF), dropped, pasted, picked or captured from the screen, are kept no larger than 1,568 pixels on a side and go to brains that can see: an image part right after their `<document>` tag (`image_url` for Chat Completions, an `image` block for Anthropic). A brain that can't see, such as the device's until its image encoder loads (D42), is told there is a picture it can't see. Auto picks a brain that can see when the conversation has one (D105).
- **Retrieval, without a vector database:**
  1. If a document fits within about 25% of the active brain's context, include it whole. Provider prompt caching makes that cheap. Otherwise its first pages go in, up to that budget, and the `read(file, pages)` tool reaches the rest. The choice is made once, when the message is sent, and recorded on the file's link, so the prefix never changes (D55).
  2. Otherwise, the brain searches like a person, with `search(query)` and `read(file, pages)`. Search is a BM25 index over page-aware chunks, with `Intl.Segmenter` splitting words and a reflex re-ranking the results. A French question about an English PDF works because the brain writes its search query in the document's language.
  3. A multilingual embedding model is added only if the test set proves it necessary.
- **One engine, three uses:** project files, past conversations (`recall`) and memory.
- **Source numbers (D71).** When a message is sent, each shared file gets a number on its link (`_meta.source`), kept if the same file was shared before. The brain sees `<document source="n" name="…">`, and `read` output starts with "Source [n]:". The UI turns `[n]` into a chip only when n is a known source; clicking it opens the file.
- **Sources from tools and the web (D90).** Each turn continues the numbering. A connection's result lists every page, email or document it brings in as "Source [n]: …" (a result that names none is one source); Wikipedia's results do the same; the brain's own search cites pages, and the loop writes ` [n]` after the cited text. Chips for web pages are links: they open in a new tab, or beside the conversation once the browser is on (D140); others show their title. A "Sources" list follows the answer.

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
- **A script's calls** are tool calls with `_meta.parent` set to their `javascript` (or `bash`, `python`) call, shown nested under it.
- **Every line opens** on what went in and what came back (D103): a call's tool name, arguments, result and duration; a brain step's thought and text as written, how it stopped, its duration and how much it read and wrote. The loop records durations in `_meta.ms`. Lines follow the order things happened.
- **Helpers** are child turns recorded under their call (D98): `delegate`, then a `helper` call per part, then each helper's brain entries and calls, ids prefixed with their parent's. The view draws the tree, parts in the order they were split.
- **The decision inbox** (D99): approvals (`session/request_permission`) and questions, Jean's or its helpers' (`ask_user`, D146), queue as cards under the live answer, answered in any order; an "Always" or "Never" answer settles the other cards of that kind. Each card belongs to its conversation and waits there (D147).
- **Answers go on out of sight** (D147): a run is kept by its conversation's path, so going to another conversation leaves it working, and coming back shows it as it goes. A call finds its conversation by its run's signal (`conversationOf` in `ui/state.js`), which a script's calls and a helper's turn share. The conversations list marks each conversation being answered with a small light.
- **Questions** (D146): `ask_user` takes up to five questions, each with up to six answers to pick from (`label`, `description`, `recommended`), one or several (`multiple`). Its card shows one question at a time, what the brain recommends picked already, a field for the user's own words, then Next, Skip and Back; the last question sends. The result is JSON, `{"answers":[{"question","chose"|"wrote"|"skipped"}]}`, with `chose` a list when several could be picked. `caps/ask/answers.js` reads what the brain wrote (a lone `question`, options as plain strings, the list as JSON text) and writes the answers. The capability is always there, like the inbox: loaded with the first message, like Things Jean made, so every conversation declares the tool.
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
- **Tools** are named `<service>_<tool>`, made JavaScript identifiers so a script can write `tools.<name>()` (D106), deferred, and listed in `<connections>`. A read-only tool is "Using the internet" (`fetch`); any other is "Sending and sharing" (`other`); both ask first by default. Policy can add connections (`connections`).
- **The browser's limits.** A service has to answer with CORS for a browser to reach it, and expose `Mcp-Session-Id` (2025 sessions) and, ideally, `WWW-Authenticate`. When it doesn't, Jean says it couldn't connect; there is no proxy (D23).

## Skills from elsewhere and routines

Built in 0.7.

- **Skills from elsewhere** (D121). `caps/skills/sources.js` reads Agent Skills discovery indexes (`/.well-known/agent-skills/index.json`, schema 0.2.0) from policy (`skills.sources`, `skills.only`) and the user's list (`settings.sources`, the hand-picked defaults until changed), compares their descriptions with requests on the device (`alike()`), and checks a download against its digest with Web Crypto. It unpacks `.tar.gz` (`DecompressionStream` and a small tar reader) and `.zip` (`core/zip.js`). Only instructions come in: `SKILL.md` and text beside it; a script, a program, a link or a path that leaves the folder refuses the skill. `caps/skills/ready.js` shows one before the user adds it. `npm run directory` checks the default sources too.
- **Routines** (D122). `caps/routines/schedule.js` reads and writes `routines/<ulid>.md` and says when one falls due, in local time, with working days from `Intl.Locale`'s week information; missed times make one run. `caps/routines/routines.js` looks every half minute and when Jean comes free, runs a due routine of the room's project once Jean is free and the user isn't reading (Web Locks keep it to one tab), and sends its request after a `routine` note. There is no runner while the tab is closed: one that fell due meanwhile runs at the next visit.

## Folders

0.8, D141, D149, D152. `caps/folders/folders.js` is the capability: who has which folder (a project, a conversation, the conversation about to start), the handles and the browser's permission, the four deferred tools and the `<folder>` section, and the elements: the folder's name in the header and its menu, the question above the box (a folder dropped, an `AGENTS.md`), the approval with its diff, the change under the answer with Undo, and the project dialog's field. `work.js` does the work on any `FS`: `.gitignore` rules and the listing, a file's text (Word, Excel and PowerPoint through `caps/files/extract.js`, PDFs through `caps/files/pdf.js`), finding with `core/search.js`'s folding, reading by lines, and working a change out (`replaceOnce` from Things Jean made, in the file's own line endings and byte order mark). `word.js` changes a passage of a Word document in place, within a paragraph. A conversation with a folder has 40 steps a turn (`ui/send.js`).

- **Reads and changes.** Each read keeps the file's size and date on its call (`_meta.read`, `_meta.folder`); a change is refused unless the file is as the conversation last read it. A change is ACP `diff` content on its call, asked first with it (the loop's `check`) unless the folder is always allowed; Undo puts the file back while it is as Jean left it, and a note of kind `undone` tells the brain.
- **Permission.** The browser asks once a visit: at the first message sent in a conversation with a folder, or from a card when a call finds the folder shut. Reading the handles back is guarded by a mark in IndexedDB: a start that finds the mark of a read that never finished keeps folders for the visit only (Chrome 153 went down reading a handle back in a private context).

## Sync

After 0.8, D157. `caps/sync/sync.js` is the capability: the folder the user picked (its handle in IndexedDB's `app-sync`, the browser's permission asked again once a visit unless allowed on every visit), when rounds run, what shows once something came in, and its part of Settings' Your data. `caps/sync/mirror.js` does the work on any two `FS`: here, Jean's private file system; there, the folder, through `folderFS` (`ui/opfs.js`), as Folders opens one.

- **The folder.** Empty when first chosen, then marked with `mirror.json`; a folder of other files is refused. It holds Jean's tree as it is, without `settings.json`, `.secrets/` or `.cache/`, and the round never takes in what drives and systems leave in a folder.
- **A round.** Each file's size and date on each side, compared with the last round's (`.cache/sync.json`), says which side changed: that side's version goes to the other, a deletion too, and a change beats a deletion. Changed on both sides: a conversation's longer version wins, two that went apart both stay (the mirror's as a new conversation), anything else the newer wins. A side that holds none of what it held takes nothing away. Each write checks that what it replaces hasn't moved since it was looked at; a conversation being answered waits.
- **When.** As Jean opens, every minute on screen, after each answer, and as the page goes out of sight, one tab at a time (Web Locks).
- **Two homes.** Two computers that each made a home project keep the oldest as the home; `settleHomes` removes a newer, empty one, or keeps it as a project.
- **Not yet.** A drive's own API, for Safari, Firefox and phones, waits for the domain (D27); it would be another `FS`.

## Computer

After 0.8, D162. `caps/computer/computer.js` is the capability: the tools (`bash`, `javascript`, `python`; hidden, `run`, `image`, `save_workspace`, `reach_site`), the sandbox (`ui/sandbox.js`), which conversation's computer a run is on, `/workspace` and what comes back from it, the requests the computer makes, Settings › Computer and the card for a new site. `computer-worker.js` runs in the sandbox's worker: just-bash, one `Bash` per conversation over a `MountableFs` (`/workspace` an `InMemoryFs` of its own), with Jean's commands (`python`, `python3`, `pip`, `node`, `js`, `npm`, `tar`), QuickJS and Pyodide loaded when first needed.

- **/workspace** (`mount.js`). The conversation's folder (Folders' `computerFolder()`), or else the project's workspace in the private file system. Before a run Jean sends the computer what changed since it last sent (size and date, `.git`, `node_modules` and `.gitignore` aside, 256 MB at most) and what went; after it, the worker gives back what changed under `/workspace`, which `save_workspace` keeps: in the user's folder asked first with the diffs, unless always allowed, and refused for a file that moved meanwhile. Python's files are copied in and out around each Python run, which go one at a time.
- **The internet** (`net.js`). Off, Ask first or Any site, a list of sites, the registries; https only; never Jean's origin or a private address unless listed; the card asks once a run per new site; requests carry no cookies, 100 MB at most; a relay ("Reach the web through", in Approvals, or the Computer's own) takes the address in place of `{url}`. Each site reached is counted on the call (`_meta.reached`).
- **What it makes shows** (D163), **each version kept** (D164). A page, a picture, a PDF, a table or a text that a run keeps in the project's workspace is also copied into the project's files as it is, by its content, with its text, a version of its own, never overwritten; the call records it (`_meta.files`, beside Things Jean made's `_meta.file`) with its number among the conversation's files of that name (`versionsOf()` in `core/events.js`). It is a card under the answer, and the first page or picture opens in the preview when the conversation is on screen. The card says which version it is once there are several; the preview's head has a dropdown of them. In the user's folder, a page shows in the browser instead (D156).
- **Packages.** Pyodide's builds, PyPI and npm, from `DEFAULT_URLS` or Settings, each with an optional key in `.secrets/`, added by Jean as `Authorization`. `npm install` is the worker's: versions by range, integrity checked, no install scripts, flat into `node_modules`; `node` resolves `require` and `import` from there. `npm init`, `ls` and `run` too, a script running in the same shell. Nothing can listen on a port, so a server (`npm run dev`, `npx vite`, `python3 -m http.server`, Node's `http`) is refused with what works instead: a page written in /workspace, which opens beside the conversation.
- **The terminal** (D166, `terminal.js`). A pane of the dock where the user types on the conversation's computer, in the shell the brain uses. `typed()` runs the command through the same `execute()`, whose runs on one computer take turns; its changes are kept at once (`incoming()`, no card), a new site is asked about in the pane, and each command becomes a system note (`kind: 'terminal'`) for the brain's next message. Ctrl+` or Settings › Computer opens it; once opened, `app-terminal-toggle` puts a button in the bar.
- **Limits.** A command has two minutes by default (Settings), a JavaScript script 64 MB and 20 s of computing time; output is cut to 8,000 characters. Stop, or a run gone quiet, ends the sandbox: computers lose `/home/user` and what wasn't kept, never the workspace.

## Voice pipeline

- **Speech to text:** a Whisper-class model through Transformers.js (shared runtime), or Chrome's on-device recognition where available.
- **Text to speech:** `speechSynthesis` with local voices, or Kokoro. Each answer is read in its own language (D109), by the voice `rankVoices()` in `ui/language.js` puts first: the user's variety, then the most natural (D114).
- **Live conversation** (0.5, D93): an AudioWorklet feeds 16 kHz audio to Silero voice detection (~2 MB ONNX) in dictation's worker → Whisper → the brain (streamed) → the system's voices, sentence by sentence. A turn starts after 250 ms of speech and ends after 800 ms of silence; speaking over Jean for half a second interrupts it. `caps/live/turns.js` holds the turn-taking, tested under `node --test`.
- **Real-time speech models** come from the provider (OpenAI Realtime over WebRTC, Gemini Live); `wss:` is already allowed in `connect-src`.

## Sources

- [Can I Use: createWritable](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable) · [Can I Use: createSyncAccessHandle](https://caniuse.com/mdn-api_filesystemfilehandle_createsyncaccesshandle) · [PowerSync: SQLite persistence on the web](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) · [On-device speech recognition explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md)
- [ACP: tool calls](https://agentclientprotocol.com/protocol/tool-calls) · [ACP: plans](https://agentclientprotocol.com/protocol/agent-plan)
- [Gemma 4 WebGPU](https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU) · [gemma-4-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) · [kev-0.6b-ONNX](https://huggingface.co/onnx-community/kev-0.6b-ONNX)
- [pi system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts) · [Pi 1.0](https://earendil.com/posts/pi-1-0/) · [pi codemode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md)
