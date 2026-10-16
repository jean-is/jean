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
| **0.8** ✅ | Work in place | Folders (D141, D149, D152); then Sync (D157), the desktop app (D155, D160, D169), the Computer and its terminal (D162–D166, D170), shown at work in Settings (D176), versions (D164), the workspace in the browser (D167, D172), the drawer (D165), Jean in editors and the gateway in one line (D241) | In a synced "Clients" folder Jean finds the three contracts that mention a clause and corrects one after showing the change; in a folder of code, `git diff` shows exactly Jean's change; after a reload each conversation and project is back on its own folder |
| Later | Together | Sync project by project, through Dropbox's own API first, and the phone as a remote of a running Jean (D227); profiles (D228); sharing by link, end to end encrypted on hst.ing (D361); requests between people's Jeans (an end-to-end-encrypted relay, D45 · D226); jean-cli's `plan` tool (D364); in `ee/`, under a key, what an organisation's IT asks for ([enterprise.md](enterprise.md#open-and-enterprise), D139) | — |

Everything above is checked end to end with `npm run e2e` in Chromium and WebKit against the fake brain, and under `node --test`, and each screen by eye in English, Arabic and Japanese.

## Still to check by hand

**With real brains**
- [ ] Do strong cloud brains call `remember` for lasting facts only, and does the device's brain call it at all?
- [ ] `find_tools` then `save_skill` when Skills arrive mid-conversation; `schedule` with the right day and time ("every Monday morning"); `suggest_skill` when a task could use one
- [ ] / and @ (D199): does a brain follow a skill named with /, use the connection named, and keep to the earlier task named with @? On the device's brain, an earlier task's length in its context
- [ ] Helpers: does a strong brain split only large tasks, giving each part what it needs? Does the device's brain ever call `delegate`? Three helpers at once against rate limits (OpenRouter's free models)
- [ ] Compaction (D359): a conversation past three quarters of its brain's window with Anthropic, OpenRouter, Ollama and LM Studio (the window each gave its brain), and the device's brain. Does the summary keep the request at work, the sources' and files' numbers and the notes in force, in the conversation's language, Arabic and Japanese too? Does the next answer go on as if nothing was cut, and does Anthropic read its cache again from the request after? A provider's "too long" summed up once and asked again
- [ ] Double-check: one verdict per line, in any language; its cost on long answers
- [ ] Flows (D218): does a brain draw a flow whose Ask steps a small brain can follow, with `{{}}` where results go, and make one of a real task it just did? A step once for each of fifty items against rate limits; a routine that runs a flow over real days
- [ ] `ask_user`: only what is needed, all at once, with an answer recommended
- [ ] Plans (D364) with real brains, in Arabic and Japanese too: does each plan a long task and never a one-step one, keep one step in progress and tick each off? A confirmation answered in the box's words; a pause, then Keep going, with and without the provider's cache
- [ ] The first brain (D329) on a computer that can run the device's brain: OpenRouter's sign-in and back with the private brain ticked, the request answered while it downloads, then Auto choosing it offline
- [ ] Meetings (D224): do assistants keep to their project, say "Nothing from me." when they have nothing, and answer each other in the second round? Does the chair say what each project will do? Three rounds of five speakers against rate limits, and a routine that holds one over real weeks
- [ ] Methods (D225): does a brain pick the method the situation calls for, ask when it isn't clear, and write an 8D, an A3, a project plan with its critical path, OKRs or a risk register that holds, in Arabic and Japanese too? Do the Gantt and the risk heatmap draw as the skills describe them?
- [ ] `write` for a document, with Markdown and CSV as the tool asks; the HTML pages they make, with a chart library from the internet
- [ ] `browse` only when a page helps
- [ ] Chart and Music score (D196): do brains read the skill and write strict JSON and ABC whose bars add up, in the user's language? The device's brain especially
- [ ] Visual answers (D291): with the skill added, do brains pick a map, a flowchart, a mind map, a timeline, key figures or a checklist only when it helps, with places' coordinates right and Mermaid this reads? Without it, how often do they write timelines and figures in its shapes unasked? Real maps from OpenFreeMap in Chrome, Edge, Firefox and Safari, on a phone; a page whose form and map follow each other, written by a real brain
- [ ] Pages (D289): do brains make one only when a tool or something to explore helps, from its one rule (nothing from the internet, the room's colours, ECharts imported, `sendPrompt` from a button), and a bill splitter or the Monty Hall problem that works in Arabic and Japanese too? Do they write the script last, so the page shows as it is written? The device's brain especially
- [ ] Slides (D200): do brains keep a slide to what fits, use `lead` and `invert` where they help, and pick Slides or PowerPoint as the user meant? Presented with a clicker, in the desktop app and on an iPad
- [ ] PowerPoint (D201): does a brain install pptxgenjs in ~, start from the skill's script and keep within the slide, in Arabic and Japanese too? Do the decks open without a repair in PowerPoint, Keynote and Google Slides?
- [ ] Folders: open before changing, exact passages, one paragraph in Word, `find_in_files` rather than opening every file
- [ ] Gemini from Google Takeout (D340): a real export, in JSON, in English and in another language (its prefix to the request, its folders' names), with files shared, a Gem with files, and a part of several; are conversations grouped as they were in Gemini?
- [ ] ChatGPT and Claude (D341): a real export of each, large (ChatGPT's split in conversations-000.json and on; what the user is told past 4 GB or 65,535 files, zip64, which Jean's zip reader refuses), with files shared, pictures, an edited request and an answer tried again (is the branch kept the one last seen?); Claude's export in its parts (its JSON of links, then the conversations' zip and the projects' together), a project with documents, a conversation in another language
- [ ] bash: how often a brain reaches for it, and whether its commands suit a non-technical user's files
- [ ] This computer (D198) from Jean served over https: Chrome's local network prompt, Safari and Firefox reaching 127.0.0.1, Linux; a brain making, installing and serving a Vite project there, fixing what its log says
- [ ] Claude Code (D235) with a real Pro and Max plan, in the desktop app and from Jean served over https: a long task with many tool calls and approvals, a reload in the middle, Auto's tiers, a plan's limit, and how long a first answer takes
- [ ] Copilot (D262) with a real Copilot plan and ChatGPT (D262) with a real Plus or Pro plan, in the desktop app and from Jean served over https: signing in to ChatGPT and declining it, a long task with many tool calls and approvals, pictures, a reload in the middle, Auto's tiers, a plan's limit, the tokens renewed after an hour, Copilot's own list of sessions
- [ ] This computer in the desktop app, opened from the Dock or Finder: the login shell finding Node from Homebrew, Volta and nvm; Linux; the folder dialog and Stop in the real window

**With real services**
- [ ] Anthropic: cache reads and warming (`cache_read_input_tokens` on the second question); its own web search (chips, a second question replaying the results, `pause_turn`)
- [ ] OpenRouter's web search: where its annotations arrive in the stream (all at the end would hide the `[n]` marks behind the follow-ups)
- [ ] Auto's tiers: the model ids exist, and the picker shows their prices
- [ ] About this answer (D252) with Ollama, the device's brain, OpenRouter (a cost) and Anthropic (models.dev's prices, D255: do they match the bill, cache reads included?); in Firefox and real Safari, whose Resource Timing may leave out a failed request; a saved certificate checked by the EU's DSS validator (JAdES B-B, its chain untrusted as self-issued), its proof by an SD-JWT library (the OpenWallet Foundation's), its signature with OpenSSL, and the check page in Firefox and real Safari (D274); a certificate dated through the gateway by a qualified authority and checked by DSS (JAdES B-T), and its bundle by `cosign verify-blob` (D276)
- [ ] Each provider of D136 with a real key
- [ ] Pictures and films (D251) with real keys: pictures from OpenAI, Gemini and OpenRouter, changed from a shared photo; a film from OpenAI, Gemini's Veo and OpenRouter, started from a picture too (OpenAI wants one of the film's size), and a page closed while one is made; Ollama with an image model, on macOS
- [ ] A real sign-in to each ready connection (Notion, Canva, Miro, Granola, ClickUp, Linear, Intercom, Wix, Attio, Fireflies), and a token renewal; a search through Exa, with no sign-in
- [ ] Web search through Vikidia, and through a real Kiwix server's Wikipedia books, from Settings › Web search
- [ ] Through a gateway (D214), a real sign-in to each service it reaches as it comes (Microsoft 365, Dropbox, monday.com, Airtable, Calendly, Otter.ai, Gamma, Zapier, Qonto, Todoist: does each register Jean's address? Qonto's tools as an owner, and as an employee once an admin allows it), and with an app registered at Google, Slack, Figma, Asana, Zoom, HubSpot and Box; with Google's, Gmail, Google Calendar and Google Drive (D349) with a Gmail account and a Workspace one: a search, an email read in another charset and one in HTML only, a reply drafted in its thread, an event added at a time and one for a day, a document read and one made from Markdown (does Drive take Markdown?)
- [ ] ServiceNow through a gateway (D283), on an instance with an app its admin registered: a real sign-in (does it take `resource`, or want the `mcp_server` scope?), its tools listed and one called
- [ ] An organisation's own skills index for office work, served with CORS
- [ ] An Artifactory instance for PyPI and npm with a key; micropip against an index that serves only HTML
- [ ] "Since last time" with a real service after a real night away
- [ ] Notifications (D334) for real: the offer's Yes asking in Chrome, Edge, Firefox and Safari, a task done in another app, or one waiting on a question or an approval, the click bringing the task back; on Android, shown by the service worker, a tap opening the task; an iPhone with Jean installed on its home screen

**Browsers and devices**
- [ ] The CSV demo on a real managed Windows laptop with a weak graphics chip, in Edge and Chrome, in three languages
- [ ] Firefox: the sandbox, Python, the preview, search, a folder as a copy, working days (no week information in `Intl.Locale` yet), saving from a page
- [ ] Plugins (D296): one added from a real repository on GitHub, in Firefox and real Safari too; one that hangs, loops or throws on every event, until it is turned off, and `?safe` (D309); a long conversation with a plugin drawing under each answer, and the memory its frame holds; one following `record` through a turn of many calls (D299); guards (D295) and routines a file sets off (D294) with the device's brain and with Intuition
- [ ] The device's brain (D319): its load on a real 12 GB Windows laptop and in Safari on a 16 GB Mac, which doesn't say its memory, against the 9 GB peak measured; on an 8 GB one, which says 8 too, the tab ending once, then its download freed; on a phone, no download offered in Settings › Brains, and on the Pixel 7 Pro the 3.1 GB already there freed
- [ ] Real Safari and Edge: the sandbox and Python; Safari's private window signing in to a connection (nothing kept across the redirect); `pagehide` stamping the visit; on an iPhone, full screen (only for video) and Pyodide's memory
- [ ] On a weak laptop: Intuition without WebGPU (q4 on WebAssembly), Python's start-up (about 13 MB), long PDFs, search over a few hundred conversations, `find_in_files` over thousands of files, a Sync round every minute, a workspace of a few hundred MB
- [ ] The browser with real sites in Chrome, Edge, Firefox and Safari (which refuse, whether their load event fires); the install steps against each browser's menus in every language
- [ ] Private · offline (D269, D270): with the brain on this device downloaded, Wi-Fi turned off and back on in Chrome and Edge on a Mac and a Windows laptop, and in Safari 26: the pill says so each way, Auto answers on the device with a brain in the cloud connected too, and a request sent just as the connection drops
- [ ] Pictures on this device (D251, D263): each download, Quick's 2.6 GB, Detailed's 6.7 GB and Finest's 6.1 GB, the check (D275, D280) in each, and a picture by each in Chrome and Edge on a Mac, a Windows laptop with a weak graphics chip (Quick with WebNN's flag on and off), and in Safari 26's WebGPU; how long a picture takes, and the memory it holds, and what Detailed and Finest do on an 8 GB computer; About this answer and its certificate naming each picture's maker (D264)
- [ ] The picture check (D275, D280) with real weights, before 2 December 2026: how long its two encoders take on WebGPU beside each maker and on WebAssembly with Ollama; how often each maker's pictures are refused on I2P's hate, violence and self-harm prompts, and pictures of history lessons, war films and hospitals wrongly; the XMP of D279 read by exiftool, Adobe's Content Credentials and the platforms; how often it refuses with each maker on a standard prompt set (I2P's sexual category), and how often it wrongly refuses ordinary pictures of people, children's included
- [ ] Settings › Computer in Firefox and real Safari: the cores each reports, and the memory after a large pandas run
- [ ] Folders in Chrome and Edge: the prompt at the first message, "Allow on every visit", a synced folder whose files change while Jean works; a handle kept in a real Incognito window (D152's mark)
- [ ] Made files and changed Word documents in Word, Excel, Numbers, Google Docs and LibreOffice on Windows (a passage over several runs takes the first one's formatting)
- [ ] Formulas (D185) on Windows, Linux and Android, whose math fonts differ or are missing, and with a screen reader
- [ ] An answer with charts and scores pasted into Word, Google Docs, Pages and Outlook: do its `data:` pictures come along, as they don't in Notion? (D196)
- [ ] Charts and scores (D196, D338) on a weak laptop and a phone (ECharts' first load, a score of a few hundred bars, MS Basic's 9 MB piano over a slow connection), heard on real speakers, in Firefox and real Safari, and with a screen reader
- [ ] Office files drawn in the preview (D183) beside Word, Excel and PowerPoint, with real decks and workbooks (fonts Jean's device lacks, charts, a 100,000-row sheet), in Firefox, real Safari, the desktop app and on a phone
- [ ] Workbooks whose cells were changed in the preview or a folder (D229) open in Excel, Numbers and LibreOffice without a repair, their formulas worked out again; with an IME, a cell is opened with F2 and a composed word kept whole

**Voice**
- [ ] Whisper dictation and Chrome's on-device recognition, Arc included (fixed by D61 and D110, to check again)
- [ ] Whistle dictation and live conversation on a real microphone in each of its six languages, and a dictation over 30 s (D205)
- [ ] Live conversation on a real microphone: Silero's thresholds, Jean's voice through speakers interrupting it, Safari's `AudioContext` at 16 kHz

**Sync, routines and the desktop app**
- [ ] OneDrive, Dropbox, iCloud Drive and Google Drive on Windows and macOS: files kept online only, a computer offline for a day, the drives' own conflict copies
- [ ] Routines over real days: a laptop that sleeps, a frozen or discarded tab, two tabs open when one falls due, and the same routine on two synced computers
- [ ] The built desktop apps on macOS, Windows and Linux: the system's folder dialog and file manager; on Linux, whether WebKitGTK lets the microphone through
- [ ] jean-cli (D241) in Zed, JetBrains and Neovim, from `npx -y jean-cli@latest acp`: a question about an open file, a change approved in the editor's diff, a command in its terminal, Stop during an answer; Claude Code as its brain with a Claude plan
- [ ] The same Sync folder in the browser and an editor: the editor's conversation in the drawer after a round, and one continued in both

**Accessibility**
- [ ] A screen reader on the inbox (cards arriving while another has focus), between the dock's panes and the box, through search's results, through the box's / and @ menu (the option Enter picks), and on a change's diff
- [ ] A project's light at every stage of the room's warmth, by day and by night, with `prefers-contrast: more`

## Before the public launch

- [x] Domain chosen and registered: jean.is, because data is bound to the origin (D27 · D242)
- [ ] Profiles' data layout settled and built (D228), since data moves only before launch (D173)
- [x] Multilingual reflex test set built; Kev measured in every launch language (D68)
- [x] Kev fine-tuned where it falls short: "personal", "unhappy" and "lasting" everywhere, and the low-resource languages (D68 · D328)
- [x] Budgets enforced in CI: `.gitlab-ci.yml` runs `npm run check` and `npm run e2e` on every push and merge request, once the repository has a GitLab remote
- [ ] CSP verified in Chrome, Edge, Firefox and Safari, the sandbox document included (D326: `npm run csp` passes in Chromium, WebKit, Chrome and Safari; Edge and Firefox themselves still to run)
- [ ] Tested on a managed Windows laptop with a weak graphics chip, and on Safari 16.4+
- [x] Contrast audited at every lighting stage; reduced motion checked (D325)
- [ ] Demo video recorded: the CSV-to-report flow, in about 15 seconds
- [ ] Manifesto and README published, with the line count
- [ ] What Jean generates marked as AI's (AI Act Art. 50(2), by launch or 2 Dec 2026): pictures made on the device or this computer carry IPTC's mark in their XMP (D279); still C2PA and a watermark on them, metadata on files, detection on the check page, labels for deployers ([certificates.md](certificates.md#4-ai-act-marking-art-502-and-4-blocks-the-public-launch))
- [ ] Mac app signed with a Developer ID and notarized, with the `allow-dyld-environment-variables` entitlement D160 needs; Windows app signed for SmartScreen
