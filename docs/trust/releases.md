# Signed releases

A release is Jean ready to copy to a server, with no build and no Node.js: what `npm run build:web` makes from one commit, the same for every organisation, signed by WAREHOUSE SAS. It is checked with OpenSSH 8.1 or later, which macOS, Linux and Windows 10 and 11 already have (`ssh -V` says which).

## What a release holds

| File | What it is |
|---|---|
| `jean-<version>-<commit>.zip` | Everything a deploy serves, in a folder of the same name: Jean's own code minified, each file beside itself in brotli and gzip ([deploy/](../../deploy/README.md)) |
| `jean-<version>-<commit>.cdx.json` | The bill of materials of what ships, CycloneDX: each package, its version, licence and hash |
| `SHA256SUMS` | The SHA-256 of both, one a line |
| `SHA256SUMS.sig` | WAREHOUSE SAS's SSH signature of `SHA256SUMS` |

The signing key's public half is in [`allowed_signers`](allowed_signers), for the signer `jean.is`:

```text
SHA256:9VReKtnOy78AHsenyqUkrazF9WxFZYnyRqc7y6xVGAA
```

Take `allowed_signers` from this repository, or from WAREHOUSE SAS directly, never from where the release came from, and check that its fingerprint is this one: `ssh-keygen -l -f allowed_signers` prints it.

## Checking one

In the folder holding the four files and `allowed_signers`.

**macOS and Linux:**

```bash
ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS
```

```bash
shasum -a 256 -c SHA256SUMS
```

The first says `Good "file" signature for jean.is`, the second `OK` for each file. On Linux, `sha256sum -c SHA256SUMS` does the second as well.

**Windows,** in PowerShell:

```powershell
cmd /c "ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS"
```

```powershell
Get-Content SHA256SUMS | ForEach-Object { $hash, $name = $_ -split '  '; if ((Get-FileHash $name).Hash -eq $hash) { "${name}: OK" } else { "${name}: FAILED" } }
```

`cmd /c` hands `SHA256SUMS` to ssh-keygen byte for byte, which PowerShell's own pipe doesn't. Then unzip the release and deploy its folder as [deploy/](../../deploy/README.md) says, adding the organisation's `policy.json` beside `index.html` and `<meta name="app-policy" content="policy.json">` in `index.html`'s head ([enterprise.md](../enterprise.md)).

## The source

WAREHOUSE SAS signs each version's tag, `v<version>`, with the same key, so whoever builds from the source checks it too. With this repository:

```bash
git -c gpg.ssh.allowedSignersFile=docs/trust/allowed_signers tag -v v0.8.0
```

## Making one

```bash
RELEASE_KEY=<the private key> npm run release
```

`scripts/release.js` builds `HEAD`, or the commit named after `--`, as git has it, never the working tree, with neither `POLICY` nor `ADDRESS`; writes the four files in `dist/release/`; and checks the signature against `allowed_signers` before it says so. It checks the key the same way before building, so a release is never signed with any other. The private key never enters this repository; WAREHOUSE SAS keeps it apart. Rotating it means adding the new key's line to `allowed_signers` beside the old one, so earlier releases still check.
