# Jean

> An AI agent that runs in a browser tab. Nothing to install, no account, your files never leave your machine.

This repository holds **Jean** (a working name): its plan and its code. Jean is a standalone project that revisits the ideas behind [DEVS](https://github.com/codename-co/devs) from scratch; it started inside the DEVS repository and moved out on 2026-10-02, keeping its history (D50). The plan comes out of a strategy session held on 2026-10-01; version 0.1 ("Talk") was built on 2026-10-02.

|  |  |
|---|---|
| Status | 0.2 "Read and keep" built: files in (PDF, Office), a brain on the device, prompt caching, backups, dictation. 0.1 "Talk": chat with any brain, three languages, offline, conversations as plain files |
| Working name | Jean — a variable, not final (see [open questions](docs/open-questions.md)) |
| Domain candidate | jean.cx (unregistered as of 2026-10-01) |
| First user | A non-technical knowledge worker |
| Goal | Open source and reputation first; revenue is secondary |
| License | [MIT](LICENSE) |

## Read in this order

| # | Document | What's in it |
|---|---|---|
| 1 | [MANIFESTO.md](MANIFESTO.md) | Why Jean exists, in one page |
| 2 | [docs/assessment.md](docs/assessment.md) | An honest look at DEVS, and what carries over |
| 3 | [docs/landscape.md](docs/landscape.md) | Competitors and the standards Jean builds on, as of 2026-10-01 |
| 4 | [docs/product.md](docs/product.md) | User, vocabulary, progressive discovery, how every feature behaves |
| 5 | [docs/architecture.md](docs/architecture.md) | Stack, data, security, models, languages, events |
| 6 | [docs/design.md](docs/design.md) | Art direction and its budget |
| 7 | [docs/enterprise.md](docs/enterprise.md) | Policy, gateways, and what the architecture allows later |
| 8 | [docs/roadmap.md](docs/roadmap.md) | Build order and launch |
| 9 | [docs/decisions.md](docs/decisions.md) | Decision log, with the alternatives that were rejected |
| 10 | [docs/open-questions.md](docs/open-questions.md) | What is still undecided |

Also here:

- [AGENTS.md](AGENTS.md) — the rules any coding agent (or human) follows when writing Jean's code
- [prompts/system.md](prompts/system.md) — the draft system prompt
- [budgets.json](budgets.json) — size limits that CI will enforce

## Running it

No build step. Any static file server works; for development:

```bash
npm install          # Jean's own packages
npm run dev          # copy runtimes into vendor/, then serve http://127.0.0.1:4173
npm run check        # manifest, strict typecheck, tests, budgets
npm run build        # copy runtimes into vendor/ and regenerate the manifest, ready to deploy
node test/fixtures/fake-brain.js   # a fake brain: connect "On your computer" → Other → http://127.0.0.1:4174/v1
```

Nothing in `vendor/` is committed. `npm run dev`, `npm start`, `npm run build` and `npm run check` copy the three upfront libraries, and the on-demand runtimes (pdf.js, Transformers.js; from 0.4, Pyodide), in from Jean's own `node_modules` (D43, D51, D52).

## Self-contained

Everything here uses relative links, and nothing reads, imports or copies files from outside this repository (D38).
