#!/bin/sh
# SPDX-License-Identifier: MIT
# The name the container gives Jean, APP_NAME (D698): brand.js and the install's manifests say it, written as the
# container starts into /tmp/app-name, which nginx serves in their place (nginx.conf). Without it, Jean's own are served.
# nginx's entrypoint runs this from /docker-entrypoint.d/; the folders read and written may be given, as a test does.
set -eu
from="${1:-/srv}"
out="${2:-/tmp/app-name}"
rm -rf "$out"
[ -n "${APP_NAME:-}" ] || exit 0
case "$APP_NAME" in
  *[[:cntrl:]]*) echo "$0: APP_NAME holds a line break or another control character, so Jean keeps its own name" >&2; exit 0 ;;
esac
# As a JSON string, which is a JavaScript one too, then as what sed puts in.
quoted=$(printf '"%s"' "$(printf '%s' "$APP_NAME" | sed 's/[\\"]/\\&/g')" | sed 's/[\\&|]/\\&/g')
mkdir -p "$out/manifests"
# BRAND's first field, whether minified (name:"Jean") or as written (name: 'Jean').
sed "s|name: *[\"'][^\"']*[\"']|name:$quoted|" "$from/brand.js" > "$out/brand.js"
for file in "$from"/manifest.webmanifest "$from"/manifests/*.webmanifest; do
  sed "s|^\(  \"\(short_\)\{0,1\}name\": \)\"[^\"]*\"|\1$quoted|" "$file" > "$out/${file#"$from"/}"
done
echo "$0: Jean goes by $APP_NAME"
