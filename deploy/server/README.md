# Jean's services on a server of their own

jean.is's own files are on Bunny CDN ([bunny/](../bunny/README.md)). What can't be static files runs on one server in the EU that runs nothing else, from the two files here:

| Name | Service | Keeps |
|---|---|---|
| `gateway.jean.is` | [The gateway](../../gateway/), for the services a browser can't reach (D191) | Nothing |
| `hst.ing`, `s.hst.ing` | [The share host](../../host/) (D361), and where sites are published (D720) | Sealed copies it can't read, and each site name's token hash and files' hashes, in `share-data/`; sites' files are in Bunny's storage ([bunny/](../bunny/README.md#published-sites)) |
| `relay.jean.is` | [The relay](../../relay/), where a person's devices and the people they send to meet (D45 · D226) | Sealed messages it can't read, 7 days at most, and the sealed records of each change, in `relay-data/` |
| `keys.jean.is` | [The request service](../../requests/), where the page for a key sends | Each request, in `requests-data/` |
| An organisation's own address | Its hosted copy (D456, [deploy/](../README.md#hosted-copies)) | Jean's files and its `policy.json`, in `hosted/` |

[`compose.yaml`](compose.yaml) runs each in its container behind Caddy, which holds ports 80 and 443, gets every name's certificate from Let's Encrypt and sends plain HTTP on to HTTPS ([`Caddyfile`](Caddyfile)). Nothing is logged: Caddy discards its own messages and writes no access log, and Docker keeps no container's output.

## Set it up, once

A server in the EU with Docker and its Compose plugin, ports 22, 80 and 443 open and no others. In `/srv/jean`, as root:

1. This folder's two files.
2. The code, from the commit jean.is was built from (CI sends it at every deploy afterwards), run on the computer that holds the repository:

```bash
npm run host
```

```bash
git archive HEAD gateway requests relay | ssh <server> 'mkdir -p /srv/jean/code && tar -x -C /srv/jean/code'
```

```bash
rsync -r dist/host/ <server>:/srv/jean/code/host/
```

   `dist/host/` holds the share host and the viewer it names, and its `package.json` has Node read the folder as modules; `code/` needs one too: `{"type":"module"}`.

3. The services' settings, each readable by root alone (`chmod 600`):
   - `gateway.env`: `GATEWAY_CONFIG=` its configuration on one line, `{"origins":["https://jean.is"]}` and the sign-in apps' `clients`.
   - `share.env`: `HOST_CONFIG=` the share host's, with the public half of the key that seals its records, `"shares":"https://s.hst.ing/"`, `"sites":{"address":"https://{name}.hst.ing/","bunny":{"storage":"https://storage.bunnycdn.com/<zone>/","api":"https://api.bunny.net/"}}` and an `alert` address for reports; then `BUNNY_STORAGE_KEY=` the sites' storage zone's password and `BUNNY_API_KEY=` the account's key, which purges.
   - `requests.env`: `REQUESTS_CONFIG=` the request service's, with `"site":"https://jean.is/"`, the address its answers send people back to, and the mail server.
   - `relay.env`: `RELAY_CONFIG=` the relay's: its `origins`, `https://jean.is`, the desktop app's `http://127.0.0.1:24601` and every hosted copy whose policy names this relay, and the public half of the key that seals its records (`node host/serve.js keys` makes a pair).
4. The folders the services write, owned by uid 1000: `share-data/`, `requests-data/` and `relay-data/`. `hosted/tenants/` holds an empty `Caddyfile` until the first hosted copy.
5. Check the configuration, then start:

```bash
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
```

```bash
docker compose up -d
```

6. DNS, not proxied: `gateway.jean.is`, `keys.jean.is`, `relay.jean.is`, `hst.ing`, `s.hst.ing` and `www.hst.ing`, and the name hosted copies' CNAME records point at, as A and AAAA records for the server. Every other name of hst.ing, `*.hst.ing`, goes to Bunny's pull zone for published sites.

## Keep it current

CI does it at every push to main, right after deploying jean.is (D659): it sends the commit's gateway, key service, share host and relay to [`update.sh`](update.sh), installed as `/srv/jean/update` (root's, mode 755), through a key that may run nothing else. The script refuses a tar that holds anything but those files, recreates the four services, checks that each answers, and puts the previous code back if one doesn't. Once, on the server, the key's public half goes in `~ubuntu/.ssh/authorized_keys` behind its restrictions:

```text
command="sudo -n /srv/jean/update",restrict ssh-ed25519 AAAA… jean CI deploy
```

Its private half is the environment `jean.is`'s secret `SERVER_KEY` on GitHub, beside `SERVER` (`ubuntu@<address>`) and `SERVER_HOST_KEYS` (the server's lines from a `known_hosts` that has checked it). By hand, the same tar does the same over any SSH connection: `tar -C <folder> -cf - gateway host requests relay | ssh <server> sudo /srv/jean/update`.

The settings in the `.env` files are read only as a container starts, so after changing one, recreate its service:

```bash
docker compose up -d --force-recreate gateway share requests relay
``` Hosted copies' releases come from `DEPLOY_TO=<server>:/srv/jean/hosted POLICY='{}' npm run deploy`, and their sites from `npm run tenant` ([deploy/](../README.md#hosted-copies)).

## Adding the relay to a server that runs the others

`update.sh` refuses a tar that doesn't hold exactly what it expects, so the server changes before CI sends `relay/`:

1. DNS for `relay.jean.is`, then `relay.env` and `relay-data/` as above.
2. This folder's `compose.yaml`, `Caddyfile` and `update.sh` (as `/srv/jean/update`, root's, mode 755) in place of the old ones. Check the configuration as above, then `docker compose up -d caddy gateway share requests`, and `docker compose restart caddy` if Caddy wasn't recreated: a running Caddy keeps the file it started with, so without the restart `relay.jean.is` gets no route and no certificate, and nothing says so. The relay itself waits for the deploy: its code imports `host/`'s, which only the deploy brings at the same commit, and started beside an older `host/` it stops at once, with nothing logged.
3. Only then the deploy whose CI sends the relay (a push, or the failed deploy job run again): until the server has the new script, a deploy that sends `relay/` fails, and one that doesn't fails once it has. `update.sh` starts the relay with the other three and checks that it answers.

## Moving from another server

Copy `share-data/`, `requests-data/` and `relay-data/` as they are, owner and all, before the DNS records change: a share whose copy stays behind can no longer be opened, and its link breaks.

## Adding published sites to a server that runs the others

The share host's code gains `host/sites.js`, which `update.sh` refuses until it expects it, so the server changes before CI sends it (D720):

1. This folder's `update.sh` as `/srv/jean/update` (root's, mode 755). Until it is there, the first push to main that holds `host/sites.js` deploys jean.is but fails at Jean's server, which keeps its code.
2. This folder's `Caddyfile`, then `docker compose restart caddy`, for `s.hst.ing`'s route and certificate.
3. `share.env` as above, with `shares`, `sites`, `alert` and the two Bunny keys, then `docker compose up -d --force-recreate share`.
4. DNS: `s.hst.ing` as A and AAAA records for the server, and `*.hst.ing` for Bunny's pull zone ([bunny/](../bunny/README.md#published-sites)).
5. jean.is's `POLICY` naming `"urls":{"share":"https://s.hst.ing/"}`, so new links are made there; the bare name sends the links made before on to it.
