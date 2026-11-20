// SPDX-License-Identifier: MIT
// What Jean writes for a company's own server (D762), with no DOM: the block its owner pastes as the server's first-boot
// user data, and a change signed with the owner's key, as the server's keeper reads it (keeper/keeper.js).

/** Who signs Jean's releases, as docs/trust/allowed_signers names them (D419): the server checks the release against it. */
export const SIGNERS = 'jean.is namespaces="file,git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJPHinjnVOoayR7g4/bxWRJN02rc2un2afiyAqjv5/F4 Warehouse SAS, Jean releases'

/** @param {ArrayBuffer | Uint8Array} bytes */
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** The owner's public key as the server pins it: its raw point, in base64url. @param {CryptoKey} key */
export const ownerOf = async (key) => encode(await crypto.subtle.exportKey('raw', key))

/** What names that key in the keeper's answers: its point's SHA-256. @param {string} owner */
export const fingerprint = async (owner) => encode(await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(owner.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0))))

/** A name a server answers at, such as jean.acme.example. @param {string} name */
export const isName = (name) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(name)

/** The gateway's own address, beside Jean's unless named (D232). @param {string} address */
export const gatewayOf = (address) => ['gateway', address].join('.')

/** Where Jean's releases are, as policy or settings name it, safe to write into a shell line. @param {string} url */
export const isReleases = (url) => /^https:\/\/[^\s"'`$\\]+$/.test(url)

/**
 * The server's first-boot user data (cloud-init): it fetches the newest release's install.sh, checks it against the
 * release's SHA256SUMS and their signature by SIGNERS, then runs it for this address and owner, the updates following
 * the same releases (deploy/company/README.md).
 * @param {{ address: string, gateway?: string, owner: string, releases: string }} server
 */
export function cloudInit({ address, gateway, owner, releases }) {
  const latest = `${releases.replace(/\/+$/, '')}/latest/download`
  return ['#cloud-config', 'write_files:', '  - path: /root/allowed_signers', '    content: |', `      ${SIGNERS}`, 'runcmd:', '  - |', '    set -e', '    cd /root',
    `    for file in SHA256SUMS SHA256SUMS.sig install.sh; do curl -fsSLO --proto '=https' --proto-redir '=https' "${latest}/$file"; done`,
    '    ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS',
    '    sha256sum -c --ignore-missing SHA256SUMS',
    `    sh install.sh --address ${address}${gateway ? ` --gateway-address ${gateway}` : ''} --owner ${owner} --updates "${latest}/server.env"`, ''].join('\n')
}

/** A change signed with ES256, as a JWS compact serialisation. @param {CryptoKey} key the private half @param {object} change */
export async function signed(key, change) {
  const part = (/** @type {object} */ value) => encode(new TextEncoder().encode(JSON.stringify(value)))
  const head = `${part({ alg: 'ES256' })}.${part(change)}`
  return `${head}.${encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head)))}`
}
