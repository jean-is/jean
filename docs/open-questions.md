# Open questions

Answered on 2026-10-02 and moved to [decisions.md](decisions.md): reflex backend (D41), on-device brain (D42), where Pyodide's files come from (D43), language review (D44), the old DEVS domain (D38), license (D39), minimum Safari (D40), collaboration relay (D45). Answered while building 0.4: how the sandbox loads Pyodide (D80). The visual identity stays as planned in [design.md](design.md), with no comparison to OpenAI Dots.

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
- **Also depends on it:** the collaboration relay's subdomain (D45).

## Display face

Instrument Serif ships for now (D34). Fraunces will probably replace it. To check before switching: a static instance (fixed optical size, softness and "wonk"), Latin subset, regular and italic, within the 30 KB budget.

## Smaller questions

- **First run while the brain downloads:** what do people see during the ~3 GB download, alongside "start right now with a free account"? Can the download resume after the tab closes?
- **MCP client:** write a minimal Streamable HTTP client, or load the official SDK on demand (0.5)?
