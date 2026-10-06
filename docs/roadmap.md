# Roadmap

Each version is deployed as soon as it is ready. The loud public launch waits for the list below: AgentGPT showed that a browser agent which can't produce real work gets a burst of curiosity and then fades. What each version shipped in detail is in [decisions.md](decisions.md) and the git history; the budgets as they are now come from `npm run budgets`.

## Versions

| Version | Theme | What it brought | Done when |
|---|---|---|---|
| **0.1** ✅ | Talk | The shell (custom elements, signals, lit-html), instant i18n with right-to-left, `BRAND`, the offline service worker and capability manifest, the storage worker and data layout, ACP transcripts, the activity view, Do it / Ask me first / Never, OpenRouter sign-in, keys and local servers, read-aloud, budgets in CI | A non-technical tester chats in Arabic, switches to French mid-conversation, reloads offline and sees their history |
| **0.2** ✅ | Read and keep | Frozen prompts with system notes, Anthropic caching and warming (D46, D49), the on-device brain (D42), files in (PDF, DOCX, XLSX, PPTX), "What Jean read", copy and CSV, backup, dictation, the address (D59) | Jean answers a dropped PDF with no account and no key, and the second question is served from the cache |
| **0.3** ✅ | Discover | Intuition (Kev, measured: D67, D68), discovery and the collection page, deferred tools (D63), Calculations with codemode (D48, D65), follow-ups, Auto (D70), source chips (D71), 33 languages, Playwright smoke tests | The "drop a CSV, get a report" demo works in three languages |
| **0.4** ✅ | Remember | Memory and "What Jean knows about you" (D79), instructions, projects with their own light (D82), skills (D83), `recall`, Python | Two projects keep separate memories, and a skill is made from repeated requests |
| **0.5** ✅ | Reach | Connections over MCP with sign-in (D87–D89, D95), web search (D91), `models.image` (D92), live conversation (D93) | Jean sums up the user's latest emails through a connection, with citations |
| **0.6** ✅ | Delegate | Helpers (D98), the decision inbox (D99), Double-check (D100), "Since last time" (D101), assistant names (D102); then files Jean writes (D119) and sixteen themes (D111, D120) | A large task is split, approved step by step, and checked against its sources |
| **0.7** ✅ | Learn and repeat | Skills from elsewhere (D121), routines (D122); then the preview (D126), search (D133), Settings as one place (D134), the browser (D140), questions on a card (D146), answers that go on out of sight (D147) | A repeated request finds a ready-made skill the user adds after reading it; a routine runs on its own, and one missed while Jean was closed runs at the next visit |
| **0.8** ✅ | Work in place | Folders (D141, D149, D152); then Sync (D157), the desktop app (D155, D160, D169), the Computer and its terminal (D162–D166, D170), versions (D164), the workspace in the browser (D167, D172), the drawer (D165) | In a synced "Clients" folder Jean finds the three contracts that mention a clause and corrects one after showing the change; in a folder of code, `git diff` shows exactly Jean's change; after a reload each conversation and project is back on its own folder |
| Later | Together | Sync through a drive's own API, once the domain is settled (D27); sharing (fragment links, Web Share); collaboration (an end-to-end-encrypted relay, D45; Yjs for shared documents); in `ee/`, under a key, what an organisation's IT asks for ([enterprise.md](enterprise.md#open-and-enterprise), D139) | — |

Everything above is checked end to end with `npm run e2e` in Chromium and WebKit against the fake brain, and under `node --test`, and each screen by eye in English, Arabic and Japanese.

## Still to check by hand

**With real brains**
- [ ] Do strong cloud brains call `remember` for lasting facts only, and does the device's brain call it at all?
- [ ] `find_tools` then `save_skill` when Skills arrive mid-conversation; `schedule` with the right day and time ("every Monday morning"); `suggest_skill` when a task could use one
- [ ] Helpers: does a strong brain split only large tasks, giving each part what it needs? Does the device's brain ever call `delegate`? Three helpers at once against rate limits (OpenRouter's free models)
- [ ] Double-check: one verdict per line, in any language; its cost on long answers
- [ ] `ask_user`: only what is needed, all at once, with an answer recommended
- [ ] `write` for a document, with Markdown and CSV as the tool asks; the HTML pages they make, with a chart library from the internet
- [ ] `browse` only when a page helps
- [ ] Folders: open before changing, exact passages, one paragraph in Word, `find_in_files` rather than opening every file
- [ ] bash: how often a brain reaches for it, and whether its commands suit a non-technical user's files

**With real services**
- [ ] Anthropic: cache reads and warming (`cache_read_input_tokens` on the second question); its own web search (chips, a second question replaying the results, `pause_turn`)
- [ ] OpenRouter's web search: where its annotations arrive in the stream (all at the end would hide the `[n]` marks behind the follow-ups)
- [ ] Auto's tiers: the model ids exist, and the picker shows their prices
- [ ] Each provider of D136 with a real key; `models.image` with OpenAI and OpenRouter keys
- [ ] A real sign-in to each ready connection (Notion, Canva, Miro, Granola), and a token renewal
- [ ] An organisation's own skills index for office work, served with CORS
- [ ] An Artifactory instance for PyPI and npm with a key; micropip against an index that serves only HTML
- [ ] "Since last time" with a real service after a real night away

**Browsers and devices**
- [ ] The CSV demo on a real managed Windows laptop with a weak graphics chip, in Edge and Chrome, in three languages
- [ ] Firefox: the sandbox, Python, the preview, search, a folder as a copy, working days (no week information in `Intl.Locale` yet), saving from a page
- [ ] Real Safari and Edge: the sandbox and Python; Safari's private window signing in to a connection (nothing kept across the redirect); `pagehide` stamping the visit; on an iPhone, full screen (only for video) and Pyodide's memory
- [ ] On a weak laptop: Intuition without WebGPU (q4 on WebAssembly), Python's start-up (about 13 MB), long PDFs, search over a few hundred conversations, `find_in_files` over thousands of files, a Sync round every minute, a workspace of a few hundred MB
- [ ] The browser with real sites in Chrome, Edge, Firefox and Safari (which refuse, whether their load event fires); the install steps against each browser's menus in every language
- [ ] Folders in Chrome and Edge: the prompt at the first message, "Allow on every visit", a synced folder whose files change while Jean works; a handle kept in a real Incognito window (D152's mark)
- [ ] Made files and changed Word documents in Word, Excel, Numbers, Google Docs and LibreOffice on Windows (a passage over several runs takes the first one's formatting)

**Voice**
- [ ] Whisper dictation and Chrome's on-device recognition, Arc included (fixed by D61 and D110, to check again)
- [ ] Live conversation on a real microphone: Silero's thresholds, Jean's voice through speakers interrupting it, Safari's `AudioContext` at 16 kHz

**Sync, routines and the desktop app**
- [ ] OneDrive, Dropbox, iCloud Drive and Google Drive on Windows and macOS: files kept online only, a computer offline for a day, the drives' own conflict copies
- [ ] Routines over real days: a laptop that sleeps, a frozen or discarded tab, two tabs open when one falls due, and the same routine on two synced computers
- [ ] The built desktop apps on macOS, Windows and Linux: the system's folder dialog and file manager; on Linux, whether WebKitGTK lets the microphone through

**Accessibility**
- [ ] A screen reader on the inbox (cards arriving while another has focus), between the dock's panes and the box, through search's results, and on a change's diff
- [ ] A project's light at every stage of the room's warmth, by day and by night, with `prefers-contrast: more`

## Before the public launch

- [ ] Final name and domain chosen and registered, because data is bound to the origin (D27, [open-questions.md](open-questions.md))
- [x] Multilingual reflex test set built; Kev measured in every launch language (D68)
- [ ] Kev fine-tuned where it falls short: "personal", "unhappy" and "lasting" everywhere, and the low-resource languages (D68)
- [x] Budgets enforced in CI: `.gitlab-ci.yml` runs `npm run check` and `npm run e2e` on every push and merge request, once the repository has a GitLab remote
- [ ] CSP verified in Chrome, Edge, Firefox and Safari, the sandbox document included (Chromium and WebKit are covered by the smoke tests)
- [ ] Tested on a managed Windows laptop with a weak graphics chip, and on Safari 16.4+
- [ ] Contrast audited at every lighting stage; reduced motion checked
- [ ] Demo video recorded: the CSV-to-report flow, in about 15 seconds
- [ ] Manifesto and README published, with the line count; `manifesto.html` is ready, and publishing waits for the name and domain
- [ ] Mac app signed with a Developer ID and notarized, with the `allow-dyld-environment-variables` entitlement D160 needs; Windows app signed for SmartScreen
