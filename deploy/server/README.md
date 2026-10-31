# Jean's services on a server of their own

jean.is's own files are on Bunny CDN ([bunny/](../bunny/README.md)). What can't be static files runs on one server in the EU that runs nothing else, from the two files here:

| Name | Service | Keeps |
|---|---|---|
| `gateway.jean.is` | [The gateway](../../gateway/), for the services a browser can't reach (D191) | Nothing |
| `hst.ing` | [The share host](../../host/) (D361) | Sealed copies it can't read, in `share-data/` |
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
git archive HEAD gateway requests | ssh <server> 'mkdir -p /srv/jean/code && tar -x -C /srv/jean/code'
```

```bash
rsync -r dist/host/ <server>:/srv/jean/code/host/
```

   `dist/host/` holds the share host and the viewer it names, and its `package.json` has Node read the folder as modules; `code/` needs one too: `{"type":"module"}`.

3. The services' settings, each readable by root alone (`chmod 600`):
   - `gateway.env`: `GATEWAY_CONFIG=` its configuration on one line, `{"origins":["https://jean.is"]}` and the sign-in apps' `clients`.
   - `share.env`: `HOST_CONFIG=` the share host's, with the public half of the key that seals its records.
   - `requests.env`: `REQUESTS_CONFIG=` the request service's, with `"site":"https://jean.is/"`, the address its answers send people back to, and the mail server.
4. The folders the services write, owned by uid 1000: `share-data/` and `requests-data/`. `hosted/tenants/` holds an empty `Caddyfile` until the first hosted copy.
5. Check the configuration, then start:

```bash
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
```

```bash
docker compose up -d
```

6. DNS, not proxied: `gateway.jean.is`, `keys.jean.is`, `hst.ing` and `www.hst.ing`, and the name hosted copies' CNAME records point at, as A and AAAA records for the server.

## Keep it current

CI does it at every push to main, right after deploying jean.is (D659): it sends the commit's gateway, key service and share host to [`update.sh`](update.sh), installed as `/srv/jean/update` (root's, mode 755), through a key that may run nothing else. The script refuses a tar that holds anything but those files, recreates the three services, checks that each answers, and puts the previous code back if one doesn't. Once, on the server, the key's public half goes in `~ubuntu/.ssh/authorized_keys` behind its restrictions:

```text
command="sudo -n /srv/jean/update",restrict ssh-ed25519 AAAA… jean CI deploy
```

Its private half is the environment `jean.is`'s secret `SERVER_KEY` on GitHub, beside `SERVER` (`ubuntu@<address>`) and `SERVER_HOST_KEYS` (the server's lines from a `known_hosts` that has checked it). By hand, the same tar does the same over any SSH connection: `tar -C <folder> -cf - gateway host requests | ssh <server> sudo /srv/jean/update`.

The settings in the `.env` files are read only as a container starts, so after changing one, recreate its service:

```bash
docker compose up -d --force-recreate gateway share requests
``` Hosted copies' releases come from `DEPLOY_TO=<server>:/srv/jean/hosted POLICY='{}' npm run deploy`, and their sites from `npm run tenant` ([deploy/](../README.md#hosted-copies)).

## Moving from another server

Copy `share-data/` and `requests-data/` as they are, owner and all, before the DNS records change: a share whose copy stays behind can no longer be opened, and its link breaks.
