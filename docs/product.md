# Product

## Who and what

- **One sentence:** create with any AI, keep everything. It starts as one box, takes anything in and gives anything back, with GPT, Claude, Gemini or a brain on the device, and keeps the person's history, files and memory on their device, brought in from other assistants and theirs to take anywhere. In a browser tab: nothing to install, free and open source (D2 · D395 · D566).
- **Who:** everyone, non-technical people first, in three places:
  - **at home:** a person with a question, a letter, a budget, a trip, a song to write;
  - **in a family:** a profile for each child, set by a parent (D228, D389);
  - **at work:** a knowledge worker, often on a managed laptop, and the IT team that deploys Jean like a web page ([enterprise.md](enterprise.md)).
- **Design for the weakest device:** a managed Windows laptop running Edge or Chrome, a weak graphics chip and IT policies; a family's shared computer; a phone.
- **What it does:** people ask in words, aloud, or with a file, a folder, a picture or another assistant's export, and get back what they asked for, made: an answer with its sources, a Word document, a spreadsheet, a deck, a chart, a score that plays, a picture, a page that works, a map, a routine. Numbers are worked out by code Jean runs, not guessed. Files in, files out is the job people search for most, so it leads the examples, never the identity.
- **What sets it apart,** in this order:
  1. **Simple.** One box. The rest is offered when a moment calls for it, and the first load stays small ([Progressive discovery](#progressive-discovery)).
  2. **Universal.** Anything in, anything out, with any brain: one on the device, a free one, a plan already paid for, or a company's gateway. In 46 languages, in any recent browser, a phone's included.
  3. **Confidential.** What Jean keeps is encrypted on the device, and there is no Jean server. On a computer with 12 GB of memory and a recent graphics chip, the answers can be written there too, offline (D319, D371).
  4. **Ready for a family.** A profile per child, set by a parent: topics by age, an under-13 lock and a danger notice (D389, D390). Learning's skills help a child learn rather than do the work (D394).
  5. **Open.** MIT, open standards (MCP, `SKILL.md`, ACP, the OpenAI-compatible and Anthropic APIs), plain files readable without Jean, extensions, and a static folder anyone can host.
  6. **Shareable.** A task, or anything Jean made, goes out as a link sealed in the browser, which the host can't read (D361); or as a web page that opens anywhere (D305).
- **Behind those six:** honest (each answer says where it was done, with a certificate, D252, D274), careful (Do it, Ask me first or Never, and a sandbox for code), multilingual (right to left included, voice on the device), accessible (WCAG AA, with dictation and read-aloud always there).
- **The browser is the security model.** The category's biggest problem is agents with shell access on your laptop. Jean stays inside the most battle-tested sandbox there is.
- **Open source and reputation come first.** Revenue is secondary. Everything a person or a team uses is MIT. Organisations pay only for the enterprise integrations their IT, security or compliance teams ask for, in `ee/` (open core, D139).

## Vocabulary

The UI never says "agent", "model", "MCP" or "token".

| Concept | Word in the UI |
|---|---|
| Model / provider | Jean's brain |
| Capability (a module unlocked by discovery) | What Jean can do; skills are one of them |
| Skill (`SKILL.md`) | Skill (D115) |
| Conversation | Task: New task, Tasks (D165) |
| Task on a schedule | Routine (D115, D122) |
| A task's steps, kept to see and run again | Flow (D218) |
| MCP server / connector | Connection |
| Artifact kept in the project (a document, a table, a picture, a score…) | Creation: Creations (D497) |
| A table Jean keeps (Tables), its rows and typed columns | Collection, shown as a table or a board; "table" is only a grid (D507) |
| Something laid out to print, post or send (Designs): an invitation, a poster, a flyer, a post | Design, Visuel in French; its three layouts are takes, its fonts voices (D572) |
| An original game made to play here (Games), its skill and its kind among the creations | Game, Jeu in French; what it is, how it plays and how it grows is its design card (D648) |
| A deck (Slides), its skill and its kind among the creations | Slides, Diapos in French: one name in each language, its shortest word for slides, never "presentation" |
| Output (a file made in an answer) | Things Jean made |
| Project folder | **Project** — "anything you keep coming back to" |
| Sub-agent | Helper |
| Reflexes (the small decision model) | Intuition |
| Approval rule | Do it / Ask me first / Never |
| Look (`ui/looks/`, D111, D120) | Theme (fifteen in a gallery, Tilde, Jean's own, first and to start); light or dark and motion are separate |
| Add-on, mod, plugin | Extension (D296, D552) |
| A page or small tool Jean wrote in an answer | App, under Creations (D553) |
| Account, user | Profile (D228); a child's is "set by a parent" (D389), never an account |

These are i18n strings, so the UI words can change later at no cost. Folder names on disk are permanent and must be settled before launch.

## Progressive discovery

Jean is learned the way *A Dark Room* is played: the first screen holds a single box ("What can I do for you?"; once something is asked, a line under it says "Jean is AI and can make mistakes", D273), and capabilities show up when a situation calls for them.

**How it works:**

- **Three triggers, never keywords or rules,** so it works in every language:
  1. Events that carry no language: a file dropped, a long paste, a download finishing.
  2. Reflex questions answered by a local multilingual decision model (see [architecture.md](architecture.md#reflexes)).
  3. The model's own `offer(capability)` tool, as a backstop.
- **Offers are short.** Jean introduces a capability in one sentence. If the user accepts, that capability's code loads and its tools join the conversation. Once discovered, it stays visible until the user turns it off. "No thanks" is for good (kept in `offers`): nothing offers it again, above the box or in an answer, where the brain's `offer` hears it was turned down and shows no card, and its trophy still turns it on (D219); stopping the answer, or walking into another project, while its card waits isn't a no. The brain's `offer` waits inside the answer, which goes on once the capability is turned on or down, the brain told, on a yes, to use its new tools now; its description of each capability, a few words, goes with every request, those policy denies left out. "Turn on everything" never downloads weights without consent.
- **One offer at a time,** above the box, and above the ideas where they are above it too (a phone). One about what the user is doing now (a paste, a file, a reflex, a request of a kind, a server refused, coming back) takes the place of the one shown, unless a download is under way; one merely due (a count reached), like Backup after three conversations, waits until nothing is shown, then the next due in turn (Backup, Intuition, Search), so an offer left unanswered hides none for good. Conversations are counted in every project, since Backup, Search and Intuition are about all of them (D281), and nothing of a capability shows before it is found.
- **"What Jean can do"**, Settings' Capabilities section, is a case of trophies (D127, D316). Each undiscovered one is a silhouette that says how it is found ("Share a spreadsheet"), so the case doubles as a list of things to try. Curious users can open a row's page and turn it on early, and power users can unlock everything at once.
  - **Turned off** (D433): a capability found turns off from its page, asked first, and on again. Off, it is still found, but nothing of it shows or loads, and what would find it does nothing, until its page turns it on. Jean then opens afresh where it was, once no answer is being written, since a capability's code can't be unloaded. Things Jean made doesn't turn off, being always there, nor do a lock and the brain on this device, which are removed where they are set (Your data, Brains); and nothing turns off in a private window, which opening afresh would empty, nor what the organisation, or a parent in a child's profile, turned on.
- **Asked what it can do, or where something is,** Jean reads its own guide, which says where each capability stands for this person, never one the organisation denies, and names each menu and button as the screen does, in its language (D423). It answers with two or three things that fit, one to try now, rather than the whole list.
- **Discovery and code loading are one decision.** Each capability is a module loaded on demand, so the simple first screen and the small first load are the same thing.
- **Capabilities are granted with consent, never present by default.**
- **Enterprise policy can unlock or deny capabilities in advance.** A denied capability is never offered and never downloaded.

**Always available, never gated:** the box, read-aloud, dictation (for accessibility), the language switch, light or dark, the activity view, and "unlock everything" in settings. Things Jean made, questions (`ask`) and noting the user's name (`you`) are capabilities that are always there; formulas (`math`, D185) load with the first one in an answer, and layouts (`layouts`, D291) with the first answer; and the receipt (`receipt`) with the first message, for About this answer (D252); and pages (`interactive`), with the first message too, so that a tool to play with can run in the answer as it is written, a diagram in Mermaid is drawn and a map shows places and routes, once the user allows maps (D289, D291).

| Capability | Offered when… | What appears |
|---|---|---|
| Files | The user pastes long text (over 2,000 characters), drops a file, or a reflex or the brain says a document would help | "You can drop files on me," plus a file shelf |
| Folders | A folder is dropped, or the brain sees a request about files on the computer | "Work in this folder?": Jean changes its files where they are, showing each change first. Chrome and Edge; elsewhere, a read-only copy, and what Jean changed is saved as one zip (D141, D149, D152) |
| Things Jean made | The first message (D119) | Files Jean writes, as cards under the answer, seen beside the conversation and saved with a click: Word documents, spreadsheets, text and drawings, changed on request (D119, D126) |
| Documents | Jean writes a Word document or a Markdown file again, or the brain offers it when the user will go on changing their writing (D485) | "Keep documents like this one beside the conversation?" A document in the project, written in as in Notion beside the task; Jean's changes wait for Accept or Reject (D488, D505, D663, D664) |
| Collections (Tables) | The brain offers it when the user wants to keep track of something, with a brain in the cloud or a plan (D491) | "Keep track of this in a collection beside the conversation?" A table or a board Jean makes and keeps up to date (D507). The brain on this device or a server on this computer, which don't make them reliably yet, only reads them (D664) |
| Designs | The brain offers it when asked for something to print, post or send, with every brain (D572); Jean offers it above the box once the brain writes such a thing as a web page (D587) | "Lay this out as a design you can change by hand, print and send?" Three takes beside the conversation, changed by hand or by asking; a dot marks what needs a look before printing |
| Games | Asked for a game, the brain reads the skill "Make a game", which brings it; or Create's Game among the creations (D648) | Jean decides what the request leaves open, says the game's idea in a short card, makes it, and plays it out of sight, fixing what broke before showing it |
| Backup | After three conversations (never in a private window), or an export of Gemini's from Google Takeout, of ChatGPT's or of Claude's is shared in the box (D340, D341) | "Keep a copy of everything?" plus a request for persistent storage; Restore and Bring in also bring in what Gemini, ChatGPT and Claude kept |
| Search by meaning | A search of the project's files by their words finds nothing, and the brain offers it (D302) | "Find what your files say, even in other words or another language?" A small helper on this device (about 175 MB, once) reads each file into the meaning of its passages |
| Search | After ten conversations | ⌘K: the conversations of every project, files, creations (D497), Settings and connections, in any script |
| Computer | A spreadsheet (CSV, TSV, XLSX) is shared, or a reflex or the brain says exact numbers would help | A computer in the sandbox, never the user's machine: JavaScript (QuickJS), Python (about 14 MB the first time) and bash, over the files of the conversation's folder or the project's workspace (D162, D176, D249) |
| This computer | The sandbox refuses a server, such as `npm run dev` (the brain offers it too), or a plan's brain, in Settings › Brains, needs it | This computer, whose page gives a line to paste in a terminal, runs commands on this machine, each asked first (D248; in the desktop app nothing to paste, D198). Through it, plans the user already pays for answer as brains (D235 · D262) |
| Intuition | After two conversations with a brain, on a computer, never a phone or a tablet (D660) | "Let Jean pick the right brain for each request and suggest next steps?" A small helper on this device (about 345 MB, once); nothing leaves it |
| Memory | The user states a lasting preference or correction, or says again something from an earlier task (D286) | "Want me to remember things like this from now on?" |
| Skills | The same kind of request comes up a third time (its first words compared with earlier conversations', D83), the user asks for a skill (D322), or the assistant reads one of Jean's own for what was asked (D406) | "Save it as a skill?" (saved as `SKILL.md`), or "See a skill that does this" when one fits, read before it is added (D121, D196). Asked for a new skill, Jean asks what it needs to know, saves it, and suggests an example first (D322) |
| Routines | The same kind of request on three different days (D122), or the brain offers it when the user wants something done regularly, or each time a file comes | "Make it a routine?": Jean sends the request itself on a schedule or once later, while it is open or as soon as the user is back; or each time a file is shared or made, if it is what the routine asks for (D294) |
| Flows | A request took four calls or more, twice (D218), or the brain offers it when the user wants a task of several steps done the same way again | "Save steps like these as a flow?" Steps as cards joined by wires; Run goes one step after another with no brain between them; Schedule makes it a routine |
| Projects | A distinct ongoing project shows up, or memories conflict across contexts (the brain offers it), or one task goes on over three different days (D286) | "Shall I make this a project? Its notes and files would stay separate." A room with its own light; once there are two, their assistants meet when asked (D224) |
| Assistant name | After some use inside a project (three conversations) | "Want to give this project's assistant a name?" A name and a few words on how it should be, in the project's dialog; the header shows the name |
| Web search | After five conversations, a request needs facts the conversation doesn't hold (the brain offers it; a reflex question later) (D145) | The brain's own search, or Wikipedia in the user's language, or the Kiwix server chosen in Settings › Web search (D254); answers cite their pages (D91) |
| Browser | The user has opened three links from answers, or a request is about a web page or site (the brain offers it) | Pages open beside the conversation; links from answers open there, and Jean can open a page there and read it (D140) |
| Pictures and films | The brain offers it when asked for a picture or a film, or a picture is shared (D286) | Pictures and short films by the brains the user connects or Ollama, or on this device (about 2.5 to 11.6 GB, once, D251, D263, D545, D585); a film is asked first. What is made on this device or this computer is checked there before it shows (D275, D280), and says that a trained model made it (D279, D324) |
| Connections | A request needs one of the user's services, like their email (the brain offers it, and the answer waits while they connect it), or an email, an invitation or a contact card is shared (`.eml`, `.ics`, `.vcf`), read or not (D286) | "Connect a service": one Jean knows, read first, or an address, then a sign-in or a key (MCP behind the scenes, D87–D89, D95), once for all its products (D344, D382); used in every project or in those ticked (D191) |
| Live conversation | The user has dictated three times | Hands-free: it listens, answers aloud, stops when they speak (about 82 MB, once, D93) |
| Camera | The user shares a second picture from a phone or tablet, or the brain offers it when they ask about something in front of them (D645) | "Show me what you're looking at?" The camera opens with live conversation, each message with a picture of what it shows; Watch has Jean look on its own, for ten minutes |
| Natural voice | Three answers have been read aloud in one of its six languages | "Hear answers in a natural voice?" A voice made on this device (about 108 MB for the first language, 97 MB for another; D455) |
| Helpers | A big request with several parts (the brain offers it), or one that made three files or more, or ran past the brain's length (D286) | Jean splits the work into parts that helpers do at the same time; they appear nested in the activity view, and their approvals wait in the decision inbox and their questions in the box (D98, D99, D343) |
| Double-check | Citations are in regular use (three answers that cite sources, D100) | Jean checks each claim against the source it cites, and shows what the sources don't support |
| Since last time | The user returns after time away (8 hours) and has connections | A read-only brief when Jean opens, in a conversation of its own (D101) |
| Notifications | A task is done while the user is in another tab or app, in a browser that shows notifications | "A task finished while you were away. Want a notification next time?" Its title only, never its answer or the question |
| Sync | Another computer is mentioned (the brain offers it), or a backup is restored here (`restored` in settings), in Chrome or Edge on a computer (D286) | "Keep your conversations, files and memory the same on your other computers?" A folder their cloud drive syncs (OneDrive, Dropbox, iCloud Drive, Google Drive), chosen on each computer; settings and keys stay on each (D157) |
| Lock | A service is connected, or after ten tasks (D371) | "Lock your tasks, files and keys, so only you can open them on this device?" A passkey or a password, then a recovery code. Everything Jean keeps is encrypted on the device either way; a backup and Sync's folder stay readable copies |
| Sharing | A copy of a task is saved, where whoever serves Jean names a host for shares (D361) | *Share…*: a link to a copy sealed on this device, opening for 30 days or a year, with a password if wanted (D470); never the notes, memory or keys, and what Jean read only when ticked |

## Projects

A project is a self-contained folder with its own files, conversations, instructions, memory, skills, rules and preferred brain. **A project that has been given a name and persona is what other products call an agent.**

| Level | Lifetime | Has its own |
|---|---|---|
| Profile (D228) | Permanent | A whole Jean: settings and keys, a lock, the person's instructions and memory, its projects |
| Jean (the house) | Permanent | Global instructions and memory about the person |
| Project ("Bakery · with Margot") | Permanent | Files, memory, conversations, rules, brain; optionally a name, persona and colour |
| Helper | One task | A temporary sub-session, shown nested in the activity view |

- **Inheritance.** Global instructions and memory apply in every project; each project adds its own on top.
- **Isolation.** A project cannot see another project's memory or files unless the user allows it (default rule: Ask me first). When a lasting fact is detected, a second reflex question decides whether it belongs to the person in general or to this project.
- **Privacy by project.** A "Health" project can be pinned to the on-device brain, which is more reliable than any classifier. Rules can also be set per project, e.g. "Client X: never use the cloud".
- **Small context.** Memory per project stays small, so it fits the on-device brain's context.
- **Easy to move.** Backing up, exporting, sharing, syncing or deleting a project is one folder operation.
- **Meetings** (D224). Asked to hold a meeting, Jean has the assistants of the other projects speak on the topic in rounds, each from its own project's instructions, memory and latest tasks ([architecture.md](architecture.md#meetings)); then it says what was decided and what needs the user. A project kept on this device doesn't hear a brain in the cloud.
- **Its name** (D18). The home project's name is never translated: the UI calls it by its assistant's.
- **Hidden default.** There is always a default project, invisible until the Projects capability is discovered.

## Profiles

A profile is a whole Jean on the device: a personal one and a work one, or one per child (D228). Nothing crosses between them.

- **Unseen until a second.** The person's menu has "Add a profile" at its top. Choosing another opens it afresh, its lock first if it has one, and the lock screen lists the others too.
- **An address opens its profile,** whichever was open last in that tab.
- **A child's profile** (D389), set by a parent:
  - Adding one goes in steps: whom it is for; for a child, the year of birth and what their profile does at that age, with who answers: the parent's own brains, their keys copied into it, but OpenRouter, whose terms are for adults, and a ChatGPT, Claude or Copilot plan; then the parent's own lock, set right there if they have none, so the child can't open it, and their password or passkey.
  - Under 13, the profile opens only with the parent's password or passkey; from the school year the child turns 13 (4e in France), on its own, or with the child's own lock.
  - Settings › Set by a parent shows what the profile is set to, and a parent's password or passkey opens it to change. Start for free is never offered there, and pictures are checked at the strictest. Whatever it locks says "Set by a parent", and the child's approval cards offer Allow once and Not now, never Always allow or Never.
  - Each message the child sends comes with Learn it's steps, as if they had named it, so the brain helps them learn rather than do their work (D394); a parent's and grown-ups' profiles are as they were.
  - The child sees, until they say they read it, that if they write about a danger their parent is told that a concern came up and when, never their words, and not when the danger is at home.
- **The family page**: jean.is/family and /fr/famille tell parents what a child's profile does and what it can't, and how a child learns with Learn it, Jean only helping, with how often each brain gives the answer anyway as its proof.
- **What a parent sees** in their own profile: in Settings › Profiles, each child's age and minutes today, and a concern not yet seen; above the box until "Seen", and as a notification, a concern that came up in a child's profile, its kind and when; never what was written (D390). A child's row opens their page, from which the parent changes what the profile is set to, who answers included, with their password or passkey, but for a teenager with a lock of their own. A parent's own Remove waits while a child under 13 opens only with their key.
- **Honest limits:** a parent's settings decide how Jean answers, not what the device allows, which its own parental controls do; a child who opens the browser's developer tools, or clears the site's data, can get round them, as they can open another AI. Intuition reads a danger right a bit more than half the time across languages, so the brain's own reading backs it up; where Intuition isn't on, a phone or a tablet, the brain answering reads each message for a danger beside its answer, right 84 to 95% of the time with the brains measured (D661).

## Instructions and memory

One section of Settings, **About you** ("What Jean knows about you"), in two parts (D134), under a line saying that the instructions and the lines are sent with each task to the brain that answers, or that the oldest lines are no longer read. The user's name comes first, which no brain is sent. Then:

1. **Your instructions** (`instructions.md`). Written by the user, authoritative, always included. They come in three layers: organisation policy (locked), then global, then project. In a child's profile it is Set by a parent, in the child's words, never what the brain is told of them.
2. **What Jean noticed** (`memory.md`). Curated by Jean, newest first, each saying when and in which task it was noted, to edit, make an instruction or delete.

Settings' Skills lists the user's skills, then Jean's own ready-made skills as tiles by what they are for (D261): everyday ones (D208, D223), learning and methods for work (below), and the sources of skills from elsewhere (D121, D196, D207). One of Jean's own changes as Jean's do, unless the user had Jean change it, which makes it theirs. Four ready-made routines fill a new routine's form (D122, D509).

**Skills that draw** (D196). A skill can say which kinds of block it writes, and while one of the room's skills says so, those blocks are drawn in the answer instead of shown as code: Charts (ECharts); Music scores (ABC notation) draws the score and plays it on real instruments, MuseScore's (D338); Slides (Slidev's Markdown, D591) draws a deck slide by slide as the answer writes it, then keeps it as a file of the project, saved as PowerPoint, a PDF, its file or a link, each slide Jean changes accepted or rejected (D505). None needs adding by hand: asked for sheet music, a chart, a deck or anything else one of Jean's own does, the assistant reads the one that fits, which comes into the user's skills as it does, and a toast says so (D401, D406). Deleting the skill turns its blocks back into code. A shared task brought in with Continue with Jean adds the ones its answers draw, and the toast says which, so that someone who never found charts sees the chart they were sent (D378).

**Methods** (D225). Six ready-made skills hold the methods people at work recognise, one for each kind of work: Project plan, Goals and strategy, Problem solving, Improve a process, What could go wrong and Design something new. Each picks the method the situation calls for, keeps to the one the room's instructions name, and asks with `ask_user`, recommending one, when it isn't clear. Their practices are rewritten from DEVS's 38 methodologies, as ideas and never files (D38).

**Learning** (D394). Three ready-made skills help someone learn, often a child, and never do the work that is theirs. Learn it (Apprendre sa leçon) starts from what the child sent: their own answer is right or not yet, never corrected for them; and their work gets one rung of help at a time (a question, the rule, an example with other numbers, then a note for the teacher), never its answer. Flash cards (Fiches) keep Leitner's five boxes, in a CSV that Anki imports. Study plan turns each weekday's minutes, the subjects and the tests into today's session, and drops missed days rather than piling them up. All three keep to the same rules: no marks, percentages or streaks, praise for the strategy and the effort, and "too hard" always works. `npm run tutor` measures how often brains give the answer anyway ([architecture.md](architecture.md#skills-and-routines)).

**Memory that switches itself on:**

- **Detecting.** Before memory is on, a reflex question asks whether the message states a lasting fact, preference or correction, and offers memory when it does; the brain can offer it too (D79, D84).
- **Writing.** Once memory is on, the brain has a `remember(text, scope)` tool in every new conversation, with one rule: remember only what will still matter later. It writes one line in the user's language, about the person or about the current project, and a toast shows "Remembered: … · Undo".
- **Opting in.** The first time, it is an offer. Once accepted, memory runs automatically. It can be switched off in About you.
- **Reading back.**
  - The newest lines of `memory.md` that fit in about 1,000 tokens go into the prompt, the same for every brain.
  - `recall(query)` searches past conversations with the same engine as documents.
- **Transparency.** Memory is a local file. With a cloud brain it is sent as context, and About you's line says so plainly, as it says when the oldest lines no longer fit.

## Rules and approvals

Every kind of action has one of three settings: **Do it / Ask me first / Never**.

| Defaults | |
|---|---|
| Reading and writing Jean's own files | Do it |
| Changing files in the user's own folder (D152) | Ask me first, with the change shown; "Always allow" holds for that folder only |
| Sending, sharing, deleting, anything external | Ask me first |
| Making a film, which costs far more than a picture (D251) | Ask me first; "Always allow" holds for films only, until Settings › Approvals › Exceptions or Brains asks first again |
| Starting a long task on a plan, once plans are found (D364) | Ask me first: the plan waits for Go ahead |
| Passwords, payments | Never (reserved for humans) |

- **Setting rules from approvals.** On an approval card, "Always allow" writes a "Do it" rule and "Never allow" writes a "Never" rule. On a connection's call, either is kept for that service alone, and says so, leading to its page in Connections.
- **Overrides.** Projects can override rules, organisation policy can lock them, and a parent locks them all in a child's profile (D389).
- **Rules for one kind of action or one service** (D295): Be more careful for…, on Approvals' Exceptions, adds one: Ask me first or Never, for a kind of action or a connected service, and if the user likes only when the answer to their own question about it is yes ("Is it to a client?"). They only ever make Jean more careful; an organisation's come first, locked.

## What Jean is doing

A live, inspectable activity view built from standard ACP events:

- **The plan** (D364): for a task of three steps or more, its steps above the activity, each with its status, ticked off as they are done. The first waits at the top of the box for Go ahead, and the user's own words there change it. A confirmed plan carries the task on while it moves; a task that runs out of steps pauses there instead, with how far it got and what it cost so far, and Keep going.
- **Each action:** a plain-language label, the files it touched (clickable), its status, and, one click down, what it was given and what came back (D103).
- **Approval cards.**
- **Pause and stop,** and **Answer now** while a brain thinks at length with nothing written yet; on this computer, Jean does it itself when the thinking runs on (D414).
- **Steering** (D365): what the user writes in the box while Jean works is read before its next step, as in Cowork, the work going on; until then it waits under the answer, and can be taken back.

Jean's "computer" is the user's own browser, so the view can show everything: files read, code run, sources used, files made.

- **Decision inbox** (D99). During long tasks or work by helpers, approvals queue as cards under the answer being written, each saying which part it is for, answered in any order while the work goes on.
- **Questions** (D146). When Jean needs the user's choices before it can do a task well, it asks them all at once, at the top of the box, one question at a time: a few answers to pick from, the one it recommends picked already and marked, and room for the user's own words. Like the inbox, it is always there.
- **Since last time** (D101). On opening after time away, a read-only pass over the connected services produces a short brief. Jean cannot work while the tab is closed, and says so.
- **Routines** (D122). Requests Jean sends itself on a schedule, or once later, each in a conversation of its own, under the same rules as any. They run while the tab is open, when they fall due, out of sight, so nothing the user is doing is interrupted, and only Run now opens a run (D317, D583); one that fell due while it was closed runs at the next visit, once. A run starts from the one before, as it went, so a daily summary can say what changed since. A routine answers with the brain the user's messages have, unless one is picked for it in Settings › Routines: Auto, or one of those the picker offers (D303).
- **Flows** (D218). A flow is the steps of a task, drawn on a canvas, each taking the results of the steps wired to it. Jean draws one when asked, or from a task it just did. A step can go through a list, an item at a time, and one that gives nothing stops what follows.
- **Explanations for Auto.** Auto mode explains its choices in collapsed "thinking" entries ("Chose the on-device brain: personal content").

## / and @ in the box

Typed at the start of a word, / and @ open a menu above the box that narrows as the user types on (D199):

- **/** names what Jean uses for the message: one of the project's skills or connections, or something Jean can do (Web search, Computer, Documents and spreadsheets…).
- **@** points at what Jean reads: a file or folder of the conversation's folder, a document the project keeps, opened beside the conversation (D488), a file shared or made in the project, attached again, or one of the project's earlier tasks.

What is picked stays in the message as words ("/chart", "@Budget 2026"), and Jean is told what each one names. Picked, or typed whole, a skill, a connection or something Jean can do becomes a chip in the box, by its name in the user's language, in the direction of the words around it whatever its script, which Backspace or Delete removes whole and which is sent as its / word; a request sent shows it as a mode at the foot of the box does, and a #tag in it, once Creations is found, looks for it there with a click.

Once Skills or Connections is found, + in the box has a row for each (D292). Once Web search is found, + also has a switch for it (D304). Once pages in answers are on, + also has Visual answers, a mode (D300), which asks for maps, diagrams, timelines and checklists where they help.

## Brains: picker and Auto

**The first brain** (D329). The first message, or the chip, while there is no brain, shows "One step before I answer" in the page, which keeps the request and the files it shares (D366): Start for free, a free account on OpenRouter's site, then back to the request, answered; where this computer can run a private brain, a box beside it gets that one too, downloaded in the background while OpenRouter answers, Auto then having both. Two doors lead on: "I already use ChatGPT, Claude or Copilot", to Settings › Brains, and "I'd rather choose", by what matters most (my words staying on this computer, starting right away, or the best answers). A line says Jean has no tie to OpenRouter nor to any other service there.

A chip in the message box, beside its send button, reads **Auto ▾**, or the name of the brain picked by hand (its provider is in the picker). It opens a menu above it:

- **Auto** (recommended)
- **On this device:** private, free, works offline
- **Fast / Smart / Best,** taken from the connected provider. Each shows the real model name and a plain cost ("about 1¢ per answer") on hover; a plan's say "in your Claude plan", "in your Copilot plan" or "in your ChatGPT plan" instead (D235 · D262).
- **All brains**
- **Keep on this device,** an explicit switch, while a brain is in the cloud. While it is on, the picker offers no brain in the cloud, and one picked by hand gives way to Auto. In a project kept on this device, it is on and can't be turned off, and says why (D307)

Organisation policy can hide or lock any of these.

**At work** (D385), the organisation's policy names its own brains, behind its AI gateway, and its sign-in.

The picker offers the brains of the project the user is in. A brain is used in every project, or only in those ticked under it in Settings › Brains, so a key a client pays for answers for that client only (D194).

**How Auto decides** (reflex questions, asked locally, per request):

| Question | Effect |
|---|---|
| How demanding is this? (chat → reading → multi-step → expert) | Use the cheapest brain that can do it |
| Does it involve personal, health, financial or confidential information? | Prefer the on-device brain when one is installed |
| Does it need the web or image input? | Only brains that support it |
| Is the user unhappy with the last answer? | Step up a level |
| Is the browser offline? | The on-device brain, when one is installed (D269) |

- **Stable choices.** Auto steps up when needed and never steps down within a conversation; a new conversation starts again from the bottom. This keeps the provider's cache warm and the tool-call format consistent.
- **Without Intuition,** Auto picks the Smart level (D70).
- **How much it thinks** (D414). Auto asks each brain to think as much as the request demands, more when the user seems unhappy, never less within a conversation. Once the user has asked for an answer now, Settings › Brains lets each brain keep its own: Auto, Quick, Balanced or Thorough.
- **Visible.** Every answer shows where it came from ("answered on this device"), with a one-tap "Ask a smarter brain".
- **Private · offline, shown**. While the next message can only be answered by the brain in this browser tab, the box is sealed: its border and chip take the theme's accent, and a legend says **Private · offline** (**Offline · still answering** while the browser is offline). The legend opens a card that says what that means and why it is rare, by itself once, as the brain's download ends.
- **About this answer** (D252). Among an answer's buttons, one, a shield when the answer was done on this device, shows how long it took, what it cost, which brains answered (D264) and the addresses outside this device the page reached meanwhile, as the browser itself recorded them. It says first where the answer was done: on this device, in the cloud, or sent outside this device when a brain here still reached addresses outside. *Kept private* is said only when all of these agree. Its certificate says how the answer was made and holds salted fingerprints of its words and files, never the words, sealed with a key the device never gives out (D274). Anyone can check it on Jean's check page, which keeps nothing and sends nothing anywhere ([architecture.md](architecture.md#about-this-answer)).

## Files and outputs

- **Dropped files are kept** in the project's library. Each file is stored as the original, an extracted text version and a metadata file; files are named by content hash, so duplicates are stored once. Conversations reference files rather than copying them.
- **Or left where they are** (D141, D149). A project or a conversation opened on a folder works on that folder's files in place, and each keeps its own. Nothing is copied, and a change Jean makes is in the folder as soon as the user has seen and allowed it.
- **Pictures and the screen.** Brains that can see are shown it, and the pages of a scanned PDF too (D105 · D479).
- **Seen without leaving Jean** (D126). A file Jean made, or one the user shared, opens in a pane beside the conversation (over it on a phone), as what it is, Office files as Office draws them (D183), a workbook's cells changing there, which Jean hears of (D229), a web page with its own look and, by default, its own scripts, without the internet (D143, D158; five switches in Approvals change what a page may do). A click opens it for a look, in the pane of the last look, so that going through several files doesn't pile panes up; changed there, moved, or its head double-clicked, it stays, and the next opens beside it (D640). Another task closes a look, and coming back to a task shows again what it was looking at (D497).
- **Outputs fit office life without any dependency** (D119): Word documents and Excel spreadsheets Jean writes, each change a new version (D164), their formulas written with symbols, since Office reads no LaTeX (D185); an answer copied as rich text, which pastes formatted into Word, Outlook and Google Docs; a table as CSV.

## Sources and citations

- **Numbered sources.** Every tool that brings in outside content returns numbered sources (file and page, URL and title, memory item, past conversation). The brain cites them as `[n]`, and the UI shows each as a chip (D210).
- **Citations that say where** (D481). The brain cites a passage of a file by its exact words, `[n: "…"]`; hovering its chip shows them, and clicking opens the file there, the words lit. Words the file doesn't hold open it at the top and say so. A picture's area (`[n: x,y,w,h]`, in percent) is drawn the same way, once brains are measured at it.
- **One format for all providers** (D90). Shared files, a connection's emails and documents, Wikipedia's pages and the brain's own search share one numbering per conversation. Each answer lists its sources under "Sources".
- **Honest even with small brains.** Small on-device brains cite unreliably, so a "What Jean read" list is always built from the actual tool calls.
- **Double-check** (D100). Each sentence that cites a source (12 at most) is checked against that source's words by the brain that wrote the answer, in one short request outside the conversation; the reflex model was not up to it. The verdicts show under the answer: what matches, what the source doesn't say or contradicts, and a follow-up to correct it. A sentence whose quoted words its source doesn't hold is not in it, without asking (D481).

## Web search

There is no Jean server, so search comes from something the user or their organisation already has:

1. The connected cloud brain's own search, with its sources (Anthropic and OpenRouter, which search only when a question needs it; OpenAI and Gemini later), while Wikipedia is the one source on.
2. The sources built into Jean, in Settings › Web search (D271), for everyone else, the on-device brain included: Wikipedia, in the user's language, on from the start, free and callable from a browser; Vikidia, the encyclopedia for 8 to 13 year olds; and an offline library, a Kiwix server (D254). A browser reaches such a server only on this computer or at an https:// address, so a hotspot elsewhere on the network that serves plain HTTP stays out of reach, the desktop app included (D260). With another one on, every brain searches what was chosen, its own search set aside.
3. A search service connected like any other (D192): Exa, which needs no key and no sign-in, is among the services Jean knows, and an organisation can add its own.

Once found, web search has a switch in + in the box (D304). Off, Jean searches nowhere in tasks started meanwhile, and a task under way is told not to; on again, it searches when a question needs it.

When no route exists, Jean says so and suggests connecting a cloud brain. A shared community proxy should only be considered if real demand appears; DEVS's `proxy.devs.new` is the warning.

## Browser

Once it is found (D140), pages open in a pane beside the conversation, or over it on a phone, so the user can look while they talk:

- **What opens there:** links from answers, their sources included, and pages Jean opens with `browse`. Jean asks first, since an address it picks could carry something away, and reads the page's words when the site allows it.
- **What Jean knows:** which page is open, by its address. It can't see the page itself, nor where it went once the user follows a link in it.
- **Sites that won't show.** Many sites refuse to be shown inside another page, and many accounts only work in their own site's tab. The browser can't tell, so a page from a site not seen working yet comes with "Page not showing?" and a new tab; a site Jean knows refuses, Vikidia's (D271), opens in a new tab at once. A site opened that way opens in a tab of its own from then on, and Jean recommends installing it as an app, which gives it its own window and a place on the desktop, with the steps for the browser in use.
- **The conversation's folder** (D156). Its pages show there as a site's would, with their styles, pictures and scripts, and their links lead to its other pages. A page Jean makes or changes in the folder opens by itself (the first time, Jean offers the browser), and the page on show comes again whenever one of its files changes, in Jean's hands or the user's own editor.
- **Where it was** (D220). Reloading, going back to a task, or a link to it shows it with what was open beside it, in the same order.

## Reply suggestions

- **Actions from a translated catalogue**:
  - "Shorter" when the answer is over 220 words. That is a length, so it works in every language, with or without Intuition.
  - "As a table" and "Draft an email" when Intuition says they fit.
  - "Simpler" and "Translate" were dropped: the small reflex model can't tell whether a text is wordy or full of jargon, and the language to translate into is the user's call.
- **Follow-ups tied to the content:** the brain ends its reply with up to 3 follow-ups in a hidden block, and the UI turns them into buttons under the last answer. They cost a few output tokens and are automatically in the user's language.
- **"Ask a smarter brain"** sits with them when Auto chose the brain and a higher level is available.
- **Under each request,** Try again, which, once the user agrees, goes back to it: everything after it in the task is removed and it is answered again, and Continue in a new task, which answers it in a new task made of what led up to it. A double click on a request puts its words in a box in their place, and sent, once the user agrees, it is answered again in the new words, as Try again does (D188, D230, D312).
- **A task saved as a web page** (D305). *Save a copy*, in its ⋮ menu in the drawer, or ⌘S for the open task (D313), saves it as a web page, which opens in any browser and looks as the task did in Jean, its pages working, in the look and the language it was saved in.
- **The first screen** (D366): before any task, in a browser's tab, a sentence says what Jean does and three facts what it is: nothing to install, kept on this device, free and open source; not in the desktop app or an installed one, where the first would be wrong.
- **Ideas on the first screen** help non-technical users begin: first "Try a sample spreadsheet", so files in and files out are tried in one click, then "Compose a tune", "Make a quiz" and "Savings plan" (D163). Their requests are short and plain, so that the brain on this device understands them too.
- **The Help center.** jean.is/help and /fr/aide: Show me in Jean opens the reader's own Jean at the right page of Settings and points at each button an article's steps name, changing nothing. A brain whose key was refused, or that couldn't be reached, says How to fix it beside the message.
- **Suggestions double as discovery.** A "Chart this" button is how the computer gets discovered.

## Settings and the drawer

**Settings** (D113) is a menu beside the section open, in three groups, each list a rounded group of rows: General, Brains, Appearance, Keyboard shortcuts; About you, then Skills, Routines, Connections, Web search, Computer and Extensions once found, then Capabilities; Approvals, Your data. The middle group goes from the person outwards: what Jean knows of them and has learned from them, then what it reaches and runs, as the case of trophies finds them, so a section found later mostly joins below the ones already known.

- **General:** the language, reading aloud (a voice picked reads its language even where the natural voice could), notifications once found, and at its foot which version of Jean this is and when it was made.
- **Brains** says first who answers, one choice: Auto, Always the same, or Keep on this device. The pictures this device makes are a row and a page of their own (D331).
- **Appearance:** Light or dark and Motion are kept on the device and applied before the first paint.
- **Connections:** a connection's page says what Jean may do there, reading and searching apart from writing, sending and changing, each Do it, Ask me first or Never for that service alone, and what goes only to brains that never train on it.
- **Web search** has web search's own switch, who searches where in a whole sentence a line, then where to look and search services. What an organisation or a parent chose says so, locked.
- **Extensions** says that each runs apart from the files and keys, with no internet, and does only what the user allows. One is read on its own page before it is added, In its maker's words apart from What Jean will let it do, its code at the end.
- **Capabilities** is the case of trophies; each opens `settings/capabilities/<id>`.
- **Approvals** holds the kinds of action under Do it, Ask me first and Never, which holds passwords and payments for good, then what is allowed without asking and the stricter rules. Web pages (what a page may do) and Certificates are pages of their own.
- **Your data** says first the one thing that matters most: a private window, nothing backed up yet, a browser that may clear it, Sync that can't go on, a backup a week old with tasks done since, otherwise when the last was made. A child's profile has no Bring in.

**The drawer** (after Manus): New task; Routines once found (Skills and Connections are only in Settings, D554); Creations once documents, tables, pictures or skills are found, or the project holds an app (D497, D553); the tasks under their heading, those pinned above them, with the creations pinned (D605); and the user at its foot, whose menu holds Settings and the language, then, on jean.is and in its desktop app, Homepage and Help, each opening a new tab. The UI calls a conversation a task.

**The Creations page**, in place of a new task's welcome: a bar to find them by their words, show one kind and sort them, all three kept in the page's address and nowhere else, so that the drawer opens it as it first shows (D220); a card to start one of each kind, a new document or collection written only once the user writes in it or names it, the others putting a request in the box, its example selected for the user's own words (D542, D558); then Pinned and the months, a card each showing what it holds and opening beside the task. Delete is undone for five seconds, a deck, a score or an app only taken off the page.

- **Unread:** an answer that comes while its task isn't on screen marks it unread. A task's name, pin and unread mark are `meta` records in the conversation (`title`, `pinned`, `unread`), the latest winning, and none moves a task among the others: its place is when something was last said or done in it. A pin and a name are kept when the user goes back to a request; a routine's runs are neither pinned nor renamed, as the next run takes the row and the routine's name.
- **Beside the conversation:** on a window at least 48rem wide the drawer stays open beside the conversation or is put away, as the user left it on that device (`app.sidebar`), and until the room has a task it stays put away (D369): a first visit has the welcome to itself rather than a column saying tasks will appear there, and the drawer comes in with the first request.

## Keyboard shortcuts

As in the Claude apps (D118), Ctrl outside Apple's systems: ⌘, Settings; ⌘⇧O a new task (ChatGPT's key), shown everywhere, since a browser tab keeps ⌘N for a new window, and ⌘N too where the page gets it (an installed Jean, Firefox); ⌘⇧D light or dark (D130); ⌘⇧E the next theme and ⌘⇧L the next language, its name shown in its own words, unless the organisation sets it; ⌥ added to either, ⌘⌥⇧E or ⌘⌥⇧L, the one before (D584), by the key's place, since ⌥ changes the letter on many keyboards, and never as AltGr, which is Ctrl+Alt outside Apple's systems and types letters; ⌘⇧S dictation, ⌘K search, ⌘⇧B the browser (D142) and ⌘⇧H talking hands-free, once each is found; ⌘J the terminal (D166) and ⌘B the drawer (D234), as in code editors (a dialog over the room closes, and the drawer shows); ⌘S a copy of the open task, as a web page, shown beside its action in the open task's ⋮ menu (D313); no key deletes a task, which its menu does after asking, and ⌘⇧U shares it once sharing is found, opening the dialog that asks how before anything leaves (D377). Escape stops the answer being written, as Esc interrupts Claude Code, once nothing else takes it, and before the browser's pane closes, so a stopped answer leaves the page it reached on screen (D315).

- **How keys are read:** from `event.key`, or from where the key sits on another alphabet, never while an IME composes, and announced with `aria-keyshortcuts`. ⌘B is the page's, not Firefox's bookmarks, ⌘S not the browser's Save As, which would keep Jean's own page, and so are the ⌘⇧ keys a browser has a use for (⌘⇧D, ⌘⇧S, ⌘⇧H, ⌘⇧U) while its tab has the keyboard; nothing Jean lets the user type is bold.

## Voice

| Need | Default (private) | Option |
|---|---|---|
| Dictation (speech to text) | A model in the page: Whistle in English, German, French, Spanish, Italian and Dutch, Whisper base through Transformers.js in the other languages (D205) | Chrome's on-device recognition (`processLocally: true`) where available; cloud speech-to-text from the connected provider |
| Read-aloud (text to speech) | `speechSynthesis` with operating-system voices, using only voices where `localService` is true, in the answer's own language (D109), by the most natural voice there for it; when none speaks it, Jean says so (D114) | A natural voice on this device, Kyutai's Pocket TTS, in English, French, German, Spanish, Italian and Portuguese (D455); cloud text-to-speech |
| Live conversation | A chain: Silero voice detection → speech-to-text → brain (streamed) → speech, sentence by sentence, in read-aloud's voice (the natural voice where it is on); speaking over Jean interrupts it. Works with any brain. | Real-time speech models from the connected provider (OpenAI Realtime over WebRTC with the user's key, Gemini Live) |

Dictation and read-aloud are always there, for accessibility. Live conversation is discovered after three dictations (D93); once on, it starts from the box's button while the box is empty, and its state shows in the box (D123, D374).

The camera (D645) is found from a phone's photos or when the brain offers it, and needs a brain that can see. Opened, it starts live conversation: a picture of what the camera shows goes with each thing they say, never the video ([architecture.md](architecture.md#camera)).

## Languages

- **Coverage.** 46 locales. They cover right-to-left languages (Arabic, Hebrew, Persian, Urdu), Chinese, Japanese and Korean, the major Indic and Southeast Asian languages, African languages, Breton and Corsican, French as Canada writes it (D496), and ten of the European Union's official languages Jean lacked (D563). Translations are machine-made, with no per-language review (D44).
- **Instant switching.** The language changes immediately, with no reload, including in past conversations (activity labels are rendered from structured data).
- **Conversations.** Jean replies in the language of the user's last message, and otherwise in the UI language.

## In an editor

People at home in a code editor can have Jean there, through `npx jean-cli acp` in any editor that speaks ACP, such as Zed (D241). It is the same Jean: the projects, memory, skills and conversations of the folder Sync keeps ([jean-cli](architecture.md#jean-cli)). `npx jean-cli gateway` runs the gateway for whoever serves Jean.

## Deliberately out of scope

- An always-on cloud computer, and working while the user is away
- Controlling the user's computer outside the browser
- A proprietary app catalogue (Jean uses MCP)
- Persona-heavy prompts, and assistants that work among themselves without the user
- Built-in browser models (`LanguageModel`), and native code beyond the window the desktop version opens and Sync's folder (D155, D169), for now
