# AGENTS.md — building Jean

> Status: 0.8 built. This file is the contract for any coding agent (or human) who writes Jean's code. Read [README.md](README.md) first, then [docs/architecture.md](docs/architecture.md).

## What Jean is

An AI agent that runs in a browser tab, for non-technical knowledge workers anywhere in the world. No install, no account, no Jean server. Data lives on the device as plain files. Capabilities reveal themselves progressively, like a game.

## Non-negotiables

1. **Budgets are law.** [budgets.json](budgets.json) is checked in CI. Going over a limit means deleting something first. Never raise a limit in the same change that needs it.
2. **No build step.** Plain ES modules plus an import map, with JSDoc types checked by `tsc --noEmit`. Jean's own code ships exactly as written. There are two exceptions to "what is in the repo is what ships", and neither is committed. Third-party code: `npm run dev`, `npm start`, `npm run build` and `npm run check` fill `vendor/` from Jean's own `node_modules`. Generated listings: the same commands write `capabilities.json` and `manifest.webmanifest`. Deploying means `npm ci && npm run build`, then copying the folder.
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
- Untrusted code (JavaScript or Python written by a model) runs only in the sandbox worker started by `sandbox.html`, never in the main document.
- In the main document: no `innerHTML`, no `eval`, no `new Function`. Markdown is rendered from `marked` tokens into lit-html templates. Trusted Types is enforced.
- No hard-coded third-party URL. Every external address comes from settings or policy.
- Secrets never enter backups, exports, syncs or shares.
- Default action rules: reading and writing Jean's own files → do it; sending, sharing, deleting, anything external → ask first; passwords and payments → never.

## Data rules

- Only `core/fs.js` touches storage. Data is plain files in OPFS (or a mirrored real folder).
- **Files and names:**
  - One file per entity, named with a ULID and never renamed.
  - Conversations are append-only JSONL of ACP records.
  - Attachments are named by content hash.
- **Indexes:** there is no central index of record. Indexes live in `.cache/` and can always be rebuilt.
- **Metadata:** every entity carries `author` and timestamps, and every file carries a `format` version.
- **`BRAND` is for display only.** Never use it in storage keys, file paths, cache names, CSS classes or element names. The element prefix is `app-`.

## Licensing

- Everything outside `ee/` is MIT. `ee/` holds the enterprise integrations, under the Elastic License 2.0 plus the grant in `ee/GRANT.md` (D139).
- Only what an organisation's IT, security or compliance team asks for goes in `ee/`. Never the person's own security, a standard Jean speaks, or anything already open: features never move from open to `ee/`.
- Every file in `ee/` starts with `// SPDX-FileCopyrightText: 2026 CODENAME SAS` and `// SPDX-License-Identifier: Elastic-2.0`. Never copy code across the line, in either direction.
- One module outside `ee/` loads it, with `import()`, and only when policy holds a key. The key check lives in `ee/`. Jean works completely with `ee/` deleted.

## UI rules

- **Components:** custom elements, light DOM, prefix `app-`. One module per capability defines its elements and registers its tools; unlocking a capability means `import()`-ing that module.
- **Strings:**
  - Every user-facing string goes through `t()`.
  - Never build sentences by concatenating strings.
  - Plurals use `Intl.PluralRules`; dates, numbers and lists use `Intl.*`.
  - Never make a translation agree grammatically with the assistant's name.
  - A string that only dialogs show lives in `locales/dialogs/<lang>.json`, loaded with them; the rest in `locales/<lang>.json`. `test/locales.test.js` checks which modules use each one (D97).
- **Bidirectional text:** CSS uses logical properties only (`margin-inline-start`, never `margin-left`), and every message element gets `dir="auto"`.
- **Vocabulary:** none of these words appear in the UI: "agent", "model", "MCP", "token". A `SKILL.md` is a skill. A routine is a task Jean does on a schedule (D115, D122). See the vocabulary in [docs/product.md](docs/product.md).
- **Accessibility:** respect `prefers-reduced-motion`, `prefers-contrast` and `forced-colors`. Contrast meets WCAG AA everywhere, including in the dark first-run state.
- **Text input:** never send on Enter while an IME is composing (`event.isComposing`).

## Prompts

The base prompt lives in [prompts/system.md](prompts/system.md) and stays within its 200-token budget (182 as of 0.5). Each capability contributes one tool line and at most a few rules. No personas, and no shouting (no ALL CAPS, "ALWAYS" or "ONLY").

The prompt and the declared tools are frozen for the life of a conversation. Changes go into the transcript as system notes, and tools that arrive later are deferred (see [docs/architecture.md](docs/architecture.md#prompt-tools-and-caching)). Never edit or delete anything the brain has already read.

## Testing

- Use `node --test` for `core/`, test-first for `core/` and storage.
- One Playwright smoke test per capability, in `e2e/`, run in Chromium and WebKit against the fake brain (`npm run e2e`). It is separate from `npm run check` because it needs browsers.
- Every UI change gets checked in one right-to-left locale (Arabic) and one CJK locale (Japanese).

## Commands

```bash
npm run dev     # build (vendor + manifest), then serve (npm start does the same)
npm run build   # copy runtimes into vendor/, regenerate the manifest
npm run build:desktop  # build, then the desktop apps for macOS, Windows and Linux in dist/desktop/, with Neutralino (D155)
npm run build:dmg      # the same, then the macOS disk image, on a Mac
npm run icons   # draw the PNG icons that installs need from icons/icon.svg, after changing it
npm run screenshots  # take the welcome screen's screenshots for the install dialog, after changing its look
npm run check   # vendor, manifest, tsc --noEmit (strict), tests, budgets
npm test        # node --test test/*.test.js
npm run e2e     # Playwright smoke tests in Chromium and WebKit (once: npx playwright install chromium webkit)
npm run reflexes  # measure Kev on the multilingual reflex test set (-- --lang fr,ja, -- --write)
npm run directory # check from a browser's point of view which known services and sources of skills Jean can reach
npm run serve   # serve the folder as it is
```
