# Sharing by link

Sharing a task, or one page, chart, deck or picture Jean made, as a link: what holds it together, the choices behind it, and the work left, written so that another agent can pick it up.
- **How it works:** [architecture.md](architecture.md#sharing).
- **Why:** [decisions.md](decisions.md), D361. What stays with the relay is D45 · D226.
- **Built on:** a task saved as a web page (D305) and answer certificates (D252 · D264 · D274, [certificates.md](certificates.md)).

## Principles

1. **The host can't read what it keeps.** A share is sealed in the sharer's browser, and its key travels in the link's `#`, which browsers never send.
2. **The host keeps the least it can:** the address each change came from, for a year, as French law asks of every host. Nothing about who reads.
3. **Nobody's upload runs on a site of Jean's.** Shares live on their own domain, and each one draws in an opaque frame.
4. **A share is data drawn by Jean's reader,** never a page or a file someone uploaded. Nothing downloads from it.
5. **A share reaches nothing its sharer chose:** only the host, the render package's address and the host's own map service.
6. **What goes is shown first.** Nothing Jean read, noted or keeps secret goes unless the person says so.
7. **A share carries its proof:** the certificates of its answers, disclosing only what it holds, never where it was done.
8. **Every address comes from settings or policy** (`urls.share`). jean.is names hst.ing; an organisation names its own host, or none.

## The domain

**hst.ing,** already owned. It is a site of its own, so what others upload never shares jean.is's fate:
- one phishing share flagged by Safe Browsing, or one complaint to a registrar, would otherwise reach the app and the gateway;
- Chrome keeps a site's subdomains in one process.

GitHub moved Pages to github.io in 2013 for this reason.

- **Renew it before 5 Dec 2026,** when it expires, and take it off Sedo's parking.
- **DNS only,** as jean.is is, so no proxy sees visitors' addresses. TLS from Let's Encrypt, on the server beside jean.is.
- **No Public Suffix List entry:** one origin, and every share drawn in an opaque frame.
- **A legal notice** on hst.ing naming Warehouse SAS.
- **The name says nothing** to someone who has never heard of Jean, so the viewer says "Shared via Jean" first.

| Rejected | Why |
|---|---|
| jean.is/s/…, my.jean.is, share.jean.is | Same site as the app, or the same origin as people's data; "my" also suggests an account Jean doesn't have |
| jean.page | Too expensive |
| jean.link, jean.site | Their TLDs are distrusted by spam filters |
| jeanshare.com | Long, and it reads "jeans hare" |
| Plain pages search engines index | ChatGPT's and Grok's shared chats ended up in Google in 2025, and the host would read everything |
| The whole task in the link | Too long for text messages and some mail, pictures don't fit, and nothing could be taken down |
| The saved page through the person's drive | Drives don't show web pages, so recipients download an `.html`, which people are rightly taught not to open |
| Published sites with their own address | Web hosting, moderated and in plain text: another product |
| Argon2 for passwords | A dependency; PBKDF2 is the browser's own, and the host's proof keeps guesses online |

## Working together

| Step | Where it stands | How |
|---|---|---|
| Continue in Jean | Built | The shared task becomes the recipient's, after a note that it is someone else's, with Jean's own skills for the charts, scores and decks it holds (D378) |
| Update the link | Built | From *Share…* again, which opens on the link made, its choices to change (D379); by hand in Settings › Your data, or after each answer |
| Replies back | Later | Encrypted notes left on a share, arriving in the sharer's Jean as cards: the store-and-forward half of D226, for when the other tab is closed |
| A shared project | Later, with D227 | A project synced to a shared folder of a drive. One file per ULID, `author` on each and append-only conversations were made for it |
| Working live together | Dropped (D45) | The use cases below |

| Live use case | What people already do |
|---|---|
| Two people steering one task in a meeting | Share a screen in the call |
| A tutor following a student's task | Screen sharing, or the student sends the link |
| Helping a relative set Jean up | Screen sharing or a phone call. A live remote is also how scams work ("let me connect your bank") |
| Co-writing a document Jean made | Word or Docs, through the folder OneDrive or Drive already syncs |
| A family asking one Jean together | A group chat; taking turns is enough |
| Following a long task from a phone | One person: D227's phone remote |

## Limits

- **A forced viewer:** a court could order the operator to serve a viewer that leaks keys, as [PrivateBin](https://github.com/PrivateBin/PrivateBin/) warns of its own. Continue in Jean decrypts with code already on the device when Jean is installed.
- **Content the operator can't see:** a report is all the operator sees, and only with the key the reporter chose to send.
- **Linked shares:** every certificate of a device names the same seal, so the shares that carry certificates can be linked to each other, which the dialog says.

## Work left

- [ ] **hst.ing's server:** DNS, a Caddy site in front of `node dist/host/serve.js` (`HOST_PROXIED=1`, the port as `X-Client-Port`), a key pair for the records (`serve.js keys`, its private half kept offline), the legal notice; then jean.is deployed with `POLICY` naming `urls.share`.
- [ ] **The privacy policy and the terms,** in English and French, for the records of changes and for moderation, before jean.is names the host.
- [ ] **A received task's certificates:** the copy drops the brains' calls, so About this answer can't vouch for an answer brought in. Bring the proofs in beside the records, and show them as the sharer's.
- [ ] **By hand:** a share opened in real Safari and Firefox, and on phones; Continue in Jean from a new tab; the share sheet where the browser has one.

## Notes for whoever picks this up

- **Capabilities are found:** nothing of sharing shows before it is (D281), and the capability stays out of the first load.
- **The viewer is the render package's:** a new viewer reaches the host only once the package of its version is on npm and the host is given that `viewer.json` (`npm run host`).
- **Decision numbers:** find the highest in `docs/decisions.md` and in every `.claude/worktrees/*` just before taking one.
- **Live uploads:** a share on hst.ing is a real upload and a real record, so ask the owner before testing against it; `npm run dev:share` and `npm run e2e` run hosts of their own.
