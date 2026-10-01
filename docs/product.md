# Product

## Who and what

- **One sentence:** Jean is an AI agent that runs in a browser tab. Nothing to install, no account, and your files never leave your machine.
- **First user:** a non-technical knowledge worker. Assume a managed Windows laptop running Edge or Chrome, a weak graphics chip and IT policies.
- **The job:** drop in files (CSVs, PDFs, a folder of invoices). Jean reads them, works things out by running real code, and hands back files: a report, a spreadsheet, a chart.
- **The browser is the security model.** The category's biggest problem is agents with shell access on your laptop. Jean stays inside the most battle-tested sandbox there is.
- **Open source and reputation come first.** Revenue is secondary. Plain files and optional hosts keep a door open for paid services later (the Obsidian model), but nothing is designed for that now.

## Vocabulary

The UI never says "agent", "model", "MCP", "skill" or "token".

| Concept | Word in the UI |
|---|---|
| Model / provider | Jean's brain |
| Skill (`SKILL.md`) | Routine |
| MCP server / connector | Connection |
| Artifact / output | Things Jean made |
| Project folder | **Project** — "anything you keep coming back to" |
| Sub-agent | Helper |
| Approval rule | Do it / Ask me first / Never |

These are i18n strings, so the UI words can change later at no cost. Folder names on disk are permanent and must be settled before launch.

## Progressive discovery

Jean is learned the way *A Dark Room* is played: the first screen holds a single box ("What can I do for you?"), and capabilities show up when a situation calls for them.

**How it works:**

- **Three triggers, never keywords or rules,** so it works in every language:
  1. Events that carry no language: a file dropped, a long paste, a download finishing.
  2. Reflex questions answered by a local multilingual decision model (see [architecture.md](architecture.md#reflexes)).
  3. The model's own `offer(capability)` tool, as a backstop.
- **Offers are short.** Jean introduces a capability in one sentence. If the user accepts, that capability's code loads and its tools join the conversation. Once discovered, it stays visible.
- **A "What Jean can do" page** shows discovered capabilities lit and undiscovered ones as silhouettes, like a game's collection screen. Curious users can unlock things early, and power users can unlock everything at once.
- **Discovery and code loading are one decision.** Each capability is a module loaded on demand, so the simple first screen and the 100 KB first load are the same thing.
- **Capabilities are granted with consent, never present by default.** This is the same idea as the QuickJS sandbox.
- **Enterprise policy can unlock or deny capabilities in advance.** A denied capability is never offered and never downloaded.

**Always available, never gated:** the box, read-aloud, dictation (for accessibility), the language switch, the activity view, and "unlock everything" in settings.

| Capability | Offered when… | What appears |
|---|---|---|
| Files | The user pastes long text, mentions a document, or drops a file | "You can drop files on me," plus a file shelf |
| Things Jean made | The first table or document is produced | A "Made by Jean" shelf: copy as rich text, CSV, print to PDF |
| Backup | After the first few conversations | "Keep a copy of everything?" plus a request for persistent storage |
| Calculations | A question needs exact numbers | Jean computes instead of guessing (QuickJS) |
| Data toolkit | Spreadsheet work goes beyond simple maths | Python, after asking ("about 30 MB, once") |
| Bigger brain | A task outgrows the current brain | The next rung of the brain ladder |
| Memory | The user states a lasting preference or correction | "Want me to remember things like this from now on?" |
| Instructions | A remembered preference keeps coming back | "Make this a standing instruction?" |
| Routines | The same kind of request comes up a third time | "Make this a routine?" (saved as `SKILL.md`) |
| Projects | A distinct ongoing project shows up, or memories conflict across contexts | "Shall I make the bakery a project? I'll keep its notes and files separate." |
| Assistant name | After some use inside a project | "Want to give this project's assistant a name?" |
| Web search | A request needs fresh information | Uses the brain's own search, or suggests connecting a brain that has one |
| Connections | The user mentions Gmail, Drive, Notion… | Connect it (MCP behind the scenes) |
| Live conversation | The user dictates often | Hands-free voice mode |
| Helpers | A big request with several parts | Jean splits the work; helpers appear nested in the activity view |
| Double-check | Citations are in regular use | Jean checks claims against their sources |
| Since last time | The user returns after time away and has connections | A read-only brief when Jean opens |
| Sync / Share / Collaborate | Another device is mentioned / the user wants to send something / someone opens a shared item | See [enterprise.md](enterprise.md) |

## Projects

A project is a self-contained folder with its own files, conversations, instructions, memory, routines, rules and preferred brain. **A project that has been given a name and persona is what other products call an agent.**

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

One page, **"What Jean knows about you"**, in two parts:

1. **Your instructions** (`instructions.md`). Written by the user, authoritative, always included. They come in three layers: organisation policy (locked), then global, then project.
2. **What Jean noticed** (`memory.md`). Curated by Jean. Every entry links to the conversation it came from and can be edited or deleted.

**Memory that switches itself on:**

- **Detecting.** Every turn, a reflex question asks whether the message states a lasting fact, preference or correction. It runs locally, costs nothing and works in any language.
- **Writing.** Only on turns where that answer is yes does the brain get a `remember(text)` tool. It writes one line in the user's language, and a toast shows "Remembered: … · Undo".
- **Opting in.** The first time, it is an offer. Once accepted, memory runs automatically. It can be switched off in settings, and any conversation can be made private.
- **Reading back.**
  - `memory.md` is injected whole while it stays under about 1k tokens (about 500 for the on-device brain).
  - Past that, Jean occasionally consolidates it, keeping the previous version for undo. The reflex model selects the relevant lines.
  - `recall(query)` searches past conversations with the same engine as documents.
- **Transparency.** Memory is a local file. With a cloud brain it is sent as context, and the memory page says so plainly.

## Rules and approvals

Every kind of action has one of three settings: **Do it / Ask me first / Never**.

| Defaults | |
|---|---|
| Reading and writing Jean's own files | Do it |
| Sending, sharing, deleting, anything external | Ask me first |
| Passwords, payments | Never (reserved for humans) |

- **Automatic review.** A reflex question checks consequential actions against the user's instructions.
- **Setting rules from approvals.** On an approval card, "Always allow" writes a "Do it" rule and "Never allow" writes a "Never" rule.
- **Overrides.** Projects can override rules, and organisation policy can lock them.

## What Jean is doing

A live, inspectable activity view built from standard ACP events:

- **The plan:** steps, each with a status.
- **Each action:** a plain-language label, the files it touched (clickable), its status and its output.
- **Approval cards.**
- **Pause and stop.**

Jean's "computer" is the user's own browser, so the view can show everything: files read, code run, sources used, files made.

- **Decision inbox.** During long tasks or work by helpers, questions and approvals queue up as cards instead of blocking the chat.
- **Since last time.** On opening, a read-only pass over connections and changed files produces a short brief. Jean cannot work while the tab is closed, and says so.
- **Explanations for Auto.** Auto mode explains its choices in collapsed "thinking" entries ("Chose the on-device brain: personal content").

## Brains: picker and Auto

A chip in the message box reads **Auto ▾**. It offers:

- **Auto** (recommended)
- **On this device:** private, free, works offline
- **Fast / Smart / Best,** taken from the connected provider. Each shows the real model name in small print and a plain cost ("about 1¢ per answer"), using prices from the provider's catalogue (OpenRouter `/models`, or models.dev).
- **All models…**
- **Never send to the cloud,** an explicit switch

Organisation policy can hide or lock any of these.

**How Auto decides** (reflex questions, asked locally, per request):

| Question | Effect |
|---|---|
| How demanding is this? (chat → reading → multi-step → expert) | Use the cheapest brain that can do it |
| Does it involve personal, health, financial or confidential information? | Prefer the on-device brain when one is installed |
| Does it need the web or image input? | Only brains that support it |
| Is the user unhappy with the last answer? | Step up a level |

- **Stable choices.** Auto steps up when needed and steps down only at natural breaks. This keeps the provider's cache warm and the tool-call format consistent.
- **Visible.** Every answer shows where it came from ("answered on this device"), with a one-tap "Ask a smarter brain".
- **Optional budget.** A monthly budget cap can be set.

## Files and outputs

- **Dropped files are kept** in the project's library. Each file is stored as the original, an extracted text version and a metadata file; files are named by content hash, so duplicates are stored once. Conversations reference files rather than copying them.
- **Outputs fit office life without any dependency:**
  - Copy as rich text, which pastes formatted into Word, Outlook and Google Docs
  - CSV, which opens in Excel
  - Print to PDF
- **Later:** `.docx` and `.xlsx` writers arrive as unlocks.

## Sources and citations

- **Numbered sources.** Every tool that brings in outside content returns numbered sources (file and page, URL and title, memory item, past conversation). The brain cites them as `[n]`, and the UI shows each as a chip: hover shows the passage, clicking opens the file at that page or the URL.
- **One format for all providers.** Provider citations (Anthropic Citations, `url_citation` annotations, Gemini grounding) are converted into the same format.
- **Honest even with small brains.** Small on-device brains cite unreliably, so a "What Jean read" list is always built from the actual tool calls.
- **Later unlock: Double-check.** The reflex model asks whether source [n] supports each claim.

## Web search

There is no Jean server, so search comes from something the user or their organisation already has:

1. The connected cloud brain's own search (OpenRouter's web plugin, Anthropic, OpenAI, Gemini grounding). Sources come back with the answer.
2. Wikipedia and Wikidata for everyone, including on the on-device brain: free, browsers can call them directly, 300+ languages.
3. A configurable search endpoint (their own SearXNG, or Brave, Tavily or Exa with their own keys), set by the user or by policy.

When no route exists, Jean says so and suggests connecting a cloud brain. A shared community proxy should only be considered if real demand appears; DEVS's `proxy.devs.new` is the warning.

## Reply suggestions

- **Actions from a translated catalogue:** "Shorter", "As a table", "Simpler", "Draft an email", "Translate"… The reflex model picks the relevant ones. Free, instant, works in every language.
- **Follow-ups tied to the content:** the brain ends its reply with up to 3 follow-ups in a hidden block, and the UI turns them into buttons. They cost a few output tokens and are automatically in the user's language.
- **Starters on the first screen** help non-technical users begin.
- **Suggestions double as discovery.** A "Chart this" button is how Calculations gets discovered.

## Voice

| Need | Default (private) | Option |
|---|---|---|
| Dictation (speech to text) | A Whisper-class multilingual model in the page, through Transformers.js (99 languages) | Chrome's on-device recognition (`processLocally: true`) where available; cloud speech-to-text from the connected provider |
| Read-aloud (text to speech) | `speechSynthesis` with operating-system voices, using only voices where `localService` is true | Kokoro for more natural voices (about 8 languages); cloud text-to-speech |
| Live conversation | A chain: Silero voice detection → speech-to-text → brain (streamed) → speech, sentence by sentence; speaking over Jean interrupts it. Works with any brain. | Real-time speech models from the connected provider (OpenAI Realtime over WebRTC with the user's key, Gemini Live) |

Dictation and read-aloud are available from day one for accessibility. Live conversation is discovered.

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
