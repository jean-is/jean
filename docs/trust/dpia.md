# Data protection impact assessment: a template for Jean

For an organisation's data protection officer, deploying Jean for its people. It follows Article 35(7) of the GDPR: a description of the processing, its necessity and proportionality, the risks to people, and the measures that address them. What Jean does is filled in; what only the organisation can say is marked **[To fill]**. Copy this file, fill it in, and keep it with the deployment's `policy.json`, since most answers depend on it.

The organisation decides why and how Jean is used, which brain answers, and what is connected. Warehouse SAS publishes Jean's code and receives nothing of what the organisation's people do with a copy the organisation serves itself, with its own gateway and no share host or relay of Warehouse SAS's ([threat model](threat-model.md#out-of-scope)). A copy Warehouse SAS hosts is served from its server in France, which sees each visit's IP address and the files asked for, and logs none of them ([hosted copies](hosted.md)).

## 1. Is an assessment needed?

Jean is an AI assistant: many supervisory authorities list new technologies such as AI among the criteria that call for one, and people's work content often holds others' personal data. **[To fill: the criteria that apply to this deployment, and the conclusion.]**

## 2. The processing

### What it is for

**[To fill: what people use Jean for, for example drafting, summarising documents, answering from the organisation's files; and what it must not be used for, for example decisions about individuals.]**

### Whose data

| People | How their data comes in |
|---|---|
| The organisation's people who use Jean | Their sign-in (name and address from the identity provider, D385, and the directory's groups and roles they are in, with `groups` in policy, D429), what they write, the files they give, what Jean remembers of them; where the organisation's relay lists colleagues, their name, email or login, groups and each device's mailbox and public key there (D731) |
| Anyone in what they bring | Colleagues, clients, applicants named in documents, mail, calendars and requests |
| Anyone the camera sees | With the camera on (D645), the pictures Jean looks at, when the person speaks or Jean watches: people nearby, a screen, a document on a desk |
| **[To fill]** | |

### What Jean keeps, and where

| Data | Where | How long |
|---|---|---|
| Tasks: requests, answers, the steps Jean took, the files given and made | The person's browser, on their device, each file sealed with AES-256-GCM ([encryption.md](../encryption.md)) | Until the person deletes them, or clears the site's data; with `retention`, a deleted task stays out of sight at least that period (D412) |
| Memory: lines Jean keeps about the person's work and preferences | The same; the person sees, changes and deletes every line in Settings › About you | As above |
| Keys and sign-ins | `.secrets/`, sealed, never in a backup, export, sync or share; the keys the person typed for their own brains in the cloud, connections and search services, and published sites', also on each device the person adds, never a sign-in's tokens (D700) | Until signed out or removed, on each device the person added as on this one; on a device they remove, until it erases Jean, which it does unless unticked, and Jean lists the keys it held, to replace |
| A copy in a folder, if Sync is on | The folder the person or policy chooses, for example the work drive | The drive's own rules **[To fill]** |
| Shared copies, if sharing is on | A share host that can't read them (`urls.share`) | 30 days or a year, as the person chooses (D361) |
| The profile, the settings that follow, the keys above and each project's name and how its assistant should be, if the person adds another of their devices | Each device they add, sealed at rest there as here; tasks, files and memory too where the relay keeps stores (the row below), or a task when they send it; nothing of a project kept on one device. Only where policy names a relay and signs no one in (D700) | Until the device is removed, which erases Jean there unless the person unticks it |
| Tasks, files, documents, memory, skills and routines a person's devices keep in common, but projects kept on one device | The relay policy names, where its configuration keeps stores: sealed on the devices, so it can neither read nor name them; each device's token's hash; the address each change came from, once an hour, sealed when its configuration names a record key | A store nobody uses 183 days, a deletion 90 days, a part no version names a day; a removed device is let out at once, with a new key the others alone get |
| Messages between a person's devices | The relay policy names (`urls.relay`), sealed so it can't read them, with a hash of each mailbox's token, never a key or a name, and the address each change came from, sealed when its configuration names a record key | Messages 7 days at most, a mailbox nobody uses 90 days, addresses a year |
| What a person sends the people they met in People, and their answers (D727) | The relay policy names, sealed from one person's key to the other's so it can't read them, in a mailbox each of the recipient's devices reads, named by a hash of its token; the people met, among the person's keys on their devices | Messages 7 days at most; on the recipient's devices, what came waits sealed until opened |
| The list of colleagues, where the organisation's relay keeps one (D731) | The organisation's own relay: each person's name and email or login from their ID token, their groups and app roles, whether a guest, and each device's person mailbox and public key, with its key's certificate naming their account under `ee/`'s `colleagues.certify` (D732); the ID token itself is checked and dropped | A device 30 days after its last proof, its person with the last; a leaver at once with `node relay/serve.js forget <account>` |
| The audit trace, with `ee/`'s `audit` | The organisation's OpenTelemetry collector: the sign-in's email, device and profile ids, brains and tools used, rules' decisions, token counts, the colleague's account a task went to or came from, named as the person is (D732); the words too only with `"content": true` ([enterprise.md](../enterprise.md#audit-to-opentelemetry)) | **[To fill]** |
| The gateway's log | The organisation's AI gateway | **[To fill]** |

### Who receives it

| Recipient | What | Chosen by |
|---|---|---|
| The brain that answers | The request, the parts of files and tasks Jean gives it, what Jean's tools returned, the person's instructions and memory | Policy's `brains`, locked to the organisation's gateway **[To fill: the provider behind the gateway, its region, and its contract]** |
| Connected services | What a call sends them, asked first by default | Policy's `directory` and `capabilities.deny` **[To fill: Microsoft 365, Google, others]** |
| Sites the person opens or Jean reads with `browse` | The address, as any browser sends it | The person; the `Content-Security-Policy` header narrows it |
| A gateway for services browsers can't reach | What it relays, keeping none of it | `urls.gateway`: the organisation's, or none |
| A share host | A sealed copy it can't read | `urls.share`, or `rules.share: "never"` |
| A relay, if the person adds another of their devices | Sealed messages between their own devices, which it can't read: the settings that follow, the keys that follow, each project's name and how its assistant should be, a task they send; where it keeps stores, their sealed store, 1 GB, gone after 6 months unused; the address each came from | `urls.relay`, none by default; no device is added where policy signs in |
| The same relay, if the person meets someone in People | Sealed messages between people who met with six digits, which it can't read: a task or what Jean made, a few words, an answer back, a new key after a device is removed; the address each came from | `urls.relay`; `capabilities.deny: ["people"]` or `rules.share: "never"` turns People off |
| The organisation's own relay, if it lists colleagues | Who is listed, from their ID token, and each device's key and mailbox; who sends to whom among them, since each letter names its sender's key, never what | `issuers` in its configuration; without `capabilities.preUnlock: ["people"]` in policy, People stays off where the organisation signs in |
| jsDelivr, the first time a score plays an instrument | The instrument's file name and the browser's IP address, as any download sends them | `urls.sounds`: the organisation's own copy of the instruments, or `""` for none |
| Warehouse SAS, for a copy it hosts | Each visit's IP address, time and the files asked for, as any web host sees them, logging none ([hosted copies](hosted.md)) | The organisation, choosing a hosted copy **[To fill: the agreement with Warehouse SAS that covers it]** |

[Where your files go](../../site/files/en.html) names every address a copy of Jean contacts. `policy.html` at the deployment's address lists those its policy names and whether its headers let Jean reach them.

### Outside the EEA

**[To fill: where the brain's provider, the connected services and their sub-processors process data, and the transfer tool for each.]** Jean adds no transfer of its own when the organisation serves it and runs its own gateway, its own share host and relay or none, and its own copy of a score's instruments or none. A copy Warehouse SAS hosts is served from OVHcloud's Gravelines data centre, in France ([hosted copies](hosted.md#where-it-runs)).

## 3. Necessity and proportionality

| Question | What Jean offers | **[To fill]** |
|---|---|---|
| Lawful basis | | The basis for each purpose; for employees, whether staff representatives are to be consulted |
| Only what is needed | A file that fits in about a quarter of the brain's context goes whole, a longer one its first pages or those matching the request, the rest only as the brain reads it (D24, D301); memory is lines the person can read and delete; with the brain on the device, nothing leaves it | Which capabilities to deny (`capabilities.deny`) |
| Accurate | Under the box, from the first request: "Jean is AI and can make mistakes"; each answer says where it was done, with a certificate (D252, D273) | How people are told to check answers |
| Kept no longer than needed | Tasks stay until deleted; `retention` sets a floor, not a ceiling | The periods |
| People are told | A privacy notice the organisation names in policy (`urls.privacy`), linked under the box | The notice |
| Rights | Everything is on the person's device, where they read, export (Settings › Your data › Backup) and delete it | How requests reach the person, since the organisation can't search or erase devices from afar ([enterprise.md](../enterprise.md)) |
| No decisions by machine alone | Jean answers and acts for the person, asking first before anything external; it decides nothing about anyone | Uses that are forbidden |

## 4. Risks to people

Rate each for this deployment: severity and likelihood, before and after the measures.

| Risk | Where it comes from | Jean's measures | The organisation's measures | Residual **[To fill]** |
|---|---|---|---|---|
| Someone reads a person's tasks | A lost or shared device, another profile, a copy of the disk | Files sealed at rest; a lock behind a passkey or password, which policy can require (`"lock": "required"`); profiles apart (D228, D371) | Device encryption and screen lock; no shared accounts | |
| A person's keys or settings reach a device that isn't theirs, or stay on one they lost | Someone who gets the person to type the six digits their device shows, or uses Jean on an unlocked computer; a lost device still listed | Six digits typed on the old device, after its lock if it has one, three tries, and Join asked twice on the new one; removing a device erases Jean there unless unticked, lets it out of the store with a new key the others alone get, and Jean lists the keys it held, to replace ([threat model](threat-model.md), threats 29 and 30) | No relay in policy (`urls.relay`, none by default), or `signIn`, under which devices don't pair; `"lock": "required"`; keys replaced when a device is lost | |
| Content leaves for somewhere it shouldn't | Instructions hidden in a page, a file or a mail; a person's mistake | Anything external asks first; no picture loads from an address the brain wrote; code runs in a sandbox without network ([threat model](threat-model.md), threats 1–5) | Rules locked in policy (`rules`); the header's `connect-src` limited to the gateway and the services allowed | |
| A provider keeps or reuses what it receives | The brain's provider | Brains pinned to the gateway by policy; the brain on the device for what must stay | The provider's contract: no training, retention, region | |
| An answer is wrong and a person relies on it | The brain | The AI line under the box; sources and certificates under answers | Training; uses that are forbidden | |
| People nearby are filmed | The camera on, at work | The video is never sent or kept: only the pictures Jean looks at, in the task, a look that says nothing leaving none; it shows that it is on, and stops on another task, out of sight or after ten idle minutes; the brain is told never to say who someone is from their face | `capabilities.deny: ["camera"]`; telling staff where it may be used | |
| People feel watched | The audit trace | Metadata only unless `content` is set; the person is told when tasks are kept (Settings › Your data, D412) | What is collected, who reads it, for how long; staff consulted | |
| Data is lost | The browser clears it, the device is lost | Persistent storage asked for; backups; Sync | A Sync folder on the work drive | |
| **[To fill]** | | | | |

## 5. The deployment's settings

The measures above, as this deployment sets them. Attach the `policy.json` and the header the server sends.

| Setting | Value **[To fill]** |
|---|---|
| `brains`, locked, and `signIn` | |
| `capabilities.deny` | |
| `groups`: each section, and the directory's groups or roles it is for | |
| `rules` | |
| `lock` | |
| `urls.gateway`, `urls.share`, `urls.relay`, `urls.privacy` | |
| `audit` (with `content`?) and `retention` | |
| `dlp` (what it looks for, and with `mask` what a brain reads masked; masked data is still personal data) and `session` (idle, wipe) | |
| `Content-Security-Policy` header | |
| Release deployed, and its signature checked ([releases.md](releases.md)) | |

## 6. Advice and decision

| | **[To fill]** |
|---|---|
| The data protection officer's advice | |
| People or their representatives consulted | |
| Residual risks accepted, by whom | |
| Prior consultation of the supervisory authority needed? | |
| Next review | |
