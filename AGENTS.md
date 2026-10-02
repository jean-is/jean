# AGENTS.md — building Jean

> Status: 0.5 built. This file is the contract for any coding agent (or human) who writes Jean's code. Read [README.md](README.md) first, then [docs/architecture.md](docs/architecture.md).

## What Jean is

An AI agent that runs in a browser tab, for non-technical knowledge workers anywhere in the world. No install, no account, no Jean server. Data lives on the device as plain files. Capabilities reveal themselves progressively, like a game.

## Non-negotiables

1. **Budgets are law.** [budgets.json](budgets.json) is checked in CI. Going over a limit means deleting something first. Never raise a limit in the same change that needs it.
2. **No build step.** Plain ES modules plus an import map, with JSDoc types checked by `tsc --noEmit`. Jean's own code ships exactly as written. There are two exceptions to "what is in the repo is what ships", and neither is committed. Third-party code: `npm run dev`, `npm start`, `npm run build` and `npm run check` fill `vendor/` from Jean's own `node_modules`. Generated listings: the same commands write `capabilities.json` and `manifest.webmanifest`. Deploying means `npm ci && npm run build`, then copying the folder.
3. **Three runtime dependencies are loaded upfront:** `@preact/signals-core`, `lit-html` and `marked` (lexer only). Everything else loads on demand inside a capability module. Adding a dependency requires an entry in [docs/decisions.md](docs/decisions.md).
4. **Standards before inventions:**
   - **Model APIs:** OpenAI-compatible and Anthropic Messages.
   - **Connections:** MCP.
   - **Routines:** `SKILL.md`.
   - **Activity events:** ACP `session/update`.
   - **Reflexes:** the Jev-style Decisions API.
   - **Everything else:** `Intl` and Web Platform APIs before any library.
5. **The core is host-agnostic.** `core/` uses only web-standard APIs (fetch, streams, Web Crypto, WebAssembly) and never touches the DOM. Core tests run with `node --test`.
6. **Self-contained.** Jean is its own project, not a part of DEVS. Nothing in this repository reads, imports or copies files from outside it. Scripts resolve packages from this repository's `node_modules` only, never a parent folder's.

## Security rules

- Never combine `allow-scripts` and `allow-same-origin` on an iframe.
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

## UI rules

- **Components:** custom elements, light DOM, prefix `app-`. One module per capability defines its elements and registers its tools; unlocking a capability means `import()`-ing that module.
- **Strings:**
  - Every user-facing string goes through `t()`.
  - Never build sentences by concatenating strings.
  - Plurals use `Intl.PluralRules`; dates, numbers and lists use `Intl.*`.
  - Never make a translation agree grammatically with the assistant's name.
- **Bidirectional text:** CSS uses logical properties only (`margin-inline-start`, never `margin-left`), and every message element gets `dir="auto"`.
- **Vocabulary:** none of these words appear in the UI: "agent", "model", "MCP", "skill", "token". See the vocabulary in [docs/product.md](docs/product.md).
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
npm run check   # vendor, manifest, tsc --noEmit (strict), tests, budgets
npm test        # node --test test/*.test.js
npm run e2e     # Playwright smoke tests in Chromium and WebKit (once: npx playwright install chromium webkit)
npm run reflexes  # measure Kev on the multilingual reflex test set (-- --lang fr,ja, -- --write)
npm run directory # check from a browser's point of view which known services Jean can connect to
npm run serve   # serve the folder as it is
```
