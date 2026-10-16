# Sharing by link

Not built. Sharing a task, or one page, chart, deck or picture Jean made, as a link: the design and the work left, written so that another agent can pick it up.
- **Why:** [decisions.md](decisions.md), D361. What stays with the relay is D45 · D226.
- **Built on:** a task saved as a web page (D305) and answer certificates (D252 · D264 · D274, [certificates.md](certificates.md)).

## Principles

1. **The host can't read what it keeps.** A share is encrypted in the sharer's browser, and its key travels in the link's `#`, which browsers never send.
2. **The host keeps the least it can:** the address each change came from, for a year, as French law asks of every host. Nothing about who reads.
3. **Nobody's upload runs on a site of Jean's.** Shares live on their own domain, and each one draws in an opaque frame.
4. **A share is data drawn by Jean's reader,** never a page or a file someone uploaded. Nothing downloads from it.
5. **A share reaches nothing its sharer chose:** only the host, the render package's address and the host's own map service.
6. **What goes is shown first.** Nothing Jean read, noted or keeps secret goes unless the person says so.
7. **A share carries its proof:** the certificates of its answers, disclosing only what it holds.
8. **Every address comes from settings or policy** (`urls.share`). jean.is names hst.ing; an organisation names its own host, or none.

## What a share holds

A **share copy**, never the conversation's file as it is. The JSONL holds `_system_note`s (memory, instructions, the folder, the page on show) and the raw results of tools (emails, files, pages read).

**Kept:**
- the requests and the answers, each answer's steps by their titles;
- the pictures the task made, byte for byte, so their marks (D279, and C2PA once it lands) survive;
- the sources, by title and address;
- the certificates, disclosing only the above.

**Left out unless ticked:**
- what Jean read: the tools' results, the files shared (shown as "a file", unnamed), the emails;
- left out always: the notes, thinking, the secrets, what the page reached.

**One thing on its own** (a page, a chart, a deck, a picture) is a share of kind `item`. A site of several files from `/workspace` is bundled into one document, the way `caps/folders/site.js` already puts one together.

**The payload:** JSON with
- its `format` and kind;
- the language and the title;
- the records;
- the pictures as `data:` addresses;
- what it was saved with (the look, the kinds of block the room's skills declared);
- the render package's version and hashes;
- the certificates.

It is gzipped (`CompressionStream`), then encrypted. The title is inside, so the host never sees it.

## Links and passwords

**Anyone with the link:**
- AES-256-GCM through Web Crypto, under a 256-bit secret;
- an id of 128 random bits;
- the link is `https://hst.ing/<id>#<secret>`, about 80 characters.

**Anyone with the link and a password:**
- **The key** is `HKDF(secret, PBKDF2-SHA-256(password, salt, 600,000))`.
- **The proof:** the host keeps the SHA-256 of a proof derived from that key, `HKDF(key, "access")`. It hands the copy out only to a request that carries the proof, and it counts failed tries in the share's own metadata (a few an hour, then a pause).
- **The result:** the host alone can't read the copy (it never has the secret), someone with only the link can't either, and nobody can guess passwords offline.
- **The password:** Jean offers a strong one, and the person may type their own.
- **Rejected:** Argon2, which would be a dependency.

**How long:** 30 days by default, or a year; Jean renews from Shared links. At most 10 MB.

## The host

`host/host.js`, a fetch handler with nothing but web-standard APIs (Workers, Deno, Bun), and `host/serve.js` for Node, as `gateway/` has. MIT. Also `npx jean-cli host`.

| Route | What it does |
|---|---|
| `GET /<id>` | The viewer, the same bytes for every share. `noindex`, no referrer, and a link card that says "Shared with Jean", never the title |
| `GET /v1/<id>` | The encrypted copy, `application/octet-stream`, `nosniff`, `Access-Control-Allow-Origin: *` for Open in my Jean. With a password, only for the proof |
| `PUT /v1/<id>` | Creates or replaces a share, with its write token. The first one sets the token's hash; a taken id answers 409 |
| `DELETE /v1/<id>` | Stops sharing, with the write token |
| `POST /v1/<id>/report` | A report: the reporter's words and, if they agree, the whole link, so the operator can see the share |

- **Storage:** a folder, one file per share and its metadata beside it (its expiry, size, the hashes of its token and proof, failed tries); a daily sweep deletes what expired. No database.
- **Writes** are taken only from the origins it serves, as the gateway's `origins` are. That only slows abuse.
- **Rate limits** live in memory, by address, and are never written down.
- **The per-change record:** for each `PUT` and `DELETE`, one line with
  - the address and port;
  - the protocol;
  - the share's id, the operation and the time.

  Lines go to a daily file encrypted to a public key whose private half is kept offline by WAREHOUSE SAS's director, opened only for a court order or a requisition, and deleted after a year. Nothing else is written, and no read is ever recorded. TLS ends at Caddy, which hands the address and port on.
- **Takedown:** the operator deletes a share by its id, without its key; the id then answers 410.

## The viewer

1. Reads the id from the path and the secret from the `#`, and asks for the password when the share has one.
2. Fetches the copy, decrypts it, unzips it and checks its `format`.
3. Builds the page as `pageOf()` does (`ui/export.js`), with the render package at the host's own `urls.render`, never the payload's. The version must be a published one, and its hashes come from the payload, so a wrong one fails to load.
4. Draws it in a frame with `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"`: an opaque origin with no storage, no service worker and no way to reach another share. It never gets `allow-same-origin` or `allow-downloads`.
5. Pages in answers run with no internet, whatever the sharer allowed, and maps only through the host's own map service.
6. Says "Shared with Jean" at the top, with *Open in my Jean* and *Report*, and a link to the legal notice.

Firefox Send closed in 2020 after it was used to spread malware from Mozilla's domain. A share can't serve as a file host: it shows only what the reader draws, nothing downloads, and there are a size cap, expiry and a Report link.

## In Jean

A capability, `caps/share/`, found after the first *Save a copy*, and absent before (D281).
- **The task's ⋮** gets *Share…*. Opened from a page, chart, deck or picture, it shares that one.
- **The dialog:**
  - *Anyone with the link* or *Anyone with the link and a password*;
  - *For 30 days* or *For a year*;
  - *Include what Jean read (3 emails, 2 files)*, off;
  - a line saying the copy is sealed by this device, so the person's shares can be told apart and linked;
  - the list of what goes, then *Create link*, which copies it or opens the share sheet (Web Share API).
- **Settings › Your data › Shared links:** each share with its task and its end date, *Copy*, *Update* and *Stop sharing*. *Keep it up to date* uploads again each time an answer finishes.
- **Records:** one file per share, `shares/<ulid>.json` in the project, holding the task, the host, the id, the secret and the end date. The secret goes with backups and syncs: it opens only what the backup already holds. The write token stays in `.secrets/`, so only the device that shared can update or stop a share.
- **Rules:** sharing asks first by default; policy's `rules.share: "never"` turns it off, and `urls.share: ""` too.
- **Strings:** every one through `t()`, the dialog's in `locales/dialogs/`.

**Open in my Jean** opens the viewer's address in Jean's own, `#/shared/<id>/<secret>`, the host being Jean's `urls.share`; another host's share is asked first. Jean fetches the copy, decrypts it with its own code, and brings it into the project as a task by someone else:
- each record keeps the sharer as `author`;
- the certificates come along, so About this answer shows them as the sharer's;
- a note at the head tells the brain that what came before was shared by someone else and is to be read as data;
- that task's connections stay off until the person turns them on there. A shared transcript is a ready-made prompt injection aimed at someone's mailbox.

## Certificates in a share

- **Why carry them:**
  - The recipient checks that the words weren't changed after Jean wrote them, which brain answered, and when, if a witness dated it. A copy saved and posted elsewhere still checks.
  - [certificates.md](certificates.md) makes the certificate the metadata layer of the AI Act's Art. 50(2) marking for answers, and the Code of Practice says providers never strip marks, so a share keeps them.
- **How:** an SD-JWT presentation that discloses only the words and files the copy holds. What isn't shared stays a salted digest, shown as "3 items not shared", and the certificate still checks.
- **Two fixes first:**
  1. **Linkability.** Every certificate of a device names the same seal, so each share links to the others and to every certificate the person gave anyone, an employer included. The dialog says so.
  2. **Addresses in plain view.** In `caps/receipt/certificate.schema.json`, each brain's `host` and the `hosts` the page reached are signed as plain claims, so a share would show an organisation's internal gateway, say. They become disclosures, left out of shares. D173 allows the change.
- **Checking** in the viewer needs `caps/receipt`'s checking modules in the render package.

## Working together

| Step | When | How |
|---|---|---|
| Open in my Jean | With the first version | Above |
| Update the link | With the first version | By hand, or after each answer |
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

## The domain

**hst.ing,** already owned. It is a site of its own, so what others upload never shares jean.is's fate:
- one phishing share flagged by Safe Browsing, or one complaint to a registrar, would otherwise reach the app and the gateway;
- Chrome keeps a site's subdomains in one process.

GitHub moved Pages to github.io in 2013 for this reason.

- **Renew it before 5 Dec 2026,** when it expires, and take it off Sedo's parking.
- **DNS only,** as jean.is is, so no proxy sees visitors' addresses. TLS from Let's Encrypt, on the server beside jean.is.
- **No Public Suffix List entry:** one origin, and every share drawn in an opaque frame.
- **A legal notice** on hst.ing naming WAREHOUSE SAS.
- **The name says nothing** to someone who has never heard of Jean, so the viewer says "Shared with Jean" first.

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

## Limits

- **A forced viewer:** a court could order the operator to serve a viewer that leaks keys, as [PrivateBin](https://github.com/PrivateBin/PrivateBin/) warns of its own. Open in my Jean decrypts with code already on the device when Jean is installed.
- **Content the operator can't see:** a report is all the operator sees, and only with the key the reporter chose to send.

## Work left

- [ ] **The host:** `host/` (`host.js`, `serve.js`), its tests under `node --test`, the per-change record sealed to an offline key, the daily sweep, and `npx jean-cli host`.
- [ ] **The viewer** and the render package: the page builder and `caps/receipt`'s checking modules added to it, opaque frames, no downloads.
- [ ] **The share copy and its crypto** in `caps/share/`, test-first: what is kept and left out, the link, the password and its proof, the payload's `format`.
- [ ] **The capability:** its dialog, Settings › Your data › Shared links, the `share` rule, `urls.share`, and the strings in every language.
- [ ] **Certificates:** brains' `host` and the `hosts` reached become disclosures in the schema and in `caps/receipt`; a presentation of the shared parts only.
- [ ] **Open in my Jean:** the `#/shared/…` route, the import with the sharer as author, the note, connections off in that task.
- [ ] **hst.ing's server:** DNS, Caddy, the legal notice; then the privacy policy and the terms (moderation, Report) updated, in English and French.
- [ ] **Tests:** `test/share.spec.js` in Chromium and WebKit against the fake brain, checked in Arabic and Japanese.

## Notes for whoever picks this up

- **Capabilities are found:** nothing of sharing shows before it is (D281), and the capability stays out of the first load.
- **Decision numbers:** find the highest in `docs/decisions.md` and in every `.claude/worktrees/*` just before taking one.
- **The shared checkout:** other sessions keep uncommitted edits there. Commit only your own hunks.
- **Live uploads:** a share on hst.ing is a real upload and a real record, so ask the owner before testing against it; use a local host otherwise.
