// SPDX-License-Identifier: MIT
// This computer's line (D198, D677, D766): what a terminal runs to start the bridge, and what the desktop app runs, the
// bridge running only if it has the hash the page knows. Node, which it runs on, is the computer's own when it has one of
// 20 or later; else Node's own build for that system, fetched once into Jean's folder, and kept only if it has the hash
// Jean pins for it (bridge/node.json, which npm run lts writes), so nobody installs anything first.

/** @typedef {{ version: string, sha256: Record<string, string> }} Runtime the Node a line fetches: its version, and its archive's hash by Node's name for each system */

/** Each system, as `uname -sm` names it, by the name Node's builds give it. */
export const SYSTEMS = { 'darwin-arm64': 'Darwin arm64', 'darwin-x64': 'Darwin x86_64', 'linux-x64': 'Linux x86_64', 'linux-arm64': 'Linux aarch64' }

/** A text as one word for the shell. @param {string} text */
export const word = (text) => `'${text.replaceAll("'", `'\\''`)}'`

/** Runs the bytes in `b`, which `read` gives (the line's pipe, or the desktop app's fetch), if they have this hash. @param {string} read @param {string} hash */
const checked = (read, hash) => `${read};if((await import("node:crypto")).createHash("sha256").update(b).digest("base64")!=="${hash}")throw new Error("This isn't the bridge this page expects, so nothing ran: reload the page and copy the line again.");await import("data:text/javascript;base64,"+b.toString("base64"))`

/**
 * Shell that leaves Node's program in $n: the computer's own, of 20 or later; else the one Jean's folder keeps, fetched
 * there once from `url`, its {version} and {platform} filled in, and unpacked only if the archive has this system's hash.
 * @param {Runtime} runtime @param {string} url
 */
export const node = ({ version, sha256 }, url) => [`n=$(command -v node);"\${n:-false}" -e "process.exit(+(parseInt(process.versions.node)<20))" 2>/dev/null||{ d=\${XDG_CONFIG_HOME:-$HOME/.config}/jean/node-v${version}`,
  `n=$d/bin/node;[ -x "$n" ]||{ case $(uname -sm) in ${Object.entries(SYSTEMS).map(([platform, system]) => `"${system}")p=${platform} h=${sha256[platform]};;`).join('')}esac;echo "Fetching Node.js ${version} for Jean, once." >&2;t=$(mktemp)`,
  `curl -fsSL "${url.replaceAll('{version}', version).replace(/["$`\\]/g, encodeURIComponent).replaceAll('{platform}', '$p')}" -o "$t"&&[ -n "$h" ]&&[ "$( (sha256sum||shasum -a 256)<"$t" 2>/dev/null|cut -c1-64)" = "$h" ]&&rm -rf "$d" "$d.part"&&mkdir -p "$d.part"&&tar -xzf "$t" -C "$d.part" --strip-components=1&&mv "$d.part" "$d"`,
  `rm -f "$t";[ -x "$n" ]||{ echo "Jean's bridge runs on Node.js 20 or later, which couldn't be fetched here: install it, then run the line again." >&2;exit 1;};};}`].join(';')

/**
 * What the user pastes in a terminal, in their folder: Node, then the bridge from where Jean is served, checked, for this
 * origin, with the key in its environment.
 * @param {{ bridge: string, hash: string, runtime: Runtime, url: string, port: number, key: string, origin: string }} given
 */
export const line = ({ bridge, hash, runtime, url, port, key, origin }) => `curl -fsSL ${bridge} | JEAN_BRIDGE_KEY=${key} sh -c ${word(`${node(runtime, url)};exec "$n" --input-type=module -e "$0" -- "$@"`)} ${word(checked('const c=[];for await(const p of process.stdin)c.push(p);const b=Buffer.concat(c)', hash))} --port ${port} --origin ${origin}`

/**
 * What the desktop app runs, through the user's login shell, so it finds the Node their terminal finds: the same, the
 * bridge fetched by Node, in the folder given, `--attached` so it ends with the app; the key comes in its environment.
 * @param {{ bridge: string, hash: string, runtime: Runtime, url: string, port: number, origin: string, folder: string }} given
 */
export const started = ({ bridge, hash, runtime, url, port, origin, folder }) => `exec "\${SHELL:-/bin/sh}" -lic ${word(`${node(runtime, url)};exec "$n" --input-type=module -e ${word(checked('const b=Buffer.from(await(await fetch(process.argv[1])).arrayBuffer())', hash))} -- ${word(bridge)} --port ${port} --origin ${word(origin)} --folder ${word(folder)} --attached`)}`
