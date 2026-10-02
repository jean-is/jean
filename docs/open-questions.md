# Open questions

Answered on 2026-10-02 and moved to [decisions.md](decisions.md): reflex backend (D41), on-device brain (D42), where Pyodide's files come from (D43), language review (D44), the old DEVS domain (D38), license (D39), minimum Safari (D40), collaboration relay (D45). Answered while building 0.4: how the sandbox loads Pyodide (D80). Answered while building 0.5: the MCP client, Jean's own (D87). The visual identity stays as planned in [design.md](design.md), with no comparison to OpenAI Dots.

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
- **Client ID Metadata Documents for Connections:** publish one at Jean's domain once it is chosen, so services without dynamic registration accept Jean (D88)?
- **The services not available yet (D95):** what would let each one in, once Jean has its domain?
  - **Microsoft 365** (`microsoft365.mcp.claude.com`): Anthropic accepting Jean's origin, and a single-page-app redirect for Jean's domain on its Entra app.
  - **Gmail, Google Drive, Google Calendar and Google Chat:** Google ending the developer preview, and its servers answering browsers.
  - **Slack and Dropbox:** CORS, plus open registration for Slack. Dropbox, like Figma, registers only the apps on its list: ask both to add Jean.
  - **Atlassian:** naming `Authorization` in its CORS, and publishing where to sign in.
  - **Google Meet and Google Tasks:** a server at all.
