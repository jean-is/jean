// Which modules use which strings: every quoted key, and every template that builds one
// (`cap.${id}.name`). Used to check where each string lives (D97).
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../../', import.meta.url)
const DIRS = ['app/core', 'app/ui', 'app/caps', 'cli']
/**
 * Capabilities that bring their own part of the catalogue, locales/<id>/, loaded with them (D140, D146, D141, D157, D162, D196, D198,
 * D200, D215, D218, D251, D252, D254, D270, D289, D329, D334, D349, D359, D364, D385), and jean-cli's, cli/locales/, which only cli/ uses.
 */
export const PARTS = ['browser', 'backup', 'ask', 'folders', 'sync', 'computer', 'charts', 'scores', 'machine', 'slides', 'interactive', 'layouts', 'flows', 'pictures', 'receipt', 'search', 'certificates', 'brain-local', 'plugins', 'first', 'notifications', 'connections', 'compact', 'plan', 'lock', 'share', 'signin', 'cli']
/** Where the modules that use a part's strings are. @param {string} id */
export const owner = (id) => (id === 'cli' ? 'cli/' : `app/caps/${id}/`)

/** Every module of Jean's, with its text. @returns {Promise<Record<string, string>>} */
export async function sources() {
  /** @type {Record<string, string>} */
  const found = {}
  for (const dir of DIRS) {
    for (const entry of await readdir(new URL(`${dir}/`, ROOT), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue
      // parentPath ends with a slash for a folder's own files in some Node versions.
      const path = relative(fileURLToPath(ROOT), join(entry.parentPath, entry.name)).replaceAll('\\', '/')
      found[path] = await readFile(new URL(path, ROOT), 'utf8')
    }
  }
  return found
}

/** @param {string} text */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The keys a module's text names: quoted ones, and templates with a literal start such as
 * `cap.${id}.name`, which name every key they can build.
 * @param {string} text @param {string[]} keys
 */
export function keysIn(text, keys) {
  const named = new Set()
  const quoted = new Set([...text.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2]))
  for (const key of keys) if (quoted.has(key)) named.add(key)
  // A template that is all key: `cap.${id}.name`, `kind.${tool.kind ?? 'other'}.doing`.
  for (const [, template] of text.matchAll(/`([a-z][\w-]*\.(?:[\w.-]|\$\{[^}]*\})*)`/g)) {
    if (!template.includes('${')) continue
    const pattern = new RegExp(`^${template.split(/\$\{[^}]*\}/).map(escape).join('.+')}$`)
    for (const key of keys) if (pattern.test(key)) named.add(key)
  }
  return named
}

/** Modules that show a dialog import ui/dialogs.js, which loads the dialogs' strings. @param {string} path @param {string} text */
export const showsDialogs = (path, text) => path === 'app/ui/dialogs.js' || /from '(\.\/|(\.\.\/)+ui\/)dialogs\.js'/.test(text)
