// SPDX-License-Identifier: MIT
// Backups: every file of Jean's folder in one zip, secrets, caches and a device's pairing left out.
// Importing never deletes or overwrites what is already here, with two exceptions: a conversation
// that is longer in the backup (conversations only ever grow), and settings (restoredSettings()).
import { walk } from '../../core/fs.js'
import { readZip, writeZip } from '../../core/zip.js'
import { listProjects, loadSettings, saveSettings } from '../../core/settings.js'
import { CONDITIONAL, STAYS } from '../devices/bundle.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {import('../../core/settings.js').Settings} Settings */

const MANIFEST = 'backup.json'

/** Secrets never leave the device; caches can always be rebuilt; what a device's pairing keeps is its own (caps/devices/, D700). @param {string} path */
export const isBackedUp = (path) => !/^\.(secrets|cache|devices)(\/|$)/.test(path) && !path.endsWith('.tmp') && path !== MANIFEST

/**
 * @param {FS} fs @param {{ by: string, now?: Date }} options
 * @returns {Promise<{ bytes: Uint8Array, files: number }>}
 */
export async function exportBackup(fs, { by, now = new Date() }) {
  const paths = (await walk(fs)).filter(isBackedUp).sort()
  /** @type {{ name: string, bytes: Uint8Array }[]} */
  const files = [{ name: MANIFEST, bytes: new TextEncoder().encode(JSON.stringify({ format: 1, kind: 'backup', createdAt: now.toISOString(), by }) + '\n') }]
  for (const path of paths) {
    const bytes = await fs.readBytes(path)
    if (bytes) files.push({ name: path, bytes })
  }
  return { bytes: await writeZip(files, now), files: paths.length }
}

/** Whether the bytes are a backup: a zip with its manifest. @param {Uint8Array} bytes */
export const isBackupZip = (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && readZip(bytes).some((entry) => entry.name === MANIFEST)

/**
 * @param {FS} fs @param {Uint8Array} zip @param {string[]} [catalogue] the capabilities this device can run (ui/discovery.js)
 * @returns {Promise<{ added: number, updated: number, kept: number }>}
 */
export async function importBackup(fs, zip, catalogue = []) {
  const entries = readZip(zip)
  if (!entries.some((entry) => entry.name === MANIFEST)) throw new Error('This is not a backup')
  const result = { added: 0, updated: 0, kept: 0 }
  const homesBefore = await defaultProjects(fs)
  for (const entry of entries) {
    if (!isBackedUp(entry.name) || !safePath(entry.name)) continue
    const incoming = await entry.read()
    const [current, settings] = [await fs.readBytes(entry.name), entry.name === 'settings.json']
    const kind = current === null ? 'added' : settings || (entry.name.endsWith('.jsonl') && incoming.length > current.length && startsWith(incoming, current)) ? 'updated' : 'kept'
    if (settings) await saveSettings(fs, restoredSettings(await loadSettings(fs), JSON.parse(new TextDecoder().decode(incoming)), catalogue))
    else if (kind !== 'kept') await fs.writeBytes(entry.name, incoming)
    result[kind]++
  }
  // A fresh device already made an empty default project; the backup's own one replaces it.
  const homes = await defaultProjects(fs)
  if (homes.length > 1) {
    for (const dir of homesBefore) if (await isEmptyProject(fs, dir)) await fs.remove(dir)
  }
  return result
}

/** The backup's, first, then this device's that it lacks, by id. @param {any[]} [theirs] @param {any[]} [mine] */
const join = (theirs = [], mine = []) => [...theirs, ...mine.filter((item) => !theirs.some((other) => (other.id ?? other) === (item.id ?? item)))]

/**
 * A backup's settings over this device's, as moving to a new device means: its brains, connections and choices win, without
 * their keys. Not field by field, since a fresh profile holds every default and its Auto can't be told from a choice. This
 * device keeps the fields that stay on one device, as pairing has them (STAYS, caps/devices/bundle.js), the brains and
 * connections only it has, whose keys are here by their ids, and the capabilities it found; the backup's come, but those
 * this device can't run (D660). Restore marks it `restored` (./backup.js).
 * @param {Settings} device @param {Partial<Settings>} backup @param {string[]} catalogue @returns {Settings}
 */
const restoredSettings = (device, backup, catalogue) => ({ ...device, ...backup, brains: join(backup.brains, device.brains), connections: join(backup.connections, device.connections),
  unlocked: join(backup.unlocked?.filter((id) => !CONDITIONAL.includes(id) || catalogue.includes(id)), device.unlocked), ...Object.fromEntries(STAYS.map((key) => [key, device[key]])) })

/** @param {string} path */
const safePath = (path) => !path.startsWith('/') && !path.includes('\\') && path.split('/').every((part) => part && part !== '.' && part !== '..')

/** @param {Uint8Array} bytes @param {Uint8Array} prefix */
const startsWith = (bytes, prefix) => prefix.every((byte, i) => bytes[i] === byte)

/** @param {FS} fs */
const defaultProjects = async (fs) => (await listProjects(fs)).filter((project) => project.data.default === true).map((project) => project.dir)

/** @param {FS} fs @param {string} dir */
async function isEmptyProject(fs, dir) {
  const files = await walk(fs, dir)
  return files.every((path) => path === `${dir}/project.md`)
}
