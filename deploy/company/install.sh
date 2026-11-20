#!/bin/sh
# SPDX-License-Identifier: MIT
# A company's own server for Jean (D762), from the one line its owner's Jean writes: run as root on a fresh Ubuntu or
# Debian server the company rents in its own name (README.md beside this file). It installs Docker, writes /srv/jean and
# starts Caddy, Jean, the gateway and the keeper, which applies only the changes the owner's key signs.
#
#   sh install.sh --address jean.acme.example --owner <key> --updates https://…/server.env [--gateway-address gateway.jean.acme.example]
#   sh install.sh --address jean.acme.example --owner <key> --jean <image@sha256:…> --gateway <image@sha256:…> [--version 1.2.3] [--updates …]
#
#   --owner    the base64url of the raw point of the owner's P-256 public key, made in their browser
#   --updates  where new releases are announced, signed (the update script below). Without --jean and --gateway, the
#              images and version are the announcement's, once its signature checks; without it, the server stays as it is
#   --jean, --gateway   the images of Jean's files and of the gateway, which runs the keeper too, each by digest
#
# Run again with another --owner, from the host's console, to give the server to another key: the policy, the gateway's
# apps and the changes applied stay. Nothing is logged, and Warehouse SAS never has access.
set -eu

die () { echo "install: $1" >&2; exit "${2:-1}"; }

address='' gateway_address='' owner='' jean='' gateway='' version='0.0.0' updates=''
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || die "$1 needs a value" 2
  case $1 in
    --address) address=$2 ;;
    --gateway-address) gateway_address=$2 ;;
    --owner) owner=$2 ;;
    --jean) jean=$2 ;;
    --gateway) gateway=$2 ;;
    --version) version=$2 ;;
    --updates) updates=$2 ;;
    *) die "$1 is not an option" 2 ;;
  esac
  shift 2
done
[ -n "$gateway_address" ] || gateway_address="gateway.$address"

name='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
pinned='^[a-z0-9][a-z0-9./_:-]*@sha256:[0-9a-f]{64}$'
printf '%s' "$address" | grep -Eq "$name" || die "--address needs a name such as jean.acme.example" 2
printf '%s' "$gateway_address" | grep -Eq "$name" || die "--gateway-address needs a name such as gateway.jean.acme.example" 2
[ "$gateway_address" != "$address" ] || die "the gateway needs an address of its own (D232)" 2
printf '%s' "$owner" | grep -Eq '^[A-Za-z0-9_-]{87}$' || die "--owner needs the base64url of a P-256 public key's raw point" 2
[ -n "$jean$gateway" ] || [ -n "$updates" ] || die "--updates, or --jean and --gateway, must name the images" 2
if [ -n "$jean$gateway" ]; then
  printf '%s' "$jean" | grep -Eq "$pinned" || die "--jean needs an image by digest" 2
  printf '%s' "$gateway" | grep -Eq "$pinned" || die "--gateway needs an image by digest" 2
fi
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "--version needs a version such as 1.2.3" 2
[ -z "$updates" ] || printf '%s' "$updates" | grep -Eq '^https://[^[:space:]]+$' || die "--updates needs an https address" 2
[ "$(id -u)" = 0 ] || die "run it as root, as the host's first-boot line does"

# Docker and its Compose, curl and OpenSSH's ssh-keygen, from the system's own packages.
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v ssh-keygen >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q docker.io curl openssh-client
  docker compose version >/dev/null 2>&1 || apt-get install -y -q docker-compose-v2 || apt-get install -y -q docker-compose-plugin || apt-get install -y -q docker-compose
  docker compose version >/dev/null 2>&1 || die "Docker Compose could not be installed from this system's packages"
fi
systemctl enable --now docker >/dev/null 2>&1 || true

mkdir -p /srv/jean/keeper/public /srv/jean/keeper/secret
cd /srv/jean

# Who signs Jean's releases (docs/trust/allowed_signers, D419), which signs the announcements of new ones too.
cat > allowed_signers <<'EOF'
jean.is namespaces="file,git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJPHinjnVOoayR7g4/bxWRJN02rc2un2afiyAqjv5/F4 Warehouse SAS, Jean releases
EOF

# Without images named, the announcement's, once allowed_signers vouches for it, read as the update script reads it.
image () { sed -n "s/^$1=\([a-z0-9][a-z0-9./_:-]*@sha256:[0-9a-f]\{64\}\)\$/\1/p" "$2"; }
release () { sed -n 's/^VERSION=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$/\1/p' "$1"; }
if [ -z "$jean" ]; then
  work=$(mktemp -d)
  curl -fsSL --proto '=https' --proto-redir '=https' --max-time 60 -o "$work/server.env" "$updates"
  curl -fsSL --proto '=https' --proto-redir '=https' --max-time 60 -o "$work/server.env.sig" "$updates.sig"
  ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s "$work/server.env.sig" < "$work/server.env" >/dev/null 2>&1 \
    || die "the announcement at $updates is not signed by a key allowed_signers names"
  jean=$(image JEAN_IMAGE "$work/server.env")
  gateway=$(image GATEWAY_IMAGE "$work/server.env")
  version=$(release "$work/server.env")
  rm -rf "$work"
  [ -n "$jean" ] && [ -n "$gateway" ] && [ -n "$version" ] || die "the announcement at $updates names no version and images by digest"
fi

# What the keeper keeps, owned by the user the keeper and the gateway run as. The first policy names the gateway; the
# first gateway serves Jean's address; the owner is the one named here, the changes applied so far kept.
[ -f keeper/public/policy.json ] || printf '{\n  "urls": { "gateway": "https://%s" }\n}\n' "$gateway_address" > keeper/public/policy.json
[ -f keeper/secret/gateway.json ] || printf '{"origins":["https://%s"]}\n' "$address" > keeper/secret/gateway.json
seq=$(sed -n 's/.*"seq":\([0-9][0-9]*\).*/\1/p' keeper/state.json 2>/dev/null || true)
printf '{"seq":%s,"owner":"%s"}\n' "${seq:-0}" "$owner" > keeper/state.json
chown -R 1000:1000 keeper
chmod 700 keeper keeper/secret
chmod 755 keeper/public
chmod 644 keeper/public/policy.json
chmod 600 keeper/secret/gateway.json keeper/state.json

# What Compose reads: the addresses, the images, the keeper's first owner and where releases are announced.
umask 077
cat > .env <<EOF
JEAN_ADDRESS=$address
GATEWAY_ADDRESS=$gateway_address
VERSION=$version
JEAN_IMAGE=$jean
GATEWAY_IMAGE=$gateway
KEEPER_CONFIG='{"owner":"$owner","origins":["https://$address"]}'
UPDATES=$updates
EOF
umask 022

cat > compose.yaml <<'EOF'
# A company's own server for Jean (D762), as install.sh wrote it: Caddy in front, on ports 80 and 443, of Jean's files,
# the gateway and the keeper. Nothing is logged. The images are those .env names, which ./update changes.
name: jean

x-quiet: &quiet
  logging:
    driver: none
  restart: unless-stopped

services:
  caddy:
    <<: *quiet
    image: caddy:2.11-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      JEAN_ADDRESS: ${JEAN_ADDRESS}
      GATEWAY_ADDRESS: ${GATEWAY_ADDRESS}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./keeper/public:/srv/public:ro
      - caddy:/data

  jean:
    <<: *quiet
    image: ${JEAN_IMAGE}

  gateway:
    <<: *quiet
    image: ${GATEWAY_IMAGE}
    user: "1000:1000"
    environment:
      GATEWAY_CONFIG_FILE: /config/gateway.json
    command: ["node", "--permission", "--allow-net", "--allow-fs-read=/app/", "--allow-fs-read=/config/", "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning", "gateway/serve.js"]
    volumes:
      - ./keeper/secret:/config:ro

  keeper:
    <<: *quiet
    image: ${GATEWAY_IMAGE}
    user: "1000:1000"
    environment:
      HOST: 0.0.0.0
      PORT: "8792"
      KEEPER_DIR: /data
      KEEPER_CONFIG: "${KEEPER_CONFIG}"
    command: ["node", "--permission", "--allow-net", "--allow-fs-read=/app/", "--allow-fs-read=/data/", "--allow-fs-write=/data/", "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning", "keeper/serve.js"]
    volumes:
      - ./keeper:/data

volumes:
  caddy:
EOF

cat > Caddyfile <<'EOF'
# A company's own server for Jean (D762), as install.sh wrote it. Each name gets its certificate from Let's Encrypt once
# it points here, plain HTTP is sent on to HTTPS, and nothing is logged.
{
	log default {
		output discard
	}
}

# No cookie of any kind (D725): one an answer would carry is dropped before it leaves.
(no-cookies) {
	header -Set-Cookie
}

{$JEAN_ADDRESS} {
	import no-cookies
	# The keeper, on Jean's own address: what it trusts is the owner's signature, never where a request comes from.
	handle /keeper {
		reverse_proxy keeper:8792
	}
	# The company's policy, as the keeper last wrote it, which Jean reads again each time it starts.
	handle /policy.json {
		root * /srv/public
		header Cache-Control no-cache
		file_server
	}
	handle {
		reverse_proxy jean:8080
	}
}

# The gateway, on an address of its own (D232).
{$GATEWAY_ADDRESS} {
	import no-cookies
	reverse_proxy gateway:8787
}
EOF

cat > update <<'EOF'
#!/bin/sh
# SPDX-License-Identifier: MIT
# Brings this server to the newest release, if .env says where releases are announced (UPDATES): a file of lines
# VERSION=, JEAN_IMAGE= and GATEWAY_IMAGE=, each image by digest, with its SSH signature beside it (.sig), which
# allowed_signers must vouch for, as for Jean's releases (D419). Only a newer version is taken. If Jean, the gateway or
# the keeper doesn't answer on the new images within thirty seconds, the previous ones come back. jean-update.timer runs
# it each day; as root, it can be run by hand too.
set -eu
cd /srv/jean
updates=$(sed -n 's/^UPDATES=//p' .env)
[ -n "$updates" ] || exit 0
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL --proto '=https' --proto-redir '=https' --max-time 60 -o "$work/server.env" "$updates"
curl -fsSL --proto '=https' --proto-redir '=https' --max-time 60 -o "$work/server.env.sig" "$updates.sig"
ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s "$work/server.env.sig" < "$work/server.env" >/dev/null 2>&1 \
  || { echo "update: the announcement is not signed by a key allowed_signers names" >&2; exit 1; }

image () { sed -n "s/^$1=\([a-z0-9][a-z0-9./_:-]*@sha256:[0-9a-f]\{64\}\)\$/\1/p" "$2"; }
version () { sed -n 's/^VERSION=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$/\1/p' "$1"; }
jean=$(image JEAN_IMAGE "$work/server.env")
gateway=$(image GATEWAY_IMAGE "$work/server.env")
new=$(version "$work/server.env")
now=$(version .env)
[ -n "$jean" ] && [ -n "$gateway" ] && [ -n "$new" ] || { echo "update: the announcement names no version and images by digest" >&2; exit 1; }
[ "$new" != "$now" ] && [ "$(printf '%s\n%s\n' "$now" "$new" | sort -V | tail -n 1)" = "$new" ] || exit 0

# Whether the keeper, the gateway and Jean answer, asked from Caddy's container, within thirty seconds.
answers () {
  tries=30
  until docker compose exec -T caddy wget -qO- http://keeper:8792/ 2>/dev/null | grep -q '"format":1' \
    && docker compose exec -T caddy wget -qO- http://gateway:8787/ 2>/dev/null | grep -q '"format":1' \
    && docker compose exec -T caddy wget -qO /dev/null http://jean:8080/ 2>/dev/null; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || return 1
    sleep 1
  done
}

cp -p .env .env.previous
sed -i -e "s|^VERSION=.*|VERSION=$new|" -e "s|^JEAN_IMAGE=.*|JEAN_IMAGE=$jean|" -e "s|^GATEWAY_IMAGE=.*|GATEWAY_IMAGE=$gateway|" .env
# Images that can't be pulled leave the running ones untouched.
if ! docker compose pull -q >/dev/null 2>&1; then
  mv .env.previous .env
  echo "update: the images of $new could not be pulled; staying on $now" >&2
  exit 1
fi
if docker compose up -d >/dev/null 2>&1 && answers; then
  echo "update: on $new"
else
  mv .env.previous .env
  docker compose up -d >/dev/null 2>&1
  answers && echo "update: back on $now" >&2
  exit 1
fi
EOF
chmod 755 update

cat > /etc/systemd/system/jean-update.service <<'EOF'
[Unit]
Description=Brings Jean's server to its newest signed release
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/srv/jean/update
EOF

cat > /etc/systemd/system/jean-update.timer <<'EOF'
[Unit]
Description=Looks each day for a newer signed release of Jean's server

[Timer]
OnCalendar=daily
RandomizedDelaySec=6h
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now jean-update.timer >/dev/null

docker compose up -d --remove-orphans
echo "install: Jean's server runs. Point $address and $gateway_address at this server's address; each gets its certificate once it does."
