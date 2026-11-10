# Working together

Jean on all of a person's devices, and with other people, without a server that reads: what holds it together, the choices behind it, and the work left, written so that another agent can pick it up.
- **How it works:** [architecture.md](architecture.md): [the relay](architecture.md#the-relay), [your devices](architecture.md#your-devices), [People](architecture.md#people), [Together](architecture.md#together).
- **Why:** [decisions.md](decisions.md): D45 · D226 · D477 (the relay), D700 (pairing carries keys), D227 · D721 (the store), D727 (People), D731 · D732 (colleagues), D733 · D734 · D737 (Together), D736 (nudges).
- **For the person:** the help articles [Work on something together](../site/help/together/), [On all your devices](../site/help/your-devices/) and [Send a task to someone](../site/help/send-to-someone/).

## Principles

1. **The copies are the truth.** Each device, and each person, keeps their own copy, as plain files in Jean's folder. The relay is a meeting point: it orders and passes on what it can't read.
2. **Keys go only where the person is.** Messages are sealed from one device's or person's key to another's, changes under a key only a thing's members hold. The relay keeps hashes of tokens, never a key or a name.
3. **Each person's own Jean answers them.** Their brain, keys, connections, rules and approvals. Another's Jean answers only when its person lets it; nobody's AI acts on someone else's authority.
4. **What comes from someone else is from elsewhere** (D673): another person's words reach a brain quoted, as theirs, never as the person's request, and a task holding them asks before anything goes out.
5. **What goes is shown first,** and nothing of the person's own (their prompt, notes, memory, thoughts, keys) goes unasked.
6. **Ending leaves everyone their copy.** Removing a device, a person or a member stops what is new reaching them, never what they had.
7. **Nothing shows before it is found** (D281), and every address comes from settings or policy (`urls.relay`): jean.is names relay.jean.is, an organisation its own relay, or none.

## The pieces

| Piece | What the person sees | What carries it | Decision |
|---|---|---|---|
| Your devices | Settings › Your devices › Add a device: a QR code or a link, six digits typed on the first device; settings and keys follow | Mailboxes, sealed device to device | D700 |
| The store | Tasks, files and memory the same on every device, Sync's merges | The relay's stores, sealed under keys only the person's devices hold | D227 · D721 |
| People | Settings › People › Add a person (side by side, or a link and six digits back); Share › tick them › Send a copy; answers back into the task | The person mailbox, sealed person to person | D727 |
| Colleagues | Colleagues under *At <organisation>* in Send to…, with no meeting | The organisation's own relay, listing people by their checked ID token; `ee/`'s controls | D731 · D732 |
| Together | Share › tick people › Work on it together, or Copy an invitation link instead; faces of who is here; People in this…; Your devices ticked alone; a project's Work on this project together | Journals: each change signed by its member and sealed under the circle's key | D733 · D734 |
| Nudges | A notification, with Jean closed, that something came, never what or from whom | Web Push with no payload, signed by the relay | D736 |

Together binds what each kind of thing's changes are:
- **A collection:** lines of its `changes.jsonl`, merged as Sync merges tables.
- **A task:** records, each named by its writer; one answer at a time (the baton); others' turns after a note naming them.
- **A document or a deck:** its Markdown, merged three ways from the last version both had.
- **A project:** its documents, collections, decks, designs and files, through Sync's own rounds against the journal's copy. Never its tasks, memory or instructions: a task in it is worked on together on its own.

## What the relay keeps

| What | How long |
|---|---|
| A mailbox's messages, sealed | 7 days; a mailbox nobody opens or reads, 90 |
| A person's store, sealed | 1 GB; deleted after 183 days unused |
| A journal's changes, sealed and signed | 7 days after the last change; its tokens' hashes as a tombstone 90 days |
| A device's push endpoint, beside its mailbox | Until Notifications are off on the device, or its push service forgets it |
| The address each change came from, as French law asks of a host | A year, sealed when the configuration names a record key; never a read |

The [DPIA](trust/dpia.md) has each row with who receives what, and the [threat model](trust/threat-model.md) what a hostile relay can do: withhold, delay or roll back, never read or forge.

## Running it

- **The configuration** (`RELAY_CONFIG`, [relay/relay.js](../relay/relay.js)): `origins`, the Jeans it serves; `stores: {}` to keep stores; `journals: {}` to keep journals, without which Share offers no *Work on it together*; `issuers`, an organisation's sign-ins whose people it lists; `push`, a VAPID key pair (`node relay/serve.js vapid`), a subject and the push services' hosts, without which nothing is nudged.
- **jean.is:** relay.jean.is, deployed with the rest by CI ([deploy/server/](../deploy/server/README.md)); what its configuration holds is the owner's, on the server.
- **An organisation:** the relay's image or the Helm chart ([architecture.md](architecture.md#deploying)), named in its policy's `urls.relay`.
- **Development:** `npm run dev` serves a relay on 8791 with stores and journals; the browser tests run one on 4187 with nudges to the fake mail's push service.
- **Connections:** a tab follows every journal of its circles over one connection to the relay (D737), beside Your devices' and People's long polls. A relay without TLS speaks HTTP/1.1, over which a browser opens six connections to it: development's, the browser tests', one an organisation runs without TLS. relay.jean.is speaks HTTP/2, many requests over one connection.

## The work left

- **Together:**
  - Answers shown to the others as they are written: today each step shows once written.
  - *Just to people*, a message no Jean answers.
  - Memory off in a shared task, and the card that says, before a task is first shared, what it holds of the person's own (D734).
  - Going back to a request, limited to the person's own last one (D188).
  - Each person's cursor in a document, and merges a step at a time rather than a version at a time.
  - Seeds past the first: a busy journal grows until it has been quiet 7 days.
  - Inside a shared project, Share's pane for one of its things says nothing of the project; a project's invitations through People.
  - A deck open in a tab other than the one following the circle takes the others' slides only when opened again.
  - Handing a circle over to another owner.
- **Nudges:** the service worker's notification in a real browser (headless Chromium never grants notifications); on an iPhone, only a Jean on the home screen gets them.
- **The store:** files fetched only when opened, and Dropbox's own API as a store.
- **People:** replies to a shared document or table, sealed to the sender to merge (D477); requests between people's Jeans (D226); the phone as a remote of a running Jean.
- **By hand:** the roadmap's checklist has a line for each.
