// SPDX-License-Identifier: MIT
// This computer's line (D198, D677, D766): what a terminal runs to start the bridge, and what the desktop app runs. Both
// run the bridge only if it has the hash the page knows, by sha256sum or shasum, one of which every Mac and Linux has, and
// then with sh, the bridge's own head finding Node, or fetching it once, so nobody installs anything first.

/** A text as one word for the shell. @param {string} text */
export const word = (text) => `'${text.replaceAll("'", `'\\''`)}'`

/** Runs the file in $t with sh, these arguments after it, if it has this hash; else removes it, nothing of it run. @param {string} hash its SHA-256, in hex @param {string} args */
const checked = (hash, args) => `[ "$( (sha256sum||shasum -a 256)<"$t" 2>/dev/null|cut -c1-64)" = ${hash} ]&&exec sh "$t" ${args};rm -f "$t";echo "This isn't the bridge this page expects, so nothing ran: reload the page and copy the line again." >&2;exit 1`

/**
 * What the user pastes in a terminal, in their folder: the bridge from where Jean is served, checked, for this origin, with
 * the key in its environment, and where Node's builds are, `url` with {version} and {platform} in it.
 * @param {{ bridge: string, hash: string, url: string, port: number, key: string, origin: string }} given
 */
export const line = ({ bridge, hash, url, port, key, origin }) => `curl -fsSL ${bridge} | JEAN_BRIDGE_KEY=${key} sh -c ${word(`t=$(mktemp);cat>"$t";${checked(hash, '"$@"')}`)} - --port ${port} --origin ${origin} ${word(`--node=${url}`)}`

/**
 * What the desktop app runs, through the user's login shell, so it finds the Node their terminal finds: the same, in the
 * folder given, `--attached` so it ends with the app, whose pipe stays its input; the key comes in its environment.
 * @param {{ bridge: string, hash: string, url: string, port: number, origin: string, folder: string }} given
 */
export const started = ({ bridge, hash, url, port, origin, folder }) => `exec "\${SHELL:-/bin/sh}" -lic ${word(`t=$(mktemp);curl -fsSL ${word(bridge)} -o "$t";${checked(hash, `--port ${port} --origin ${word(origin)} --folder ${word(folder)} --attached ${word(`--node=${url}`)}`)}`)}`
