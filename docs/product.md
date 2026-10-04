# Product

## Who and what

- **One sentence:** Jean is an AI agent that runs in a browser tab. Nothing to install, no account, and your files never leave your machine.
- **First user:** a non-technical knowledge worker. Assume a managed Windows laptop running Edge or Chrome, a weak graphics chip and IT policies.
- **The job:** drop in files (CSVs, PDFs, a folder of invoices). Jean reads them, works things out by running real code, and hands back files: a report, a spreadsheet, a chart.
- **The browser is the security model.** The category's biggest problem is agents with shell access on your laptop. Jean stays inside the most battle-tested sandbox there is.
- **Open source and reputation come first.** Revenue is secondary. Everything a person or a team uses is MIT. Organisations pay only for the enterprise integrations their IT, security or compliance teams ask for, in `ee/` (open core, D139).

## Vocabulary

The UI never says "agent", "model", "MCP" or "token".

| Concept | Word in the UI |
|---|---|
| Model / provider | Jean's brain |
| Capability (a module unlocked by discovery) | What Jean can do; skills are one of them |
| Skill (`SKILL.md`) | Skill (D115) |
| Task on a schedule | Routine (D115, D122) |
| MCP server / connector | Connection |
| Artifact / output | Things Jean made |
| Project folder | **Project** — "anything you keep coming back to" |
| Sub-agent | Helper |
| Reflexes (the small decision model) | Intuition |
| Approval rule | Do it / Ask me first / Never |
| Look (`ui/looks/`, D111, D120) | Theme (Room, Mail, Paper and twelve more, in a gallery); light or dark is separate |

These are i18n strings, so the UI words can change later at no cost. Folder names on disk are permanent and must be settled before launch.

## Progressive discovery

Jean is learned the way *A Dark Room* is played: the first screen holds a single box ("What can I do for you?"), and capabilities show up when a situation calls for them.

**How it works:**

- **Three triggers, never keywords or rules,** so it works in every language:
  1. Events that carry no language: a file dropped, a long paste, a download finishing.
  2. Reflex questions answered by a local multilingual decision model (see [architecture.md](architecture.md#reflexes)).
  3. The model's own `offer(capability)` tool, as a backstop.
- **Offers are short.** Jean introduces a capability in one sentence. If the user accepts, that capability's code loads and its tools join the conversation. Once discovered, it stays visible.
- **"What Jean can do"**, Settings' Capabilities section, is a case of trophies (D127). Each capability is a medal, lit once found. Each undiscovered one is a silhouette that says how it is found ("Share a spreadsheet"), so the case doubles as a list of things to try. A rank shows how far the house is lit, and how many more it takes to reach the next. Curious users can turn a trophy on early from its plaque, and power users can unlock everything at once.
- **Discovery and code loading are one decision.** Each capability is a module loaded on demand, so the simple first screen and the 100 KB first load are the same thing.
- **Capabilities are granted with consent, never present by default.** This is the same idea as the QuickJS sandbox.
- **Enterprise policy can unlock or deny capabilities in advance.** A denied capability is never offered and never downloaded.

**Always available, never gated:** the box, read-aloud, dictation (for accessibility), the language switch, light or dark, the activity view, and "unlock everything" in settings.

| Capability | Offered when… | What appears |
|---|---|---|
| Files | The user pastes long text (over 2,000 characters), drops a file, or a reflex or the brain says a document would help | "You can drop files on me," plus a file shelf |
| Folders | A folder is dropped, or the brain sees a request about files on the computer (0.8) | "Work in this folder?": the project is opened on a folder of this computer, and Jean finds, reads and changes its files where they are, showing each change first. Chrome and Edge; elsewhere, a read-only copy (D141) |
| Things Jean made | The first message (D119) | Files Jean writes, as cards under the answer that say what each is, seen beside the conversation and saved with a click: Word documents, spreadsheets, text and drawings, changed on request (D119, D126). Copy as rich text, CSV (D108) |
| Backup | After three conversations (never in a private window) | "Keep a copy of everything?" plus a request for persistent storage |
| Search | After ten conversations | ⌘K, or Search under a new conversation: the conversations of every project, files shared or made, and Settings, found as you type, part of a word enough, in any script (D133) |
| Calculations | A spreadsheet (CSV, TSV, XLSX) is shared, or a reflex or the brain says exact numbers would help | Jean computes instead of guessing (QuickJS) |
| Intuition | After two conversations with a brain | "Let Jean get a feel for what you need?" A small helper on this device (about 345 MB, once) picks the brain and suggests next steps |
| Data toolkit | Spreadsheet work goes beyond simple maths (the brain offers it) | Python with its standard library, after asking ("about 14 MB, once") |
| Bigger brain | A task outgrows the current brain | The next rung of the brain ladder |
| Memory | The user states a lasting preference or correction | "Want me to remember things like this from now on?" |
| Instructions | A remembered preference keeps coming back | "Make this a standing instruction?" |
| Skills | The same kind of request comes up a third time (its first words compared with earlier conversations', D83) | "Save it as a skill?" (saved as `SKILL.md`); once on, "Save this as a skill" among the follow-ups, or "See a ready-made skill for this" when one from elsewhere fits, read before it is added (D121) |
| Routines | The same kind of request on three different days (D122), or the brain offers it when the user wants something done regularly | "Make it a routine?": Jean sends the request itself, every day, working day, week or month, while it is open or as soon as the user is back |
| Projects | A distinct ongoing project shows up, or memories conflict across contexts (the brain offers it) | "Shall I make this a project? Its notes and files would stay separate." A room with its own light, shown in the header, which opens on the others |
| Assistant name | After some use inside a project (three conversations, D102) | "Want to give this project's assistant a name?" A name and a few words on how it should be, in the project's dialog; the header shows the name |
| Web search | A request needs facts the conversation doesn't hold (the brain offers it; a reflex question later) | The brain's own search, or Wikipedia in the user's language; answers cite their pages (D91) |
| Browser | The user has opened three links from answers, or a request is about a web page or site (the brain offers it) | Pages open beside the conversation, with back, forward, reload, an address or words to look up, a new tab and full screen; links from answers open there, and Jean can open a page there and read it (D140) |
| Connections | A request needs one of the user's services, like their email (the brain offers it, and the answer waits while they connect it) | "Connect a service": pick one Jean knows and sign in, or give an address, then a sign-in or a key (MCP behind the scenes, D87–D89, D95) |
| Live conversation | The user has dictated three times | Hands-free: it listens, answers aloud, stops when they speak (about 82 MB, once, D93) |
| Helpers | A big request with several parts (the brain offers it) | Jean splits the work into parts that helpers do at the same time; they appear nested in the activity view, and their approvals and questions wait in the decision inbox (D98, D99) |
| Double-check | Citations are in regular use (three answers that cite sources, D100) | Jean checks each claim against the source it cites, and shows what the sources don't support |
| Since last time | The user returns after time away (8 hours) and has connections | A read-only brief when Jean opens, in a conversation of its own (D101) |
| Sync / Share / Collaborate | Another device is mentioned / the user wants to send something / someone opens a shared item | See [enterprise.md](enterprise.md) |

## Projects

A project is a self-contained folder with its own files, conversations, instructions, memory, skills, rules and preferred brain. **A project that has been given a name and persona is what other products call an agent.**

| Level | Lifetime | Has its own |
|---|---|---|
| Jean (the house) | Permanent | Global instructions and memory about the person |
| Project ("Bakery · with Margot") | Permanent | Files, memory, conversations, rules, brain; optionally a name, persona and colour |
| Helper | One task | A temporary sub-session, shown nested in the activity view |

- **Inheritance.** Global instructions and memory apply in every project; each project adds its own on top.
- **Isolation.** A project cannot see another project's memory or files unless the user allows it (default rule: Ask me first). When a lasting fact is detected, a second reflex question decides whether it belongs to the person in general or to this project.
- **Privacy by project.** A "Health" project can be pinned to the on-device brain, which is more reliable than any classifier. Rules can also be set per project, e.g. "Client X: never use the cloud".
- **Small context.** Memory per project stays small, so it fits the on-device brain's context.
- **Easy to move.** Backing up, exporting, sharing, syncing or deleting a project is one folder operation. Collaboration later becomes "invite someone to this project".
- **Hidden default.** There is always a default project, invisible until the Projects capability is discovered.

## Instructions and memory

One section of Settings, **About you** ("What Jean knows about you"), in two parts (D134):

1. **Your instructions** (`instructions.md`). Written by the user, authoritative, always included. They come in three layers: organisation policy (locked), then global, then project.
2. **What Jean noticed** (`memory.md`). Curated by Jean. Every entry links to the conversation it came from and can be edited or deleted.

Once they are on, Settings' Skills lists the skills, each saying where it came from, the sources of skills from elsewhere and what they offer (D121), and Routines the routines, with when each runs next (D122).

**Memory that switches itself on:**

- **Detecting.** Before memory is on, a reflex question asks whether the message states a lasting fact, preference or correction, and offers memory when it does; the brain can offer it too (D79, D84).
- **Writing.** Once memory is on, the brain has a `remember(text, scope)` tool in every new conversation, with one rule: remember only what will still matter later. It writes one line in the user's language, about the person or about the current project, and a toast shows "Remembered: … · Undo". (Giving the tool only on turns a reflex flagged would change the declared tools mid-conversation, D46.)
- **Opting in.** The first time, it is an offer. Once accepted, memory runs automatically. It can be switched off in About you. Private conversations come later.
- **Reading back.**
  - `memory.md` is injected while it stays under about 1k tokens, the newest lines first when it doesn't fit (0.4, the same budget for every brain).
  - Later: past that, Jean occasionally consolidates it, keeping the previous version for undo, and the reflex model selects the relevant lines.
  - `recall(query)` searches past conversations with the same engine as documents.
- **Transparency.** Memory is a local file. With a cloud brain it is sent as context, and About you says so plainly.

## Rules and approvals

Every kind of action has one of three settings: **Do it / Ask me first / Never**.

| Defaults | |
|---|---|
| Reading and writing Jean's own files | Do it |
| Changing files in the user's own folder (0.8, D141) | Ask me first; "Always allow" holds for that folder only |
| Sending, sharing, deleting, anything external | Ask me first |
| Passwords, payments | Never (reserved for humans) |

- **Automatic review.** A reflex question checks consequential actions against the user's instructions.
- **Setting rules from approvals.** On an approval card, "Always allow" writes a "Do it" rule and "Never allow" writes a "Never" rule.
- **Overrides.** Projects can override rules, and organisation policy can lock them.

## What Jean is doing

A live, inspectable activity view built from standard ACP events:

- **The plan:** steps, each with a status.
- **Each action:** a plain-language label, the files it touched (clickable), its status and its output. As built (D103), every line opens on what it was given and what came back, so a step that went wrong can be looked into.
- **Approval cards.**
- **Pause and stop.**

Jean's "computer" is the user's own browser, so the view can show everything: files read, code run, sources used, files made.

- **Decision inbox.** During long tasks or work by helpers, questions and approvals queue up as cards instead of blocking the chat. As built in 0.6 (D99): the cards wait under the answer being written, each saying which part it is for, and are answered in any order while the helpers go on.
- **Since last time.** On opening, a read-only pass over connections produces a short brief. Jean cannot work while the tab is closed, and says so. As built in 0.6 (D101), the brief reads connected services only: files change only when the user shares them, until sync.
- **Routines** (0.7, D122). Requests Jean sends itself on a schedule, each in a conversation of its own that opens with the routine's name, under the same rules as any. They run while the tab is open, once Jean is free and the user isn't reading; one that fell due while it was closed runs at the next visit, once.
- **Explanations for Auto.** Auto mode explains its choices in collapsed "thinking" entries ("Chose the on-device brain: personal content").

## Brains: picker and Auto

A chip in the message box, beside its send button, reads **Auto ▾**, or the name of the brain picked by hand (its provider is in the picker). It offers:

- **Auto** (recommended)
- **On this device:** private, free, works offline
- **Fast / Smart / Best,** taken from the connected provider. Each shows the real model name in small print and a plain cost ("about 1¢ per answer"), using prices from the provider's catalogue (OpenRouter `/models`, or models.dev).
- **All brains**
- **Never send to the cloud,** an explicit switch

Organisation policy can hide or lock any of these.

**How Auto decides** (reflex questions, asked locally, per request):

| Question | Effect |
|---|---|
| How demanding is this? (chat → reading → multi-step → expert) | Use the cheapest brain that can do it |
| Does it involve personal, health, financial or confidential information? | Prefer the on-device brain when one is installed |
| Does it need the web or image input? | Only brains that support it |
| Is the user unhappy with the last answer? | Step up a level |

- **Stable choices.** Auto steps up when needed and never steps down within a conversation; a new conversation starts again from the bottom. This keeps the provider's cache warm and the tool-call format consistent.
- **Without Intuition,** Auto picks the Smart level (D70).
- **Visible.** Every answer shows where it came from ("answered on this device"), with a one-tap "Ask a smarter brain".
- **Optional budget.** A monthly budget cap can be set.

## Files and outputs

- **Dropped files are kept** in the project's library. Each file is stored as the original, an extracted text version and a metadata file; files are named by content hash, so duplicates are stored once. Conversations reference files rather than copying them.
- **Or left where they are** (0.8, D141). A project opened on a folder works on that folder's files in place. Nothing is copied, and a change Jean makes is in the folder as soon as the user has seen and allowed it.
- **Pictures and the screen.** A picture is shared like any file, and the box's + menu captures the screen, a window or a tab: one frame, shown as a thumbnail before it is sent. Brains that can see are shown it (D105).
- **Seen without leaving Jean** (D126). A file Jean made, or one the user shared, opens in a preview beside the conversation (over it on a phone), as what it is: a picture, a PDF's pages, a document on a sheet, a spreadsheet's grid, a deck's slides, a web page with its own look but none of its scripts. A file being changed shows its new version as it comes, so the next request can be made while looking at it.
- **Outputs fit office life without any dependency:**
  - Copy as rich text, which pastes formatted into Word, Outlook and Google Docs
  - CSV, which opens in Excel
- **Later:** `.docx` and `.xlsx` writers arrive as unlocks.

## Sources and citations

- **Numbered sources.** Every tool that brings in outside content returns numbered sources (file and page, URL and title, memory item, past conversation). The brain cites them as `[n]`, and the UI shows each as a chip: hover shows the passage, clicking opens the file at that page or the URL.
- **One format for all providers.** Provider citations (Anthropic Citations, `url_citation` annotations, Gemini grounding) are converted into the same format.
- **As built in 0.5 (D90).** Shared files, a connection's emails and documents, Wikipedia's pages and the brain's own search share one numbering per conversation. A web page's chip opens it in a new tab, or beside the conversation once the browser is on (D140); an email's shows its title. Each answer lists its sources under "Sources".
- **Honest even with small brains.** Small on-device brains cite unreliably, so a "What Jean read" list is always built from the actual tool calls.
- **Double-check** (0.6, D100). Each sentence that cites a source is checked against that source's words by the brain that wrote the answer, in one short request outside the conversation; the reflex model was not up to it. The verdicts show under the answer: what matches, what the source doesn't say or contradicts, and a follow-up to correct it.

## Web search

There is no Jean server, so search comes from something the user or their organisation already has:

1. The connected cloud brain's own search (OpenRouter's search tool, Anthropic, OpenAI, Gemini grounding). Sources come back with the answer. Built in 0.5 for Anthropic and OpenRouter, which search only when a question needs it.
2. Wikipedia and Wikidata for everyone, including on the on-device brain: free, browsers can call them directly, 300+ languages. Built in 0.5 for Wikipedia, in the user's language.
3. A configurable search endpoint (their own SearXNG, or Brave, Tavily or Exa with their own keys), set by the user or by policy.

When no route exists, Jean says so and suggests connecting a cloud brain. A shared community proxy should only be considered if real demand appears; DEVS's `proxy.devs.new` is the warning.

## Browser

Once it is found (D140), pages open in a pane beside the conversation, or over it on a phone, so the user can look while they talk:

- **What it has:** back, forward and reload; an address field that takes an address, a site's name or words to look up (Wikipedia's search by default, set by the user or the organisation); a new tab; full screen; and a button in the header that opens and closes it.
- **What opens there:** links from answers, their sources included, and pages Jean opens with `browse`. Jean asks first, since an address it picks could carry something away, and reads the page's words when the site allows it.
- **What Jean knows:** which page is open, by its address. It can't see the page itself, nor where it went once the user follows a link in it.
- **Sites that won't show.** Many sites refuse to be shown inside another page, and many accounts only work in their own site's tab. The browser can't tell, so a page from a site not seen working yet comes with "Page not showing?" and a new tab. A site opened that way opens in a tab of its own from then on, and Jean recommends installing it as an app, which gives it its own window and a place on the desktop, with the steps for the browser in use. Where the browser can't install sites (Firefox on a computer), Jean suggests a bookmark. "Try here again" undoes it.

## Reply suggestions

- **Actions from a translated catalogue** (as built in 0.3, D69):
  - "Shorter" when the answer is over 220 words. That is a length, so it works in every language, with or without Intuition.
  - "As a table" and "Draft an email" when Intuition says they fit.
  - "Simpler" and "Translate" were dropped: the small reflex model can't tell whether a text is wordy or full of jargon, and the language to translate into is the user's call.
- **Follow-ups tied to the content:** the brain ends its reply with up to 3 follow-ups in a hidden block, and the UI turns them into buttons under the last answer. They cost a few output tokens and are automatically in the user's language.
- **"Ask a smarter brain"** sits with them when Auto chose the brain and a higher level is available.
- **Starters on the first screen** help non-technical users begin.
- **Suggestions double as discovery.** A "Chart this" button is how Calculations gets discovered.

## Voice

| Need | Default (private) | Option |
|---|---|---|
| Dictation (speech to text) | A Whisper-class multilingual model in the page, through Transformers.js (99 languages) | Chrome's on-device recognition (`processLocally: true`) where available; cloud speech-to-text from the connected provider |
| Read-aloud (text to speech) | `speechSynthesis` with operating-system voices, using only voices where `localService` is true, in the answer's own language (D109), by the most natural voice there for it; when none speaks it, Jean says so (D114) | Kokoro for more natural voices (about 8 languages); cloud text-to-speech |
| Live conversation | A chain: Silero voice detection → speech-to-text → brain (streamed) → speech, sentence by sentence; speaking over Jean interrupts it. Works with any brain. | Real-time speech models from the connected provider (OpenAI Realtime over WebRTC with the user's key, Gemini Live) |

Dictation and read-aloud are available from day one for accessibility. Live conversation is discovered: built in 0.5 as the private chain above, offered after three dictations (D93). Once on, it starts from the box's send button while the box is empty, and its state shows in the box (D123).

## Languages

- **Coverage.** 33 locales at launch. They cover Arabic, Hebrew, Persian and Urdu (right-to-left), Chinese, Japanese and Korean, the major Indic and Southeast Asian languages, and Swahili, Hausa, Yoruba and Amharic. Translations are machine-made, with no per-language review (D44).
- **Instant switching.** The language changes immediately, with no reload, including in past conversations (activity labels are rendered from structured data).
- **Conversations.** Jean replies in the language of the user's last message, and otherwise in the UI language.

## Deliberately out of scope

- An always-on cloud computer, and working while the user is away
- Controlling the user's computer outside the browser
- A proprietary app catalogue (Jean uses MCP)
- Persona-heavy prompts and multi-agent role-play
- Built-in browser models (`LanguageModel`) and native/desktop hosts, for now
