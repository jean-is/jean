// SPDX-License-Identifier: MIT
// A profile's folder made, opened and removed (D228) without loading Profiles, whose module registers its menu: ./profiles.js adds and
// removes profiles with these, and Your devices (caps/devices/) makes the one another device has, under its folder's name, or erases one (D700).
import { app, removing } from '../../ui/state.js'
import { here, rpc, files } from '../../ui/opfs.js'
import { scriptURL } from '../../ui/trusted.js'
import { VAULT, vaultKey, vaultId, deviceKey, encode } from '../../ui/seal.js'
import { rootedFS } from '../../core/fs.js'
import { inbox } from './family.js'

/** A profile's files, read and written by a storage worker of its own, handed its vault key, and that worker, to end. @param {string} dir @param {CryptoKey} key */
export async function into(dir, key) {
  const worker = new Worker(scriptURL(new URL('../../ui/storage-worker.js', import.meta.url)), { type: 'module' })
  const call = rpc(worker, crypto.randomUUID())
  if (await call('ping', dir) !== 'open') await call('key', '', /** @type {any} */ (key))
  return { worker, fs: rootedFS(files(call), dir) }
}

/**
 * A profile's vault.json, under the vault key `raw`, with the slots that open it and what it says of itself (name, colour, parent): that key.
 * @param {string} dir @param {Uint8Array} raw @param {import('../../ui/seal.js').Slot[]} slots @param {Record<string, unknown>} more
 */
export async function vaulted(dir, raw, slots, more) {
  const key = await vaultKey(raw)
  await app.whole?.write(`${dir}/${VAULT}`, JSON.stringify({ format: 1, id: encode(await vaultId(key)), slots, ...more }, null, 2) + '\n')
  return key
}

/**
 * A profile gone, with what it told its parent's and what its children's told it, once nothing refuses (D412); never one a child's profile
 * opens only with, under 13, which would stay closed for good. Whether it went. @param {string} dir
 */
export async function erase(dir) {
  const vaults = await Promise.all((await app.whole?.list('profiles') ?? []).map(async ({ name }) => JSON.parse(await app.whole?.read(`profiles/${name}/${VAULT}`) ?? 'null')))
  if (vaults.some((vault) => vault?.parent?.profile === dir && vault.slots?.some((/** @type {{ kind: string }} */ slot) => slot.kind === 'parent'))) return false
  return removing([{ profile: dir }], async () => {
    for (const path of [dir, inbox(dir), ...['time', 'set'].map((what) => `${inbox(here())}/${what}-${dir.slice(9, 35)}.json`)]) await app.whole?.remove(path)
    await deviceKey('forget', dir)
  })
}
