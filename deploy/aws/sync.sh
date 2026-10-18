#!/bin/sh
# Jean's files into the S3 bucket CloudFront serves (README.md beside this file): each with its type
# and Cache-Control: no-cache, as deploy/README.md lists them, and what is no longer there deleted.
# CloudFront compresses up to 10 MB as it serves; a larger file goes as its brotli copy.
# Usage: deploy/aws/sync.sh <bucket> [folder]     (dist/web by default; needs the AWS CLI, signed in)
set -eu
bucket="s3://${1:?Name the bucket: deploy/aws/sync.sh <bucket>}"
from="${2:-dist/web}"

# One sync per type, each only of its own files: a type the CLI guesses may be wrong for a browser.
put () {
  type=$1; shift
  for ending in "$@"; do set -- "$@" --include "$ending"; shift; done
  aws s3 sync "$from" "$bucket" --delete --cache-control no-cache --exclude '*' "$@" --content-type "$type" --only-show-errors
}
put 'text/html; charset=utf-8' '*.html'
put 'text/javascript; charset=utf-8' '*.js' '*.mjs'
put 'text/css; charset=utf-8' '*.css'
put 'application/json; charset=utf-8' '*.json'
put 'application/manifest+json' '*.webmanifest'
put 'application/wasm' '*.wasm'
put 'image/svg+xml' '*.svg'
put 'image/png' '*.png'
put 'image/jpeg' '*.jpg'
put 'image/webp' '*.webp'
put 'font/woff2' '*.woff2'
put 'font/ttf' '*.ttf'
put 'text/plain; charset=utf-8' '*.txt' '*LICENSE' '*LICENSE_*'
put 'text/markdown; charset=utf-8' '*.md'
put 'text/csv; charset=utf-8' '*.csv'
put 'application/xml' '*.xml'
put 'application/zip' '*.zip'
put 'application/octet-stream' '*.bcmap' '*.pfb' '*.sf3'

find "$from" -type f -size +10000000c -name '*.wasm' | while read -r file; do
  if [ -f "$file.br" ]; then
    aws s3 cp "$file.br" "$bucket/${file#"$from"/}" --cache-control no-cache --content-encoding br --content-type application/wasm --only-show-errors
  fi
done
echo "Synced $from to $bucket"
