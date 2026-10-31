# Encryption at rest

Every file Jean keeps on a device is sealed with keys that never leave it, and a lock, found as a capability, keeps the key behind the person's passkey or password (D371).
- **Why:** the browser's private file system (OPFS) is plain bytes in the browser's profile, so anything that read the profile read every task, memory, file and key.
- **Built on:** the storage worker, the one piece of code that touches OPFS (D11 · D12); Web Crypto and WebAuthn, so no dependency; the primitives sharing by link chose (AES-256-GCM, HKDF, PBKDF2-SHA-256 at 600,000 iterations, D361).
- **Where:** `ui/seal.js` (the format and the slots), `ui/storage-worker.js` (sealing and the vault at start), `ui/opfs.js` (a locked start), `caps/lock/` (the lock), `locales/lock/`.

## Principles

1. **Plain formats, sealed at rest.** Inside the seal, files stay Markdown, JSONL and the person's own files. Whatever leaves for the person stays plain: a backup, Sync's folder, a folder of theirs, a saved task, and a share before its own encryption.
2. **Only one module seals: the storage worker.** Nothing above `FS` knows, the core included.
3. **Always on, and never in the way.** Every device seals from its first run, with nothing to set up or remember.
4. **The lock is the person's choice, and it gives the real protection.**
5. **Nothing leaves the device.** No server holds a key, a copy or a hint.
6. **Settings says plainly what sealing stops and what it doesn't.**

## What it protects, and what it doesn't

| Who or what reads the data | Sealed (always on) | Locked |
|---|---|---|
| A single file of the profile, copied, scanned or uploaded (an antivirus sending a sample, a support bundle, an indexer, a careless copy of a folder) | Sealed | Sealed |
| The whole profile (a stolen laptop without disk encryption, another account with admin rights, a backup of the home folder) | **Chromium and Firefox:** readable, because they keep the device key's bytes in the profile. **Safari:** sealed, because it wraps the key with one from the system's keychain. | Sealed |
| Someone at the computer who opens Jean | Everything | Locked out |
| Malware running while Jean is open and unlocked, or a page of Jean's origin gone wrong | Not covered | Not covered |
| The person's own copies: a backup, Sync's folder in a cloud drive, a folder of theirs | Plain | Plain; the lock's part of Settings says so when Sync is on |

**What stays unsealed:**
- **File and folder names:**
  - ULIDs, which tell when each file was made;
  - project and profile slugs, which are their names;
  - skill names;
  - files' content hashes, which tell whether a known file is here.
- **Sizes and dates.**
- **Each profile's name**, and a child's parent's profile, in its `vault.json` (D228), which the profiles' list reads before any opens.
- **Outside OPFS:**
  - folder handles and their names, in IndexedDB;
  - the look, the sidebar and the language, in `localStorage`, and in a child's profile the minutes spent each day;
  - the unsent draft, in `sessionStorage`, which Chromium writes to disk to restore sessions.

The content hashes stay because Sync and file versions name files by them on every device. The slugs stay since a backup or a synced folder is read by people too.

## Keys

```
vault key (VK)   32 random bytes, one per profile (D228)
  file key       HKDF-SHA-256(VK, salt = the file's salt, "file") → AES-256-GCM; a new one at each whole write
  vault id       first 8 bytes of HKDF-SHA-256(VK, "id"); written in every file's header
slots            VK sealed with AES-256-GCM, once under each of these keys, in .secrets/vault.json:
  device         a non-extractable key in IndexedDB (app-keys, by the profile's folder); present only while there is no lock
  passkey        HKDF(the passkey's PRF output for the slot's salt, "passkey")
  password       PBKDF2-SHA-256(password, salt, 600,000); the iteration count is kept in the slot
  recovery       HKDF(the recovery code's 128 bits, "recovery")
  parent         HKDF(the parent's profile's VK, the slot's salt, "parent"): a child's under 13, alone (D389)
```

- **VK never rests anywhere unsealed.** The worker holds it as a non-extractable `CryptoKey` for HKDF. The page holds its bytes only while the lock adds a slot, read back from a slot just opened, and wipes them after.
- **`.secrets/vault.json` is the one file the worker never seals**, because it opens all the others. It holds `format`, the vault id, the slots, and the profile's name and, for a child's, its parent's profile and the public key what is told to it is sealed with (D390). Like the rest of `.secrets/`, it is outside every backup, sync and share.
- **Changing the lock rewrites `vault.json` only.** Turning it on or off, or changing how it opens, seals no file again.
- **Setting a lock removes the device slot**, and deletes its key from IndexedDB. Turning the lock off makes a new one.
- **The browser clears the key and the files together.** IndexedDB and OPFS sit in one storage bucket, which the Storage Standard clears as a whole, so neither outlives the other. This includes Safari's seven-day rule.
- **Rotating VK** (sealing everything again under a new key) isn't built. The vault id in each header would tell a background pass which files are left.

## The seal

Each file in OPFS:

```
header   32 bytes   89 73 65 61 6C ("\x89seal") · version 1 · 2 reserved · vault id (8) · salt (16)
record   …          length (u32, big-endian) · nonce (12, random) · ciphertext and its 16-byte tag
record   …
```

- **A whole write** (`write`, `writeBytes`) takes a new salt, and so a new file key. It cuts the content into records of 64 KiB and goes through the temporary copy.
- **An append adds records after the last one**, under the file's lock, with the key derived from the header's salt. Content over 64 KiB is cut into several. A file not begun yet is sealed whole. Conversations stay append-only.
- **A crash still costs at most the last append.** On read, a record at the end that is cut short, or whose tag fails, is left out, as a half-written line is. `appendRecords` starts a new line after one.
- **Each record's additional data is the header plus the file's path from the vault's root.** A record moved to another file, or a file moved to another path, fails to open, while a profile's whole folder could move without sealing anything again. A file cut exactly at the end of a record looks like one that ended there: conversations need that, and whole files have their temporary copy.
- **Reading opens every record at once** (`Promise.all`) and joins them. A tag that fails anywhere but at the end, a file from another vault or one without the seal fails with `DataError`, as a read error does.
- **`stat` gives the size as stored.** Sync compares each side only with that side's last round, so nothing changes there; its check that a file is "the same already" rarely matches on Jean's side, which now and then costs one write of identical content. Settings' "what takes up space" shows the real size on disk.
- **Everything else stays as it is:** `list`, `exists`, `remove`, the names, Web Locks, BroadcastChannel and the temporary copy.
- **Folders of the user's are never sealed.** `folderFS`, the worker started with `root`, writes the person's own files in place.
- **The cost is 32 bytes per record plus 32 per file.** AES-GCM runs natively; what counts is a call per record.

**Rejected:**
- **One key for everything:** every record would count against one key's nonce limit, for life.
- **Sealing above `FS` in `core/`:** every `FS` would have to remember to.
- **IndexedDB records** (D11).
- **libsodium's secretstream or Argon2:** dependencies.
- **Keyed hashes for file names:** each device would name the same file differently, which would break Sync and versions.

## Starting

The worker opens the vault at the first `ping` and answers with one of three states:

1. **`open`:**
   - on a first run (no `vault.json`, nothing in OPFS but `.cache/`), after making VK, the device slot and `vault.json`;
   - otherwise when the device slot opens with the key in IndexedDB.

   Nothing shows, and Jean starts as it always did.
2. **`locked`:** there is no device slot (or its key is gone) and another slot is there.
   - `ui/opfs.js` imports the lock, which shows the lock screen before anything Jean keeps is read.
   - Once unlocked, the page hands the worker its key (`key`), and Jean starts.
3. **`sealed`:** files are here but no slot opens them, or `vault.json` is missing.
   - Jean says that what was kept here can't be opened, and offers to start afresh, which deletes the profile after a confirmation; another opens, or a first run makes one.
   - A backup or the synced folder, which hold plain copies, can be restored after.
   - Files kept before the seal land here too (D173).

**Around those states:**
- **Until the key is in,** only `vault.json`, listing, `stat` and removing work. Every other read and write waits.
- **Other tabs of the profile ask for the key** on a BroadcastChannel of its own (`app-vault:<folder>`), so none hands its key to another profile's. An unlocked tab answers with its `CryptoKey`; a structured clone carries it without its bytes ever becoming readable. The lock screen shows only if no tab has answered within 300 ms.
- **Lock now** sends `lock` on that channel, and every tab reloads onto the lock screen.
- **The probe** (`ui/opfs.js`) runs once the key is in, so it also proves the key works.
- **If IndexedDB can't keep the device key,** OPFS counts as unusable: Jean keeps data for the visit only and says so, as in a private window. It never writes plain files.
- **The lock screen speaks the language chosen,** kept in `localStorage` (`app.locale:<folder>`) by the lock, since settings are sealed until it opens. It names the profile and lists the others, to open one instead.
- **A child's under 13** (D389) has only a `parent` slot: its lock screen shows the parent's ways in, read from their `vault.json`, and opens the child's with the parent's VK, which is wiped at once.
- **What a child's profile tells its parent's** (D390), a concern or the minutes spent, can't be sealed with either vault: it is sealed for the parent's profile alone (ECDH P-256 with a key made for each, then AES-256-GCM), whose private half is in the parent's sealed `.secrets/family.json`, and written in `family/<the parent's ULID>/`, outside every profile, where the worker keeps bytes as they come.

## The lock

The lock is a capability, `lock`, found like the others (D281).

**How it is found:**
- **Offered** once a service is connected, or after ten tasks, due after Backup and Search: "Lock your tasks, files and keys, so only you can open them on this device?"
- **Its trophy** counts towards ten tasks.
- **Accepted from the offer,** it opens Settings › Your data on its part.

**In Settings › Your data:**
- **While off:** one line, "Everything kept here is encrypted on this device. Lock it, so only you can open it.", then *Use a passkey* (where the browser offers PRF) and *Use a password*.
- **Setting it up:**
  1. The person makes a passkey, or types a password twice (12 characters at least; a passkey is said to be stronger).
  2. Jean shows the recovery code once: 128 random bits as 32 hexadecimal characters in fours, to copy or save as a file.
  3. The person types its last four characters back, and only then does the lock turn on.
- **While on:**
  - which way it opens (passkey or password);
  - *Lock now*, *Change how it opens* and *Turn off the lock*, the last two asking for the lock first;
  - with Sync found, a line: "Your synced folder keeps readable copies."
- **Changing how it opens** makes a new passkey or password and a new recovery code, replacing both. The format takes several passkeys, but Settings makes one.

**The lock screen** has the room's colours and the name, then:
- *Unlock*, which asks for the passkey, or the password's field;
- *Use the recovery code*, which reads the code whatever its case, spaces and dashes;
- *Can't open it?*, which says that nobody can open it without one of those, and offers to start afresh.

**When it locks:** whenever Jean closes, and with *Lock now*, in the person's menu and in Settings. Lock now stops a task at work, as closing the tab does. Locking after a time away can come later, with no change to the seal.

**While locked, nothing runs.** A routine that falls due runs at the unlock, as one missed while Jean was closed runs at the next visit (D122). A search from the browser's bar (`?q=`) is sent after the unlock.

**Passkeys:**
- **How:** `navigator.credentials.create()` with Jean's domain as the relying party, user verification required, a resident key preferred, and the `prf` extension asked for the slot's salt. If PRF gives no output at creation, Jean asks `get()` at once. Each unlock calls `get()` with `evalByCredential`.
- **Why no signature is checked:** PRF's output is the secret, and only the authenticator can produce it.
- **Where they work:** detected at run time (`getClientCapabilities()`'s `extension:prf`). That covers iCloud Keychain in Safari 18 and in Chrome and Firefox on a Mac, Google Password Manager on Android, and security keys everywhere. Windows Hello only recently, so the password is there where it lacks PRF.
- **The desktop app has no passkeys:** its origin is 127.0.0.1, which WebAuthn refuses as a relying party. The password and the recovery code work there.

## Policy and organisations

- **`"lock": "required"` in `policy.json`** loads the lock at start, opens Settings on it while there is none, and hides Turn off.
- **Denying `lock`** (`capabilities.deny`) never offers it.
- **Organisation recovery is not built.** In `ee/`, only if an organisation asks, VK could be sealed to a public key policy names (ECDH P-256, HKDF, AES-GCM), so its IT could open a work profile someone left. The slot list takes it with no change.

## Testing

- **`test/seal.test.js`** (`node --test`) covers:
  - round trips, empty files and the 64 KiB records;
  - appends, and a torn last record left out;
  - a changed record, another path and another vault;
  - the password, recovery and passkey slots.
- **`test/lock.spec.js`** covers:
  - files sealed on disk;
  - a password lock, the lock screen and a wrong password;
  - a second tab handed the key;
  - Lock now locking both;
  - the recovery code;
  - turning the lock off;
  - in Chromium at `localhost`, a passkey through a virtual authenticator with PRF (CDP's `WebAuthn.addVirtualAuthenticator`).
- **Playwright's WebKit has no OPFS,** so its tests keep data for the visit and the lock's are skipped there; every Chromium spec runs sealed.
- **The specs play the user's folders with `.picked/` in OPFS**, a dot folder Jean's own walks leave out. Read Jean's own files through `app.fs`, never from OPFS directly.
