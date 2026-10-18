# Open questions

What is still undecided. An answered question becomes an entry in [decisions.md](decisions.md) and leaves this page.

## Answer certificates

What the certificates' next steps hang on ([certificates.md](certificates.md)):

- **A text watermark for the device's brain:** feasible in its sampling, and how detected? An open key makes it detectable by anyone and as easily removed or forged; does that meet "robust and reliable", or is a secret key with a detection service of the maintainer's the only way, which Jean otherwise has no server for?
- **Witnesses outside the US:** none found that answers browsers. Ship a gateway default, or leave each organisation to name its own?
- **Which Settings** should name witnesses, the log and a brain's jurisdiction, and should policy lock them?

## Smaller questions

- **First run while the brain downloads:** what do people see during the ~3 GB download, alongside "start right now with a free account"? Can the download resume after the tab closes?
- **Client ID Metadata Documents for Connections:** publish one at jean.is, so services without dynamic registration accept Jean (D88)? ServiceNow takes them (its admin pastes the document's address instead of registering an app, D283), and needs the redirect of each address Jean is served from.
- **The services not available yet (D95):** what would let each one in at jean.is?
  - **Microsoft 365** (D382): jean.is's app in Microsoft Entra, a single-page app for any organisation's accounts and personal ones, publisher-verified (a Microsoft AI Cloud Partner Program ID), so that organisations' admins consent to it; and whether signing in again once a day is bearable, or jean.is's gateway should hold a web app, which renews for 90 days.
  - **Google** (D344, D349): Google verifying Jean's app, so that anyone can sign in rather than the test users it lists (a review of its sensitive scopes, and a yearly security assessment for Gmail's and Drive's restricted ones); Google ending the developer preview, and its servers answering browsers.
  - **Slack and Dropbox:** CORS, plus open registration for Slack. Dropbox, like Figma, registers only the apps on its list: ask both to add Jean.
- **Helpers on a cheaper brain?** Helpers use the brain that delegated (D98). Auto could give them a lighter tier: cheaper, but one answer would then mix two models' work. To decide with real tasks.
- **A catalogue of projects:** an index of project folders, as skills' discovery indexes are, or a plugin marketplace's `marketplace.json`, which already bundles skills and connections? And what a project carries without its secrets (connections as names and addresses only).
- **Requests between people's Jeans (D226):** A2A's messages over the relay, or ACP's? How a person is named to send to: a pairing link once, then a name in the user's own list?
- **Continuity (D227):** which settings follow a person (brains and connections listed without their keys, so another device asks only to sign in again, which amends D157's "settings stay on each")? Where a routine runs when several devices are open: the device that made it, or the first to claim the run in the mirror? What a phone keeps, when Safari evicts a site's data after 7 days unless it is installed?
- **Profiles (D228):** the word in the UI ("Profile", as browsers say, or one of the house's), and whether a routine of a profile not open runs.
- **Double-check with Intuition one day?** If Jean's fine-tuned reflexes (D328) learn "does this passage support this sentence?" in every launch language, checks could stay on the device and cost nothing (D100).
