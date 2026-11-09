// A project worked on together (D733): its documents, collections, decks, designs and files kept the same in every member's copy, as
// Sync keeps a folder (caps/sync/mirror.js), the journal standing for the folder: a change is files as they now are, settled by their
// kind there. Its tasks, what Jean remembers and its own instructions stay each person's; a task is worked on together on its own.
// The journal's copy is rebuilt in memory as the journal is read; rounds wait until it is read to its end, or a file not read yet
// would look deleted there.
import { app } from '../../ui/state.js'
import { memoryFS, rootedFS } from '../../core/fs.js'
import { stringifyFrontMatter, parseFrontMatter } from '../../core/settings.js'
import { syncRound, carried } from '../sync/mirror.js'
import { encode, decode } from '../../ui/seal.js'

/** @typedef {import('../../core/types.js').FS} FS */
/** Where a project is: `projects` and its folder there. @typedef {{ dir: string, folder: string }} Place */
/**
 * The journal's copy of the project, `raw` written as changes come and `there` as a round writes it, which `changes` notes to post.
 * @typedef {{ lines: Set<string>, table: string, raw?: FS, there?: FS, changes?: Record<string, string | null>, post?: (body: object) => Promise<unknown>, running?: Promise<unknown> }} Held
 */

/** What of a project goes: the folders of what it made and holds. */
export const FOLDERS = ['documents', 'decks', 'designs', 'collections', 'files']
const carry = (/** @type {string} */ path) => carried(path) && FOLDERS.includes(path.split('/')[0])
const hereOf = (/** @type {Place} */ place) => rootedFS(app.fs, `${place.dir}/${place.folder}`)
/** @param {Held} held */
function thereOf(held) {
  const raw = held.raw ??= memoryFS()
  held.changes ??= {}
  return held.there ??= { ...raw, writeBytes: async (path, bytes) => { await raw.writeBytes(path, bytes); /** @type {any} */ (held.changes)[path] = encode(bytes) },
    remove: async (path) => { await raw.remove(path); /** @type {any} */ (held.changes)[path] = null } }
}
/** A round between the project here and the journal's copy, what it wrote there posted. @param {Place} place @param {Held} held */
const round = (place, held) => (held.running = (held.running ?? Promise.resolve()).then(async () => {
  await syncRound(hereOf(place), thereOf(held), { cache: '.cache/together', carry })
  const changes = /** @type {Record<string, string | null>} */ (held.changes)
  held.changes = {}
  if (Object.keys(changes).length) await held.post?.({ files: changes })
}).catch((error) => console.warn('Together', error)))

/** @param {Place} place */
export const titleOf = async (place) => String(parseFrontMatter((await app.fs.read(`${place.dir}/${place.folder}/project.md`)) ?? '').data.name ?? '')

/** All of it, for a seed: its folder and name, and each file that goes. @param {Place} place */
export async function seedOf(place) {
  const here = hereOf(place), files = /** @type {Record<string, string>} */ ({})
  for (const folder of FOLDERS) for (const { name } of await here.list(folder).catch(() => [])) await walked(here, `${folder}/${name}`, files)
  return { project: { folder: place.folder, name: await titleOf(place) }, files }
}
/** @param {FS} fs @param {string} path @param {Record<string, string>} files */
async function walked(fs, path, files) {
  const bytes = carry(path) && await fs.readBytes(path).catch(() => null)
  if (bytes) files[path] = encode(bytes)
  else for (const { name } of await fs.list(path).catch(() => [])) await walked(fs, `${path}/${name}`, files)
}

/** What a seed holds, taken as the journal's. @param {Held} held @param {{ files: Record<string, string> }} content */
export const hold = (held, { files }) => Promise.all(Object.entries(files).map(([path, value]) => thereOf(held) && /** @type {FS} */ (held.raw).writeBytes(path, decode(value))))

/**
 * Files that came, into the journal's copy; once it is read to its end, a round brings them here. A newcomer's first seed makes the
 * project. @param {Place} place @param {{ files?: Record<string, string | null>, project?: { name: string } }} body @param {Held} held
 */
export async function take(place, body, held) {
  const project = `${place.dir}/${place.folder}/project.md`
  if (body.project && !(await app.fs.exists(project))) await app.fs.write(project, stringifyFrontMatter({ format: 1, name: body.project.name, createdAt: new Date().toISOString(), by: app.deviceId }, ''))
  thereOf(held)
  for (const [path, value] of Object.entries(body.files ?? {})) if (carry(path)) await (value === null ? held.raw?.remove(path) : held.raw?.writeBytes(path, decode(value)))
  if (held.post) await round(place, held)
}

/** What changes here goes, a round a moment after each change. @param {Place} place @param {Held} held @param {(body: object) => Promise<unknown>} post */
export function watch(place, held, post) {
  held.post = post
  let timer = 0
  round(place, held)
  return hereOf(place).watch?.((path) => { if (carry(path)) { clearTimeout(timer); timer = setTimeout(() => round(place, held), 300) } }, { all: true }) ?? (() => {})
}
