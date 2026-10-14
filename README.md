# Jean

> An AI agent that runs in a browser tab. Nothing to install, no account, your files never leave your machine.

Jean is for people who will never open a terminal. You open a page, give it a task and your files, and it reads them, works things out with real calculations, and hands back something you can use: a summary, a table, a document. It shows what it is doing while it works, and it asks before anything that matters.

There is no Jean server. Everything Jean keeps lives in your browser as plain files, and the thinking happens on your device or with a provider you choose. Read the [manifesto](MANIFESTO.md) for why. Jean is a working name: the final name and domain are still [open](docs/open-questions.md).

## What Jean does

- **Talks in 33 languages,** right to left included, and you can switch languages mid-conversation.
- **Reads your files:** PDF, Word, Excel, PowerPoint, CSV and plain text. Pictures, and captures of your screen taken from the message box, go to brains that can see.
- **Does the maths instead of guessing, on a computer of its own.** A sandbox in the tab, never your machine, where calculations run as real code in JavaScript (QuickJS) or Python (Pyodide), and commands in bash, with `pip` and `npm` packages, over the files of your folder or the project's workspace. It reaches the internet only as you allow, site by site, through a relay or package mirrors if your organisation uses them. Settings shows it at work: whether it is awake, the core and memory it borrows, and what it runs, each with an example to try.
- **Works on your folders where they are.** Open a conversation or a project on a folder of your computer, a synced folder of contracts or a folder of code: Jean finds, reads and changes its files in place, Word documents and PDFs included, shows you each change before making it, and undoes it if you ask. In Chrome and Edge; elsewhere it works on a copy, and you save what changed.
- **Follows you from one computer to another.** Choose a new folder in OneDrive, Dropbox, iCloud Drive or Google Drive, then the same folder on your other computers: your conversations, files and memory stay the same on each, while settings and keys stay where they are. In Chrome and Edge.
- **Hands back things you can use.** Word documents, Excel spreadsheets and other files, made on request (Word and Excel with no file-format library, decks with a package on its computer), seen beside the conversation as Office draws them, on your device, and saved with a click. Files you share open there too: a PDF's pages, a document's pages, a deck's slides, a workbook and its sheets. Pictures and short films too, from a description or a picture of yours, made by the brains you connect or, for pictures, privately on your device. Or copy an answer with its formatting, or download a table as a spreadsheet.
- **Remembers, if you want it to:**
  - what it should know about you, on a page where you can read and change it;
  - standing instructions;
  - projects, each with its own memory, files and light;
  - skills it learns from requests you repeat, saved as `SKILL.md`, or ready-made ones, from its own directory or that sites and your organisation publish, added only after you read their steps; some draw in answers, such as charts and music scores you can play;
  - and once there's plenty to look back on, ⌘K finds any conversation, file or setting as you type.
- **Repeats on a schedule.** A routine is a request Jean sends itself every hour, day, working day, week or month, or once later, like a reminder. It runs while Jean is open, and what fell due while it was closed runs when you're back.
- **Reaches your services and the web.** Connections over MCP sign in from the browser. Web search uses the brain's own search, or Wikipedia, online or offline from a Kiwix server. Every source becomes a numbered citation. Pages open beside the conversation, with back, forward and reload, and Jean can open one there too. A site that won't show inside Jean opens in its own tab, and Jean explains how to install it as an app.
- **Takes on bigger tasks:**
  - Helpers split a large task and work on its parts at the same time.
  - Their approvals and questions wait in one inbox, where you answer them in any order.
  - Double-check compares each cited claim with its source.
  - When you come back, Jean tells you what changed since last time.
- **Listens and speaks:** dictation, read-aloud, and a live voice conversation, with speech recognised on your device.
- **Looks the way you like:** a desktop app of today, the lit room, a mail-style layout with your conversations listed beside the one you read, or ink on paper, each by day or by night. Your own colours, text size, typeface or CSS go on top.
- **Asks when it needs to.** When a task depends on your choices, Jean asks everything at once, one question at a time, with answers to pick from, the one it recommends picked already, and room for your own words.
- **Asks first.** For each kind of action you choose *Do it*, *Ask me first* or *Never*. By default Jean reads and writes its own files freely, asks before sending, sharing, deleting or anything external, and never touches passwords or payments.

Jean starts as a single box. Everything above is offered when you need it, like a game that teaches itself, and "What Jean can do", in Settings, lights up as you find things.

## Private by design

- **Your data stays on your device.** It lives in the browser's private file system as plain files:
  - one file per thing, with conversations as append-only JSONL;
  - backups are one zip you keep wherever you like;
  - keys are encrypted on the device and never part of a backup.
- **You choose the brain:**
  - **On this device:** Gemma 4 E2B on WebGPU, about 3.1 GB, downloaded once if you agree. It is offered only where it can run.
  - **One click:** sign in with OpenRouter.
  - **Your own key** (Anthropic, OpenAI or any OpenAI-compatible service), or a **local server** such as Ollama or LM Studio.
  - **Your Claude plan** (Pro or Max), through Claude Code installed and signed in on your computer, which Jean reaches through This computer.
  - **Your ChatGPT plan** (Plus or Pro), which you sign in to from Jean, or **your Copilot plan**, through Copilot CLI installed and signed in on your computer, both through This computer too.
  - **Auto** picks a brain for each request. Once Intuition is on, that is the cheapest brain that can do the job, and the device's brain for personal content, or for everything while you are offline. A switch keeps everything off the cloud, and while nothing leaves your device, the message box says so.
- **Each answer says where it was done.** A button under it shows how long it took, what it cost, which brains answered, and whether anything left your device while it was written, as your browser recorded it. Its certificate, sealed by your device and holding none of your words, saves as a file for whoever has to check.
- **Code a brain writes never runs in the page.** It runs in a sandboxed worker with an opaque origin and no network. The page itself has a strict Content Security Policy with Trusted Types, and never uses `innerHTML` or `eval`.

## Small on purpose

| | 0.8 |
|---|---|
| Jean's own code | 20,429 lines of code, the core 1,755 of them |
| First load | 96.3 KB gzipped, in the language with the largest catalogue |
| Libraries loaded up front | 3: `@preact/signals-core`, `lit-html`, `marked` |
| Build step | None: plain ES modules and an import map |
| Base prompt | 182 tokens |

These limits live in [budgets.json](budgets.json), and CI fails when one is exceeded. Everything else loads only when a capability is turned on, including QuickJS, Pyodide and Transformers.js.

Jean builds on standards, not inventions:
- **Brains:** the OpenAI-compatible and Anthropic Messages APIs.
- **Connections:** MCP.
- **Skills:** Agent Skills (`SKILL.md`).
- **Activity:** ACP `session/update` events.
- **Intuition** (the small on-device helper that picks a brain and suggests next steps): the Decisions API.
- **Everything else:** `Intl` and the Web Platform.

## Run it

Jean needs Node 22 or later to develop, and a browser no older than Chrome or Edge 108, Safari 16.4 or Firefox 111. The brain on this device also needs WebGPU with `shader-f16`.

```bash
npm install
```

```bash
npm run dev
```

Then open http://127.0.0.1:4173 and pick a brain. The terminal says as soon as a change goes over a [budget](budgets.json). To try Jean without any account, start the fake brain used by the tests, and connect it under *On your computer → Other* at `http://127.0.0.1:4174/v1`:

```bash
node test/fixtures/fake-brain.js
```

**Deploying:** run `npm ci && npm run build:web`, then copy `dist/web/` to any static host served over HTTPS, and have it send the `.br` and `.gz` copies beside each file as they are (Caddy's `precompressed br gzip`, nginx's `gzip_static on`). For a server you reach over SSH, `DEPLOY_TO=host:/path npm run deploy` does it for a commit in git (`HEAD` unless you name one after `--`): it uploads the commit as a new release beside the last five and switches `/path/current`, which the server serves, to it at once. When `capabilities.json` names a new version of the render package, which draws a task saved as a web page, it has to be on npm before the site names it: `npm run deploy` publishes it first, under your npm login; with any other host, run `npm run render`, then `npm publish ./dist/render`. Jean's code runs exactly as written: `dist/web/` holds `app/` with Jean's own code minified, and `npm run serve` serves `app/` as it is. Only third-party code (copied into `app/vendor/`), two generated listings and a copy of the licence are added at build time, and none of them is committed. A browser ties Jean's data to the address it is served from, so choose that address once. For containers, see [deploy/docker/](deploy/docker/README.md).

**Gateway:** some services, like Gmail, Microsoft 365 or Slack, refuse requests from a browser, or only accept apps they registered. A small gateway, with nothing to install, reaches them for Jean: it relays to every service Jean knows that a browser can't reach, or to the `hosts` you name, and keeps the secret of an app you registered there (D191, D214). Run it on Node, or put `gateway/gateway.js` on Cloudflare Workers, Deno or Bun, then name it in Settings › Connections, or in policy (`urls.gateway`):

```bash
GATEWAY_CONFIG='{"origins":["https://jean.example"]}' node gateway/serve.js
```

Or, with nothing to clone, its secrets still in `GATEWAY_CONFIG`:

```bash
npx jean-cli gateway --origin https://jean.example
```

To try it on your computer, one command serves Jean with the gateway at `/gateway` on the same address, already set for Connections (a policy the development server makes up, as an organisation's would), which is found as anywhere else, or turned on early from its trophy in Settings › Capabilities:

```bash
npm run dev:gateway
```

That is all Microsoft 365, Dropbox, monday.com, Airtable, Calendly, Otter.ai, Gamma, Zapier and Todoist need. Google (Gmail, Drive, Calendar, Chat), Slack, Figma, Asana, Zoom, HubSpot and Box take only apps registered with them: register one, with Jean's address as its redirect, and add it to `clients` (`{"issuer":"https://accounts.google.com","tokenEndpoint":"https://oauth2.googleapis.com/token","clientId":"…","clientSecret":"…"}`). `npm run directory` shows each service's sign-in server. ServiceNow is each company's own instance, which registers no app itself: its admin registers one (Machine Identity Console › Inbound integrations, OAuth - Authorization code grant, its token format JWT, Jean's address as its redirect), and policy names the instance's MCP server with that app's client id (`"directory": [{ "id": "servicenow", "url": "https://<instance>.service-now.com/sncapps/mcp-server/mcp/sn_mcp_server_default", "clientId": "…" }]`); an app with a secret goes in `clients` instead, with the instance as its issuer, and policy names it as `app` in place of `clientId`. With `npm run dev:gateway`, the redirect is `http://127.0.0.1:4173/`, and the apps go in `GATEWAY_CONFIG` before the command.

**Desktop:** `npm run build:desktop` puts the same files in an app for macOS, Windows and Linux, in `dist/desktop/`: a window of the system's own web view, with Jean's files inside, made with [Neutralino](https://neutralino.js.org). It needs nothing else on macOS and Windows; Linux needs WebKitGTK. The window gives Jean only what Sync needs: the system's dialog for a folder, the folder's files, and its file manager (D155, D169). On a Mac, `npm run build:dmg` also makes the disk image to hand out.

**In an editor:** `npx jean-cli acp --folder <the folder Sync keeps>` is Jean inside any editor that speaks ACP, such as Zed, with the projects, memory, skills and conversations the browser has (D241). `npm run cli` makes its package in `dist/cli/`; [cli/README.md](cli/README.md) is its page.

## Develop

| Command | What it does |
|---|---|
| `npm run check` | Builds, type-checks (strict JSDoc with `tsc --noEmit`), runs the tests and checks the budgets |
| `npm test` | The core and storage tests, with `node --test` |
| `npm run e2e` | Smoke tests in Chromium and WebKit against the fake brain (first, once: `npx playwright install chromium webkit`) |
| `npm run reflexes` | Measures Intuition (Kev-0.6B) on the multilingual test set |
| `npm run offers` | Measures how often a brain offers what a request needs, and what it doesn't, on a multilingual test set (`BRAIN=<provider>:<model>`) |
| `npm run build:web` | Builds, then what a web deploy serves in `dist/web/`: Jean's own code minified, each file beside itself in brotli and gzip |
| `npm run render` | Builds, then the package that draws a task saved as a web page, `@codename/jean-render`, in `dist/render/` |
| `npm run sounds -- <folder>` | The instruments scores play, `@codename/jean-sounds`, made of MS Basic as MuseScore's repository holds it, in `dist/sounds/` |
| `npm run build:desktop` | Builds, then makes the desktop apps in `dist/desktop/` (Neutralino's binaries are downloaded once per version) |
| `npm run build:dmg` | The same, then the macOS disk image to hand out, on a Mac |
| `npm run icons` | Draws the PNG icons that Android and iOS install with from `app/icons/icon.svg`, after changing it |
| `npm run screenshots` | Takes the welcome screen's screenshots that the install dialog shows, after changing how it looks |
| `npm run directory` | Checks, from a browser's point of view, which known services Jean can connect to and which sources of skills it can read |

Jean itself, everything a deploy serves, is in `app/`; the root holds what never ships: jean-cli, the gateway, the desktop and container builds, the scripts, the tests and the docs.

CI ([.gitlab-ci.yml](.gitlab-ci.yml)) runs `npm run check` and `npm run e2e` on every push and merge request. Before writing code, read [AGENTS.md](AGENTS.md): it holds the rules any coding agent or human follows here, from the budgets to the security, data and UI rules.

## Read more

| Document | What's in it |
|---|---|
| [MANIFESTO.md](MANIFESTO.md) | Why Jean exists, in one page |
| [docs/product.md](docs/product.md) | The user, the vocabulary, progressive discovery, and how every feature behaves |
| [docs/architecture.md](docs/architecture.md) | Stack, data, security, brains, languages, events |
| [docs/design.md](docs/design.md) | The room that lights up, and the little light |
| [docs/enterprise.md](docs/enterprise.md) | Policy, gateways, what is open and what is enterprise, and what the architecture allows later |
| [docs/roadmap.md](docs/roadmap.md) | The versions, what is still to check by hand, and what the launch needs |
| [docs/decisions.md](docs/decisions.md) | Every decision as it stands, by topic, with the alternatives that were rejected |
| [docs/open-questions.md](docs/open-questions.md) | What is still undecided |
| [docs/background.md](docs/background.md) | Where Jean comes from (DEVS), and the field as of 2026-10-01 |

Jean revisits the ideas behind [DEVS](https://github.com/codename-co/devs) from scratch. It started inside the DEVS repository and moved out on 2026-10-02 with its history (D50). It is self-contained: nothing here reads, imports or copies files from outside this repository.

## License

Jean is open source under the [MIT license](LICENSE). The enterprise integrations in [`app/ee/`](app/ee/) are under the [Elastic License 2.0](app/ee/LICENSE) and need a key. An [additional grant](app/ee/GRANT.md) makes them MIT if keys can't be bought for twelve months (D139).
