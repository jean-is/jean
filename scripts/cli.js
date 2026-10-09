// Puts jean-cli's package together in dist/cli/: every module cli/main.js reaches, statically or
// through import(), copied as it is and where it is, its strings (locales/cli/), the licence, the
// page npm shows (cli/README.md), and a package.json whose command is cli/main.js. Nothing is
// bundled or built: the package holds Jean's own files, as written. It needs Jean's own runtime
// dependencies that those modules import, never its optional ones.
// Usage: npm run cli, then `npm publish dist/cli`.
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { moduleGraph } from './graph.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'dist', 'cli')
// What is imported with import(), which the graph doesn't follow: the agent, the bridge for Claude Code (D235),
// the gateway (D191), what makes a Word document or a workbook, and the Anthropic adapter.
export const ENTRIES = ['cli/main.js', 'cli/acp.js', 'bridge/bridge.js', 'gateway/gateway.js', 'gateway/serve.js', 'caps/made/formats.js', 'core/anthropic.js']
/** The runtime dependencies its modules import, at Jean's own versions. */
export const DEPENDENCIES = ['@preact/signals-core', 'marked']

/** The files the package holds, and what they import that isn't a file of Jean's. @param {string} root */
export async function packageFiles (root) {
  const { found, problems } = await moduleGraph(ENTRIES, { imports: {} }, (path) => readFile(join(root, path), 'utf8').catch(() => null))
  const outside = problems.map((problem) => /^cannot resolve '([^']+)'/.exec(problem)?.[1] ?? problem)
  const unknown = outside.filter((name) => !name.startsWith('node:') && !DEPENDENCIES.includes(name))
  if (unknown.length) throw new Error(`jean-cli can't hold: ${[...new Set(unknown)].join(', ')}`)
  const strings = (await readdir(join(root, 'locales', 'cli'))).filter((file) => file.endsWith('.json')).map((file) => `locales/cli/${file}`)
  return [...found, ...strings, 'brand.js', 'LICENSE'].filter((path, i, all) => all.indexOf(path) === i).sort()
}

async function main () {
  const root = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const files = await packageFiles(ROOT)
  await rm(OUT, { recursive: true, force: true })
  for (const path of files) {
    await mkdir(dirname(join(OUT, path)), { recursive: true })
    await copyFile(join(ROOT, path), join(OUT, path))
  }
  await copyFile(join(ROOT, 'cli', 'README.md'), join(OUT, 'README.md'))
  await chmod(join(OUT, 'cli', 'main.js'), 0o755)
  const manifest = {
    name: 'jean-cli',
    version: root.version,
    description: 'Jean in your editor, through ACP, on the folder Sync keeps; and the gateway, for the services a browser can’t reach.',
    license: root.license,
    type: 'module',
    bin: { 'jean-cli': 'cli/main.js' },
    engines: root.engines,
    dependencies: Object.fromEntries(DEPENDENCIES.map((name) => [name, root.dependencies[name]])),
  }
  await writeFile(join(OUT, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`dist/cli: jean-cli ${root.version}, ${files.length + 2} files`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
