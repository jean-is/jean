# Open questions

What is still undecided. An answered question becomes an entry in [decisions.md](decisions.md) and leaves this page.

## Answer certificates

What the certificates' next steps hang on ([certificates.md](certificates.md)):

- **Witnesses outside the US:** none found that answers browsers. Ship a gateway default, or leave each organisation to name its own?
- **Which Settings** should name witnesses, the log and a brain's jurisdiction, and should policy lock them?

## Smaller questions

- **First run while the brain downloads:** what do people see during the ~3 GB download, alongside "start right now with a free account"? Can the download resume after the tab closes?
- **Client ID Metadata Documents for Connections:** publish one at jean.is, so services without dynamic registration accept Jean (D88)? ServiceNow takes them (its admin pastes the document's address instead of registering an app, D283), and needs the redirect of each address Jean is served from; Tableau's and Ironclad's sign-ins take them in place of registration.
- **The services not available yet (D95):** what would let each one in at jean.is?
  - **Microsoft 365** (D382): jean.is's app in Microsoft Entra, a single-page app for any organisation's accounts and personal ones, publisher-verified (a Microsoft AI Cloud Partner Program ID), so that organisations' admins consent to it; and whether signing in again once a day is bearable, or jean.is's gateway should hold a web app, which renews for 90 days.
  - **Google** (D344, D349): Google verifying Jean's app, so that anyone can sign in rather than the test users it lists (a review of its sensitive scopes, and a yearly security assessment for Gmail's and Drive's restricted ones); Google ending the developer preview, and its servers answering browsers.
  - **Slack and Dropbox:** CORS, plus open registration for Slack. Dropbox, like Figma, registers only the apps on its list: ask both to add Jean.
  - **Qonto:** registers any address, but asks, before its sign-in, whether the person trusts one not on its list of AI tools, and connects only once an owner or admin of the organisation has added it in Qonto. Ask Qonto to put `https://jean.is/` and the desktop apps' `http://127.0.0.1:24601/` on that list, so that no organisation has to; an organisation's own address stays its own to add.
  - **Docusign:** takes only an integration key made in its Apps and Keys, with a secret, PKCE and `https://jean.is/` as its redirect, promoted to production, then allowlisted for its MCP server through Docusign's form; jean.is's gateway then holds it in `clients`.
  - **Pipedrive:** registers only the redirects on its list, which holds this computer's already: ask its developers for `https://jean.is/`, then its entry drops `app`.
  - **Highspot:** its server (`mcp.highspot.com/mcp`) names the sign-in server `https://app.highspot.com/auth/`, whose metadata calls itself `https://app.highspot.com`, which RFC 8414 forbids and Jean refuses: ask Highspot to make them match, then its entry gets that address, through the gateway (its CORS lets no sign-in through).
  - **Rox:** says it has an MCP server, but publishes no address for it: ask Rox for one before it is a tile.
- **Helpers on a cheaper brain?** Helpers use the brain that delegated (D98). Auto could give them a lighter tier: cheaper, but one answer would then mix two models' work. To decide with real tasks.
- **What a template carries** (D476): a project's instructions, skills, tables and routines, and its connections as names and addresses only, without their secrets?
- **Requests between people's Jeans (D226):** A2A's messages over the relay, or ACP's?
- **Routines on several devices (D227):** where a routine runs when several of a person's devices are open: the device that made it, or the first to claim the run in the store?
- **Profiles (D228):** the word in the UI ("Profile", as browsers say, or one of the house's), and whether a routine of a profile not open runs.
- **Double-check with Intuition one day?** If Jean's fine-tuned reflexes (D328) learn "does this passage support this sentence?" in every launch language, checks could stay on the device and cost nothing (D100).
