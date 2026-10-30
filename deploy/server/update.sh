#!/bin/sh
# Brings Jean's services on this server to a commit (README.md beside this file). CI sends the code as a tar on
# standard input, through a key that may run nothing but this script: `command="sudo -n /srv/jean/update",restrict`
# before it in ubuntu's authorized_keys. The tar holds exactly gateway/, requests/ and host/ as code/ keeps them;
# anything else is refused. The code in place is kept as code.previous/, the three services are recreated on the new
# code and asked whether they answer, and if one doesn't, the previous code comes back and they are recreated on it.
# Installed as /srv/jean/update, root's, mode 755; CI can't change it.
set -eu
cd /srv/jean
services='gateway share requests'
expected='gateway/gateway.js gateway/serve.js host/host.js host/package.json host/serve.js host/viewer.json requests/requests.js requests/serve.js'

new=$(mktemp -d /srv/jean/code.new.XXXXXX)
trap 'rm -rf "$new"' EXIT
tar -C "$new" --no-same-owner --no-same-permissions -xf -
found=$(cd "$new" && find . -type f | sed 's|^\./||' | sort | tr '\n' ' ')
want=$(printf '%s\n' $expected | sort | tr '\n' ' ')
[ "$found" = "$want" ] || { echo "update: the code sent holds $found, not $want" >&2; exit 1; }
printf '{"type":"module"}\n' > "$new/package.json"
chmod -R u=rwX,go=rX "$new"

# Whether each service answers on its own port, from inside its container, within ten seconds.
answers () {
  for name in $services; do
    case $name in gateway) port=8787 ;; share) port=8788 ;; requests) port=8789 ;; esac
    tries=10
    until docker compose exec -T "$name" wget -qO- "http://127.0.0.1:$port/" 2>/dev/null | grep -q '"format":1'; do
      tries=$((tries - 1))
      [ "$tries" -gt 0 ] || { echo "update: $name doesn't answer" >&2; return 1; }
      sleep 1
    done
  done
}

rm -rf code.previous
mv code code.previous
mv "$new" code
docker compose up -d --force-recreate $services >/dev/null 2>&1
if answers; then
  echo "update: $services answer on the new code"
else
  rm -rf code
  mv code.previous code
  docker compose up -d --force-recreate $services >/dev/null 2>&1
  answers && echo "update: back on the previous code" >&2
  exit 1
fi
