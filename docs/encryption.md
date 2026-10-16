# Encryption at rest

Not built. Everything Jean keeps on a device would be sealed with keys that never leave it, and the person could add a lock. This is the design and the work left, written so that another agent can pick it up.
- **Why:** Jean's files in the browser's private file system (OPFS) are plain bytes in the browser's profile, so anything that reads the profile reads every task, memory and file. Only the keys in `.secrets/` are encrypted (`ui/secrets.js`).
- **Built on:** the storage worker, the one piece of code that touches OPFS (D11 · D12); Web Crypto and WebAuthn, so no new dependency; the primitives sharing by link already chose (AES-256-GCM, HKDF, PBKDF2-SHA-256 at 600,000 iterations, D361).
- **The roadmap:** no line of it waits for this, and this waits for none ([below](#the-roadmap)).

## Principles

1. **Plain formats, sealed at rest.** Inside the seal, files stay Markdown, JSONL and the person's own files. Only their bytes on disk are sealed. Whatever leaves for the person stays plain: a backup, Sync's folder, a folder of theirs, a saved task, and a share before its own encryption.
2. **Only one module seals: the storage worker.** Nothing above `FS` changes, including the core.
3. **Always on, and never in the way.** Every device seals from its first run, with nothing to set up or remember.
4. **The lock is the person's choice, and it gives the real protection:** a passkey or a password, found the way other capabilities are found.
5. **Nothing leaves the device.** No server holds a key, a copy or a hint.
6. **Settings says plainly what sealing stops and what it doesn't.**

## What it protects, and what it doesn't

| Who or what reads the data | Today | Sealed (always on) | Locked |
|---|---|---|---|
| A single file of the profile, copied, scanned or uploaded (an antivirus sending a sample, a support bundle, an indexer, a careless copy of a folder) | Readable | Sealed | Sealed |
| The whole profile (a stolen laptop without disk encryption, another account with admin rights, a backup of the home folder) | Readable | **Chromium and Firefox:** readable, because they keep the device key's bytes in the profile. **Safari:** sealed, because it wraps the key with one from the system's keychain. | Sealed |
| Someone at the computer who opens Jean | Everything | Everything | Locked out |
| Malware running while Jean is open and unlocked, or a page of Jean's origin gone wrong | Not covered | Not covered | Not covered |
| The person's own copies: a backup, Sync's folder in a cloud drive, a folder of theirs | Plain, by design | Plain | Plain; the lock's card says so when Sync is on |

**What stays unsealed:**
- **File and folder names:**
  - ULIDs, which tell when each file was made;
  - project slugs, which are the projects' names;
  - skill names;
  - files' content hashes, which tell whether a known file is here.
- **Sizes and dates.**
- **Outside OPFS:**
  - folder handles and their names, in IndexedDB;
  - the look and the sidebar, in `localStorage`;
  - the unsent draft, in `sessionStorage`, which Chromium writes to disk to restore sessions.

The content hashes stay because Sync and file versions name files by them on every device. If anyone wants the slugs gone, the time to do it is when the profiles' layout is settled (D228). This design doesn't need it.

## Keys

```
vault key (VK)   32 random bytes, one per Jean (one per profile once D228 lands)
  file key       HKDF-SHA-256(VK, salt = the file's salt, "file") → AES-256-GCM; a new one at each whole write
  vault id       first 8 bytes of HKDF-SHA-256(VK, "id"); written in every file's header
slots            VK sealed with AES-256-GCM, once under each of these keys, in .secrets/vault.json:
  device         a non-extractable key in IndexedDB (app-keys); present only while there is no lock
  passkey        HKDF(the passkey's PRF output for the slot's salt, "lock"); one slot per passkey
  password       PBKDF2-SHA-256(password, salt, 600,000); the iteration count is kept in the slot
  recovery       HKDF(a 128-bit recovery code, "recovery")
```

- **VK never rests anywhere unsealed.** The worker holds it as a non-extractable `CryptoKey` for HKDF. The page holds its bytes only while it adds a slot, read back from a slot the person has just opened.
- **`.secrets/vault.json` is the one file the worker never seals**, because it opens all the others. It holds `format`, the vault id and the slots, and nothing else. Like the rest of `.secrets/`, it is already outside every backup, sync and share.
- **Changing the lock rewrites `vault.json` only.** Turning it on or off, changing the password or adding a passkey seals no file again.
- **Setting a lock removes the device slot**, and deletes its key from IndexedDB. Turning the lock off makes a new device slot.
- **The browser clears the key and the files together.** IndexedDB and OPFS sit in one storage bucket, which the Storage Standard clears as a whole, so neither outlives the other. This includes Safari's seven-day rule.
- **Rotating VK** (sealing everything again under a new key after a suspected leak) can come later. The vault id in each header tells a background pass which files are left.

## The seal

Each file in OPFS:

```
header   32 bytes   89 73 65 61 6C ("\x89seal") · version 1 · 2 reserved · vault id (8) · salt (16)
record   …          length (u32, big-endian) · nonce (12, random) · ciphertext and its 16-byte tag
record   …
```

- **A whole write** (`write`, `writeBytes`) takes a new salt, and so a new file key. It cuts the content into records of 64 KiB and goes through the temporary copy, as writes do now.
- **An append adds one record after the last one.** Content over 64 KiB is cut into several. The append runs under the file's lock, with the file key derived from the header's salt; the worker keeps the keys of files it opened recently. Conversations stay append-only.
- **A crash still costs at most the last append.** On read, a record at the end that is cut short, or whose tag fails, is left out, just as a half-written line is today. `appendRecords` already starts a new line after one.
- **Each record's additional data is the header plus the file's path from the vault's root.** A record moved to another file, or a file moved to another path, fails to open.
  - This also lets a profile's whole folder move without sealing anything again.
  - A file cut exactly at the end of a record looks like one that ended there. Conversations need that behaviour, and whole files have their temporary copy.
- **Reading opens every record at once** (`Promise.all`) and joins them. A tag that fails anywhere but at the end means the file is damaged: the call fails with `DataError`, as a read error does today.
- **`stat` gives the size as stored.**
  - Sync compares each side only with that side's last round, so nothing changes there.
  - Sync's check that a file is "the same already" (`put` in `caps/sync/mirror.js`) will rarely match on Jean's side. Now and then that costs one write of identical content.
  - Settings' "what takes up space" shows the real size on disk.
- **Everything else stays as it is:** `list`, `exists`, `remove`, the names, Web Locks, BroadcastChannel and the temporary copy.
- **Folders of the user's are never sealed.** `folderFS`, the worker started with `root`, writes the person's own files in place.
- **The cost is 32 bytes per record plus 32 per file.** AES-GCM runs natively at more than a gigabyte a second, so the per-record call is what counts: a conversation of a thousand appends should open in tens of milliseconds more (still to measure).

**Why records and per-file keys:** each file version gets a fresh key and random nonces, so a nonce can't repeat in practice. Records are what let an append stay an append and keep today's crash rule.

**Rejected:**
- **One key for everything:** every record would count against a single key's nonce limit, for life.
- **Sealing above `FS` in `core/`:** the core budget is nearly full, and every `FS` would have to remember to seal.
- **IndexedDB records** (D11).
- **libsodium's secretstream:** the same idea, but as a dependency.
- **Keyed hashes for file names:** each device would name the same file differently, which would break Sync and versions.

## Starting

The worker opens the vault before it answers `ping`. It finds one of four cases:

1. **First run** (no `vault.json`, nothing in OPFS): it makes VK, the device slot and `vault.json`.
2. **A device slot exists:** it opens it with the key from IndexedDB. Nothing shows, and Jean starts as it does now.
3. **No device slot (locked):** it answers `locked`.
   - `ui/app.js` imports the lock capability, which shows the lock screen before anything Jean keeps is read.
   - Once unlocked, the page hands the worker its key (`key`), and Jean starts as it does now.
4. **Files exist but `vault.json` doesn't, or no slot opens:** it answers `sealed`.
   - Jean says that what it kept here can't be opened.
   - It offers Restore, from a backup or from the synced folder, which holds plain copies.
   - Or it offers to start afresh, which deletes what is here, after a confirmation.

**Around those four cases:**
- **Other tabs ask for the key** on a BroadcastChannel (`app-vault`). An unlocked tab answers with its `CryptoKey`; a structured clone carries it without its bytes ever becoming readable. If no tab is unlocked, the lock screen shows.
- **Lock now** sends `lock` on that channel, and every tab reloads onto the lock screen.
- **The probe** (`ui/opfs.js`) runs once the key is in, so it also proves the key works.
- **If OPFS works but IndexedDB doesn't** (no browser is known to do this), Jean keeps data for the visit only and says so, as it does where OPFS is unusable. It never writes plain files.

## The lock

The lock is a capability, `lock`, found like the others: nothing of it shows before it is found (D281).

**How it is found:**
- **Offered when** the first key or sign-in is kept (an event without language), or after ten tasks, due after Backup. The offer reads: "Keep what {name} holds behind your face, fingerprint or a password?"
- **Its trophy:** "Keep a key or sign in to a service".

**In Settings › Your data › Lock:**
- **While off:** one line, "Everything kept here is encrypted on this device. Lock it so only you can open it.", then *Use a passkey* (where the browser offers PRF) and *Use a password*.
- **Setting it up:**
  1. The person makes a passkey, or types a password twice. A password needs 12 characters at least, and the card says a passkey is stronger.
  2. Jean shows the recovery code once, to copy or save as a file.
  3. The person types part of it back before the lock turns on.
  4. One sentence says it plainly: without the passkey, the password or this code, nobody can open what is here.
- **While on:**
  - how it opens (passkeys, password);
  - *Add a passkey*, *Change the password*, *New recovery code* and *Turn off the lock*, each asking for the lock first;
  - with Sync on, a line: "Your synced folder keeps readable copies."

**The lock screen** has the room's colours and the name, then:
- *Unlock*, which asks for the passkey, or the password's field;
- *Use the recovery code*;
- *Can't open it?*, which explains that nobody can open it without one of those, and offers to start afresh.

The look already comes from `localStorage`. The chosen language would be kept there too, so the lock screen speaks it.

**When it locks:**
- whenever Jean closes;
- with *Lock now* in the person's menu. Lock now stops a task at work, as closing the tab does, and the menu says so.

Locking after a time away can come later, with no change to the seal.

**While locked, nothing runs.** A routine that falls due runs at the unlock, as one missed while Jean was closed runs at the next visit (D122). A search from the browser's bar (`?q=`, D353) is sent after the unlock.

**Passkeys:**
- **How:** `navigator.credentials.create()` with Jean's domain as the relying party, user verification required, a resident key preferred, and the `prf` extension. Each unlock calls `get()` with the slot's salt.
- **Why no signature is checked:** PRF's output is the secret, and only the authenticator can produce it, so a check would add nothing.
- **Where they work:** detected at run time (`getClientCapabilities()`, then `prf.enabled`).
  - iCloud Keychain in Safari 18, and in Chrome and Firefox on a Mac;
  - Google Password Manager on Android;
  - security keys everywhere;
  - Windows Hello only recently, so Windows falls back to the password where it lacks PRF.
- **Synced passkeys:** a passkey synced to the person's other devices opens each device's own vault, since each slot has its own salt.
- **The desktop app has no passkeys.** Its origin is 127.0.0.1, which WebAuthn refuses as a relying party, and the system's web views keep WebAuthn for browsers. The password and the recovery code work there.

## Policy and organisations

- **`lock` in `policy.json`** (open source, as `pages` is):
  - `"required"` asks the person to set the lock at the first run, and hides Turn off;
  - `"off"` never offers it, as for a denied capability.
- **Organisation recovery, in `ee/`, only if an organisation asks.** It is not built and on no roadmap line. VK would be sealed to a public key that policy names (ECDH P-256, HKDF, AES-GCM), so the organisation's IT could open a work profile someone left. The slot list takes it with no change.

## What changes, module by module

| Module | Change |
|---|---|
| `ui/seal.js` (new, tested under `node --test`) | The header and records, seal and open, the file key, the vault id, and the slots' wrapping. Pure Web Crypto. |
| `ui/storage-worker.js` | Imports `seal.js`; opens the vault; adds a `key` op; seals `write`, `writeBytes` and `append`; opens `read` and `readBytes`; leaves `.secrets/vault.json` and a folder's files plain. |
| `ui/opfs.js`, `ui/app.js` | Handle the `locked` and `sealed` answers, hand the key in, and run the channel between tabs; keep the chosen language in `localStorage`. |
| `ui/secrets.js` | Loses its own AES-GCM layer, since the seal now covers `.secrets/`. `deviceKey()` stays, for certificates (D252). |
| `caps/lock/` (new) | The capability: the offer, its part of Settings, the lock screen, passkeys, the password, the recovery code and Lock now; its strings in `locales/lock/`. |
| `core/` | Nothing, except that the `FS` type says `stat`'s size is the size as stored. |
| Unchanged | Every other capability, Sync and its mirror, Backup and Restore, Folders, the Computer and its workspace, the service worker, notifications, the render package, jean-cli, the bridge, the gateway, the desktop host, and the prompt and tools. |

**The browser floor:** the storage worker is started as a module worker already, but is written to work as a classic script too. Importing `seal.js` drops that. Firefox 111–113 load it as a classic script, so they would keep data for the visit only, and D12's Firefox floor for OPFS would move from 111 to 114 (June 2023). The alternative is inlining `seal.js` into the worker and testing it there.

## Budgets

| Budget | This design |
|---|---|
| `loc.core` | 0 |
| `loc.app` | About +330 net: `seal.js` ~70, the worker ~45, the start and the tabs ~20, `caps/lock/` ~220, minus the secrets' own encryption ~25 |
| `gzipKB.firstLoad` | About +0.2 KB, for the locked start in `ui/app.js` and `ui/opfs.js`. The worker and `seal.js` (about 1.5 KB gzipped) load beside the page but outside the measured graph. |
| `gzipKB.capabilityCode` (`caps/lock`) | About 8 KB |
| Locale parts | About 30 strings in `locales/lock/<lang>.json`, in all 33 languages |
| Prompt | 0 tokens: the brain needn't know |
| Runtime dependencies | None |

Compare the estimate with `npm run budgets` when the work starts. Whatever doesn't fit is found by deleting first. Failing that, a raise needs its own commit and decision, asked of the owner first (D86).

## The roadmap

| Line | What it needs from this | Effect |
|---|---|---|
| Profiles (D228) | Each profile is a vault (the "own secrets' key" D228 names), with paths sealed relative to its root. Each profile locks separately, and switching profiles unlocks the other. | None, in either order. |
| Profiles' layout before launch (D173) | Ideally this lands before launch, so sealed files are the only shape users ever have. The owner's data follows through Backup, then Restore, with the keys typed again; no migration code (D173). If it lands after launch, the worker reads a file without the mark as plain and seals it at its next write, plus one background pass: the lazy upgrade D11 and D173 foresee, about 15 lines. | None: either order works. |
| Sync project by project, through Dropbox's API (D227) | A drive's API is just another `FS` on the mirror's other side, and it reads plain files from the sealed one. A sealed mirror could be a later option (the same seal, with VK shared through a passkey or a pairing). | None. |
| The phone as a remote; requests between Jeans (D45 · D226 · D227) | Nothing: the relay carries messages, not files. | None. |
| Sharing by link (D361) | Nothing: the share copy is made from what Jean reads, then encrypted for the host as designed. | None. |
| jean-cli's `plan` and steering (D364, D365) | Nothing: jean-cli reads Sync's folder, which stays plain. | None. |
| `ee/` (D139) | Nothing. An organisation's recovery slot would fit later. | None. |
| CSP verified in every browser | Nothing: WebAuthn and Web Crypto need no policy. | None. |
| Safari 16.4+ | AES-GCM, HKDF and PBKDF2 are there. Passkeys with PRF come with Safari 18; before that, the password. | None. |
| AI Act marking | Marks live inside the files Jean makes, which reach the person plain. | None. |
| Signed desktop apps | No passkeys there, so no new entitlement. | None. |
| Routines over real days; notifications | Locked counts as closed (D122). | None. |

## Work left

- [ ] **`ui/seal.js`, test-first** in `test/seal.test.js`. Cover:
  - round trips, empty files, and the 64 KiB boundaries;
  - appends, and a torn last record left out;
  - tampering: a flipped bit, a record moved between files, a file moved between paths;
  - the wrong vault;
  - the slots: device, password, recovery.
- [ ] **The storage worker** sealing and opening, the vault's four cases at start, and the `key` op.
- [ ] **The start:** `locked` and `sealed` in `ui/opfs.js` and `ui/app.js`; the channel between tabs; Lock now.
- [ ] **The capability** `caps/lock/`: the offer and the trophy; Settings › Your data › Lock; the lock screen; passkeys; the password; the recovery code; `policy.json`'s `lock`; the strings in every language.
- [ ] **`ui/secrets.js`** without its own encryption.
- [ ] **Tests:** `test/lock.spec.js`.
  - In Chromium, a virtual authenticator with PRF (CDP's `WebAuthn.addVirtualAuthenticator`, `hasPrf`); in WebKit, the password.
  - Lock, reload, unlock; Lock now in one tab locking another; the recovery code; a wrong password.
  - The rest of the suite then runs sealed, which covers every other capability.
- [ ] **To measure:**
  - opening a conversation of a thousand appends;
  - search over a few hundred conversations;
  - a Sync round over a few thousand files, on a weak laptop;
  - the first load's real bytes.
- [ ] **To check by hand:**
  - a copied Chromium profile reads the files while unlocked, and not once locked;
  - the same copy in Safari;
  - real passkeys: iCloud Keychain in Safari and Chrome, Android, a security key, Windows Hello with and without PRF;
  - the desktop app with a password;
  - Arabic and Japanese on the lock screen.
- [ ] **The docs, once it lands:**
  - one entry under Data in `decisions.md`, amending D11's "plain files" to "plain formats, sealed at rest";
  - the Data rules in `AGENTS.md`;
  - `architecture.md`'s Data and persistence (`.secrets/`, Secrets, the worker);
  - the capability's row in `product.md`;
  - a row in `enterprise.md`'s readiness table.

## Notes for whoever picks this up

- **Capabilities are found:** the always-on seal has no UI beyond one line in Settings › Your data, and the lock stays out of the first load until it is set (D281).
- **Decision numbers:** find the highest in `docs/decisions.md` and in every `.claude/worktrees/*` just before taking one.
- **The shared checkout:** other sessions keep uncommitted edits there, so commit only your own hunks.
- **Never test against the owner's real profile.** A vault opened with the wrong key reads as damaged. Use fresh browser contexts, and the e2e ports in a copy.
