# AGENTS.md — building Jean

> Status: 0.8 built. This file is the contract for any coding agent (or human) who writes Jean's code. Read [README.md](README.md) first, then [docs/architecture.md](docs/architecture.md).

## What Jean is

An AI agent that runs in a browser tab, for non-technical knowledge workers anywhere in the world. No install, no account, no Jean server. Data lives on the device as plain files. Capabilities reveal themselves progressively, like a game.

## Non-negotiables

1. **Budgets are law.** [budgets.json](budgets.json) is checked in CI, and by `npm run dev` after every change, which says as soon as one is over (D244). Going over a limit means deleting something first. Never raise a limit in the same change that needs it.
2. **No build step.** Plain ES modules plus an import map, with JSDoc types checked by `tsc --noEmit`. Jean's own code runs exactly as written, from `app/`, which holds everything a deploy serves and nothing else; the root holds what never ships (D243). Paths to Jean's own files, here and in the docs (`core/fs.js`), are `app/`'s. There are three exceptions to "what is in the repo is what ships", and none is committed. Third-party code: `npm run dev`, `npm start`, `npm run build` and `npm run check` fill `app/vendor/` from Jean's own `node_modules`. Generated listings: the same commands write `capabilities.json`, `manifest.webmanifest` and one per language in `manifests/` in `app/`, with a copy of `LICENSE`, and the site's pages every copy has (D438). The web's copy: `npm run build:web` puts `app/` in `dist/web/`, Jean's own code minified (never the service worker, the bridge, the pages or third-party code) and each file beside itself in brotli and gzip (D318). Deploying means `npm ci && npm run build:web`, then copying `dist/web/`, and publishing the render package when its version is new (`npm run render`, then `npm publish ./dist/render`, D305), which `npm run deploy` does first (D321).
3. **Three runtime dependencies are loaded upfront:** `@preact/signals-core`, `lit-html` and `marked` (lexer only). Everything else loads on demand inside a capability module. Adding a dependency requires an entry in [docs/decisions.md](docs/decisions.md).
4. **Standards before inventions:**
   - **Model APIs:** OpenAI-compatible and Anthropic Messages.
   - **Connections:** MCP.
   - **Skills:** `SKILL.md`.
   - **Activity events:** ACP `session/update`.
   - **Reflexes:** the Jev-style Decisions API.
   - **Everything else:** `Intl` and Web Platform APIs before any library.
5. **The core is host-agnostic.** `core/` uses only web-standard APIs (fetch, streams, Web Crypto, WebAssembly) and never touches the DOM. Core tests run with `node --test`.
6. **Self-contained.** Jean is its own project, not a part of DEVS. Nothing in this repository reads, imports or copies files from outside it. Scripts resolve packages from this repository's `node_modules` only, never a parent folder's.

## Security rules

- Never combine `allow-scripts` and `allow-same-origin` on an iframe that could hold Jean's own origin: code a brain wrote, a file, Jean's pages. The browser's frame, which only ever holds another site, is the one exception (D140).
- Untrusted code (JavaScript or Python written by a model, an extension's module) runs only in a sandbox worker started by `sandbox.html`, never in the main document.
- In the main document: no `innerHTML`, no `eval`, no `new Function`. Markdown is rendered from `marked` tokens into lit-html templates. Trusted Types is enforced.
- No hard-coded third-party URL. Every external address comes from settings or policy.
- Secrets never enter backups, exports, syncs or shares.
- Default action rules: reading and writing Jean's own files → do it; sending, sharing, deleting, anything external → ask first; passwords and payments → never.

## Data rules

- Only `core/fs.js` touches storage. Data is plain files in OPFS (or a mirrored real folder), sealed at rest by the storage worker (D371): never write to OPFS around it.
- **Files and names:**
  - One file per entity, named with a ULID and never renamed.
  - Conversations are append-only JSONL of ACP records, except when the user goes back to a request, which removes what came after it (D188).
  - Attachments are named by content hash.
- **Indexes:** there is no central index of record. Indexes live in `.cache/` and can always be rebuilt.
- **Metadata:** every entity carries `author` and timestamps, and every file carries a `format` version.
- **No backward compatibility before the public launch** (D173): no aliases, migrations or readers of older shapes. Change the code and its tests instead.
- **`BRAND` is for display only.** Never use it in storage keys, file paths, cache names, CSS classes or element names. The element prefix is `app-`.

## Licensing

- Everything outside `ee/` is MIT. `ee/` holds the enterprise integrations, under the Elastic License 2.0 plus the grant in `ee/GRANT.md` (D139).
- Only what an organisation's IT, security or compliance team asks for goes in `ee/`. Never the person's own security, a standard Jean speaks, or anything already open: features never move from open to `ee/`.
- Every file in `ee/` starts with `// SPDX-FileCopyrightText: 2026 Warehouse SAS` and `// SPDX-License-Identifier: Elastic-2.0`. Never copy code across the line, in either direction.
- One module outside `ee/` loads it, with `import()`, and only when policy holds a key. The key check lives in `ee/`. Jean works completely with `ee/` deleted.

## UI rules

- **Components:** custom elements, light DOM, prefix `app-`. One module per capability defines its elements and registers its tools, hooks and slots (D293). Unlocking a capability means `import()`-ing that module.
- **Strings:**
  - Every user-facing string goes through `t()`.
  - Never build sentences by concatenating strings.
  - Plurals use `Intl.PluralRules`; dates, numbers and lists use `Intl.*`.
  - Never make a translation agree grammatically with the assistant's name.
  - A string that only dialogs show lives in `locales/dialogs/<lang>.json`, loaded with them; the rest in `locales/<lang>.json`. `test/locales.test.js` checks which modules use each one (D97).
  - A ready-made skill's name and few words live in its own `SKILL.md`, as `title-<lang>` and `text-<lang>` in `metadata`, never in `locales/` (D222).
- **Bidirectional text:** CSS uses logical properties only (`margin-inline-start`, never `margin-left`), and every message element gets `dir="auto"`.
- **Vocabulary:** none of these words appear in the UI: "agent", "model", "MCP", "token". A `SKILL.md` is a skill. A routine is a task Jean does on a schedule (D115, D122). See the vocabulary in [docs/product.md](docs/product.md).
- **Accessibility:** respect `prefers-reduced-motion`, `prefers-contrast` and `forced-colors`. Contrast meets WCAG AA everywhere, including in the dark first-run state.
- **Tips:** an icon button's `aria-label` is its tip; never repeat it in a `title`, which is only for what the name doesn't say (D233).
- **Text input:** never send on Enter while an IME is composing (`event.isComposing`).
- **HTML in template strings:** a template string that holds HTML, from a whole page to one element, nested ones included, opens with `/* html */` (``return /* html */ `<li>…` ``), so editors show it as HTML. lit-html's `` html` `` needs none, and XML, tags in a brain's prompt and regular expressions take none.

## Site pages

- Every page beside the app (the homepage, the family page, the page for IT, the privacy policy, the terms, where files go, and any to come) is a folder of `site/`: its `page.js`, its words as `<lang>.json` and its look as `<folder>.css`, over `site.css`, written by `site/site.js` with the site's own top and foot (D438). Never a page anywhere else, and no head, top or foot of its own.
- Every page is in English and French at least, and passes `site/checks.js`: accessibility, what search engines read, its languages, its links. `build:web`, `npm run build` and `npm test` enforce it, and axe-core checks contrast in `npm run e2e`. Fix the page, never the check.
- Only a page that `ships` goes into `app/`, written there by `npm run build`; the others only jean.is serves.

## Prompts

The base prompt lives in `core/prompt.js` and stays within its 200-token budget. Each capability contributes one tool line and at most a few rules. No personas, and no shouting (no ALL CAPS, "ALWAYS" or "ONLY").

The prompt and the declared tools are frozen for the life of a conversation. Changes go into the transcript as system notes, and tools that arrive later are deferred (see [docs/architecture.md](docs/architecture.md#prompt-tools-and-caching)). Never edit or delete anything the brain has already read, unless the user goes back to a request (D188). When a conversation nears its brain's window, a summary is appended and the brain reads on from the last one, the file keeping everything (D359).

## Docs

- What Jean tells people about itself comes from `caps/own-skills/guide.txt`, in plain English for the brain: a capability added or changed updates its part there (D423).
- Docs describe Jean as it is now; history lives in git. No "as built in 0.x", "since Dnnn" or "until Dnnn" asides, no changelog, no budget snapshots (`npm run budgets` prints them).
- A decision goes into [docs/decisions.md](docs/decisions.md) as its header says: short (what, why, what was rejected), merged with the entries it amends, under the section it belongs to. How a feature works goes into architecture.md or product.md, once.
- The roadmap keeps one line per version and one checklist of what is still to check by hand.

## Testing

- Use `node --test` for `core/`, test-first for `core/` and storage.
- One Playwright smoke test per capability, `test/<capability>.spec.js` beside the unit tests' `*.test.js`, run in Chromium and WebKit against the fake brain (`npm run e2e`). It is separate from `npm run check` because it needs browsers.
- Every UI change gets checked in one right-to-left locale (Arabic) and one CJK locale (Japanese).

## Commands

```bash
npm run dev     # build (vendor + manifest), then serve with the gateway, a share host and jean.is's pages at once (the last three below), checking the budgets after each change
npm start       # the same, Jean alone: what the preview's launch.json runs, since one server at a time holds the share host's port
npm run dev:gateway  # npm start, with the gateway at /gateway, already set for Jean (GATEWAY_CONFIG adds apps)
npm run dev:share    # npm start, with a share host on its own port (SHARE_PORT, 8788), already set for Jean, its viewer drawing from app/
npm run dev:home     # npm start, with every page of site/ as jean.is has them: the page under the first screen, /ja, /ar…, /family…, and the request service at /keys (D397, D438, D446)
npm run build   # copy runtimes into app/vendor/, regenerate the manifest
npm run build:web  # build, then dist/web/: what a web deploy serves, Jean's own code minified, each file beside itself in brotli and gzip (D318); POLICY='{…}' adds the site's policy.json (D344), ADDRESS=https://…/ its opensearch.xml (D353) and what search engines and shared links read (D355)
npm run deploy  # build:web from a commit in git, never the working tree, then the render package on npm if it lacks that version (D321), then a new release on DEPLOY_TO (host:/path) over SSH, switched to at once (D320)
npm run release # build a commit from git as deploy does, then dist/release/: the zip and bill of materials an organisation deploys without building, their SHA256SUMS signed with RELEASE_KEY and checked against docs/trust/allowed_signers (D419)
npm run tenant -- add <host> --policy <file>  # a copy Warehouse SAS hosts at an organisation's address: its policy checked as policy.html would there, then dist/tenants/ for the server's Caddy (TENANTS=<registry.json>; remove, list, write; D456)
npm run render  # build, then the package that draws a task saved as a web page, and a share’s viewer, in dist/render/, for npm publish ./dist/render (D305)
npm run host    # build, then the share host in dist/host/, its viewer from the render package of this version (D361)
npm run sounds -- <MuseScore's share/sound>  # the instruments scores play, MS Basic's, as a package in dist/sounds/, for npm publish ./dist/sounds (D338)
npm run build:desktop  # build, then the desktop apps for macOS, Windows and Linux in dist/desktop/, with Neutralino (D155)
npm run build:dmg      # the same, then the macOS disk image, on a Mac
npm run icons   # draw the PNG icons that installs need from icons/icon.svg, after changing it
npm run screenshots  # take the install dialog's screenshots, four pages in each language (-- fr ja: only these), after changing Jean's look
npm run check   # vendor, manifest, tsc --noEmit (strict), tests, budgets
npm test        # node --test test/*.test.js
npm run e2e     # Playwright smoke tests in Chromium and WebKit (once: npx playwright install chromium webkit)
npm run reflexes  # measure Kev on the multilingual reflex test set (-- --lang fr,ja, -- --write)
npm run offers    # measure what a brain offers on the multilingual offer test set (BRAIN=<provider>:<model>, -- --write)
npm run tutor     # measure how often a brain gives the answer to a child's work, on the multilingual tutor test set (BRAIN=<provider>:<model>, JUDGE=<provider>:<model>, -- --write)
npm run concepts  # read the picture check's words into app/caps/pictures/concepts.json, after changing one (D280)
npm run documents # the document evals: corpus, retrieval, answers through OpenRouter, benches (-- --report --write)
npm run longtasks # Jean's long-task features against the same brain without them: GDPval, steering, checkpoints, summaries and plans (BRAIN=<provider>:<model>, -- --write)
npm run directory # check from a browser's point of view which known services and sources of skills Jean can reach
npm run csp     # the pages' policies in every browser here: Playwright's engines, Chrome and Edge themselves, then Safari and Firefox over WebDriver (D326)
npm run serve   # serve app/ as it is
```
