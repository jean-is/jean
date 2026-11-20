# A company's own server

A company with no IT can still have its own Jean, at its own address, on a server it rents in its own name (D762). One line, run as root when the server first starts, sets everything up. After that, the server applies only the changes its owner's key signs. The server, its address and the company's keys are the company's. Its host is its processor, under the contract the company already has, and Warehouse SAS never has access.

## What it runs

`install.sh` writes `/srv/jean` and starts four containers with Docker Compose. Nothing is logged.

| Container | What it does |
|---|---|
| Caddy | Ends HTTPS on ports 80 and 443. It gets each address's certificate from Let's Encrypt once the name points at the server, and drops any cookie (D725). |
| Jean | Jean's files, from the image of [deploy/docker/](../docker/README.md), at the company's address. |
| The gateway | The services a browser can't reach (D191), on an address of its own (D232), `gateway.<address>` unless told otherwise. It reads its configuration from a file the keeper writes, and reads it again when it changes. |
| The keeper | Applies the changes the owner's key signs: the company's policy, the apps the gateway holds with their secrets, and the owner's key itself ([keeper.js](../../keeper/keeper.js)). It runs from the gateway's image. |

`/srv/jean/keeper` holds what the keeper keeps, owned by the user the keeper and the gateway run as (1000):

- `public/policy.json`, the policy, which Caddy serves at `/policy.json`;
- `secret/gateway.json`, the gateway's configuration, mode 600;
- `state.json`, the last change applied and the owner's key.

## Set it up

Rent a server with Ubuntu 22.04 or later, or Debian 13. Give it the block Jean writes as its first-boot "user data", which OVHcloud's Public Cloud, Scaleway and Hetzner Cloud take. Jean writes it with the ready-made skill "Your company's server" (`company_line`, [app/caps/server/](../../app/caps/server/line.js)), from where policy or settings say releases are published (`urls.releases`):

```yaml
#cloud-config
write_files:
  - path: /root/allowed_signers
    content: |
      jean.is namespaces="file,git" ssh-ed25519 AAAA… Warehouse SAS, Jean releases
runcmd:
  - |
    set -e
    cd /root
    for file in SHA256SUMS SHA256SUMS.sig install.sh; do curl -fsSLO --proto '=https' --proto-redir '=https' "https://github.com/jean-is/jean/releases/latest/download/$file"; done
    ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS
    sha256sum -c --ignore-missing SHA256SUMS
    sh install.sh --address jean.acme.example --owner <key> --updates "https://github.com/jean-is/jean/releases/latest/download/server.env"
```

`install.sh` runs only once the release's signature and its own SHA-256 check. It then reads the images and the version from the announcement, which it checks the same way.

- **`--owner`** is the owner's public key: the base64url of a P-256 key's raw point (65 bytes). Jean makes it on the owner's device, where its private half stays.
- **`--updates`** says where new releases are announced.
- **`--jean` and `--gateway`** can name the images by digest instead, never by tag, with `--version`.
- **`--gateway-address`** names the gateway's address if `gateway.<address>` won't do.

Then point both names at the server's address. The script checks what it is given before it touches anything, and refuses to run as anyone but root.

## Changes

The owner's key stays in the Jean that wrote the server's line, whatever address that Jean is served from, so the keeper answers any origin. The signature is the proof, and no cookie or account is involved. The keeper is at `https://<address>/keeper`. `GET` says whose key it obeys and the last change it applied: `{ "format": 1, "owner": <the key's fingerprint>, "seq": <n> }`. `POST` takes a change, a JWS that the owner's key signs with ES256, whose payload is:

```json
{ "format": 1, "seq": 4, "policy": { "urls": { "gateway": "https://gateway.jean.acme.example" } }, "gateway": { "clients": [] } }
```

- **`seq`** must be more than the last change's, so a change can't be sent twice.
- **`policy`** replaces `policy.json` whole.
- **`gateway`** replaces the gateway's configuration. Its `origins` stay the company's address, which a change can't name.
- **`owner`** hands the server to another key, which signs every change after it.

A change signed by another key gets a 401, an old one a 409, and the files stay as they were.

## Updates

`jean-update.timer` runs `/srv/jean/update` each day. It reads the announcement `--updates` names, following redirects over HTTPS only: the `server.env` of a signed release ([trust/releases.md](../../docs/trust/releases.md)). That's lines `VERSION=`, `JEAN_IMAGE=` and `GATEWAY_IMAGE=`, each image by digest, with an SSH signature beside it (`.sig`) that `allowed_signers` must vouch for, the same key that signs Jean's releases (D419).

- **It takes only a newer version:** the same one, or an older one, changes nothing.
- **A changed or unsigned announcement** is refused.
- **Images that can't be pulled** leave the running ones untouched.
- **If the keeper, the gateway or Jean doesn't answer** on the new images within thirty seconds, the previous ones come back.

## Giving it to another key

If the owner's key is lost, run `install.sh` again from the host's console with another `--owner`. The policy, the gateway's apps and the count of changes stay. Only whoever controls the server, through its host's account, can do that.
