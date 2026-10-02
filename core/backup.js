// Backups: every file of Jean's folder in one zip, secrets and caches left out.
// Importing never deletes or overwrites what is already here, with one exception:
// a conversation that is longer in the backup (conversations only ever grow).
import { walk } from './fs.js'
import { readZip, writeZip } from './zip.js'
import { listProjects } from './settings.js'

/** @typedef {import('./types.js').FS} FS */

const MANIFEST = 'backup.json'

/** Secrets never leave the device; caches can always be rebuilt. @param {string} path */
export const isBackedUp = (path) => !/^\.(secrets|cache)(\/|$)/.test(path) && !path.endsWith('.tmp') && path !== MANIFEST

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

/**
 * @param {FS} fs @param {Uint8Array} zip
 * @returns {Promise<{ added: number, updated: number, kept: number }>}
 */
export async function importBackup(fs, zip) {
  const entries = readZip(zip)
  if (!entries.some((entry) => entry.name === MANIFEST)) throw new Error('This is not a backup')
  const result = { added: 0, updated: 0, kept: 0 }
  const homesBefore = await defaultProjects(fs)
  for (const entry of entries) {
    if (!isBackedUp(entry.name) || !safePath(entry.name)) continue
    const incoming = await entry.read()
    const current = await fs.readBytes(entry.name)
    if (current === null) {
      await fs.writeBytes(entry.name, incoming)
      result.added++
    } else if (entry.name.endsWith('.jsonl') && incoming.length > current.length && startsWith(incoming, current)) {
      await fs.writeBytes(entry.name, incoming)
      result.updated++
    } else result.kept++
  }
  // A fresh device already made an empty default project; the backup's own one replaces it.
  const homes = await defaultProjects(fs)
  if (homes.length > 1) {
    for (const dir of homesBefore) if (await isEmptyProject(fs, dir)) await fs.remove(dir)
  }
  return result
}

/** @param {string} path */
function safePath(path) {
  return !path.startsWith('/') && !path.includes('\\') && path.split('/').every((part) => part && part !== '.' && part !== '..')
}

/** @param {Uint8Array} bytes @param {Uint8Array} prefix */
function startsWith(bytes, prefix) {
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false
  return true
}

/** @param {FS} fs */
const defaultProjects = async (fs) => (await listProjects(fs)).filter((project) => project.data.default === true).map((project) => project.dir)

/** @param {FS} fs @param {string} dir */
async function isEmptyProject(fs, dir) {
  const files = await walk(fs, dir)
  return files.every((path) => path === `${dir}/project.md`)
}
