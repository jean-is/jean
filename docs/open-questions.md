# Open questions

## Name and domain (decide before the public launch)

- **Working name:** Jean. The user isn't attached to it. It likes the "Jean-Claude" pun, and it suits a delegate ("ask Jean").
- **Against it:**
  - coollabsio/jean (Coolify team, ~1.3k stars, jean.build) is an "AI agent" tool with the same name.
  - Jan (45k) is one letter away.
  - English and French pronounce it differently, and searches return denim.
- **Domains checked by whois on 2026-10-01** (confirm with a registrar):
  - `jean.cx` and `jean.is` appear free.
  - `margot.is/.cx`, `colette.is/.cx`, `camille.is`, `sacha.cx` and `remy.cx` appear free.
  - `lou` and `otto` are taken.
  - `.li` can't be checked automatically. The user found `leap.li`, `blur.li`, `span.li` and `leap.is` available, but none convinced.
- **Handles:** on GitHub, `jean` and `jeancx` are taken and `jean-cx` exists but is empty (whose?). On npm, `jean` is an old IoC library.
- **Criteria for an alternative:** a first name (a person you delegate to), 1–2 syllables, said the same way in English and French, unused in AI, with a short domain.

## Reflex backend

Kev-0.6B (Transformers.js, trained in English) or Laya multilingual (laya-ts, 100+ languages, runs on CPU)? Decide with the multilingual test set. A fine-tuned "Jean reflexes" checkpoint is the fallback plan.

## On-device brain

- **The model:** Gemma 4 E2B (~2 GB, WebGPU) is the default candidate. Is there a smaller multilingual model with reliable tool calling for weak machines?
- **The download:** what does the first-run experience look like while 2 GB downloads, alongside the "start right now with a free account" alternative?

## Pyodide sandbox loading

Host `/vendor/pyodide/` with CORS (option a), or transfer the files from the parent document with `connect-src 'none'` (option b)? There is a spike planned in 0.4; see [architecture.md](architecture.md#security).

## Launch languages (~30)

**Candidate list:** am, ar, bn, de, en, es, fa, fr, ha, he, hi, id, it, ja, ko, mr, ms, nl, pl, pt, ru, sw, ta, te, th, tl, tr, uk, ur, vi, yo, zh-Hans, zh-Hant.

**To decide:** who reviews each language.

## Display face

Instrument Serif was chosen provisionally in 0.1 (see D34). Revisit if a face with broader script coverage fits the budget.

## Smaller questions

- Should the old devs.new domain redirect at the 0.3 launch or earlier? And should DEVS be archived with a pointer?
- **License:** assumed MIT, like DEVS.
- **Minimum Safari version:** 16.4, implied by sync access handles. Confirm with real usage data.
- **MCP client:** write a minimal Streamable HTTP client, or load the official SDK on demand (0.5)?
- **Collaboration relay:** who hosts the public one, if anyone (later)?
- **Visual identity:** verify how OpenAI Dots look, to make sure the "light" concept stays distinct.
