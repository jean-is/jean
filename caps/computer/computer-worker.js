// The Computer (D162), in a worker started from a blob in the sandbox's frame (sandbox.html): an opaque
// origin with no network. Its engines come in as files from Jean, each the first time a run needs it:
// the shell (just-bash), whose filesystem is every conversation's computer; QuickJS for JavaScript;
// Pyodide for Python. A conversation's computer keeps /home/user and /tmp for the visit; /workspace is
// a copy of its folder, or of its project's workspace, which Jean brings up to date before each run
// and takes the changes back from after it. Whatever leaves the worker, a call to one of Jean's tools,
// an engine it needs, a request to the internet, crosses to Jean as a message, and Jean makes it under
// the rules (D48) and Settings › Computer: the worker holds no key and has no network of its own.
//
// → { type: 'boot' }                                          ← { type: 'ready' }
// → { type: 'load', engine, files }                           ← { type: 'loaded', engine, error? }
// → { type: 'run', run, engine, computer, put, gone, … }      ← { type: 'call' | 'need' | 'fetch', run, id, … }…,
//                                                                { type: 'done', run, ok, result, logs, error, exit, changes }
// → { type: 'answer', run, id, ok, value, error }
// A classic script (no static imports): the sandbox can only start classic workers.

// QuickJS's JS_EVAL_FLAG_ASYNC (1 << 7), which quickjs-emscripten doesn't name: a global
// script where await works, evaluating to a promise of { value: <last expression> }.
const ASYNC_SCRIPT = 128
// Never resolved: the fetch below answers for them, with Pyodide's own files or through Jean.
const INDEX = 'https://sandbox.invalid/pyodide/'
const PACKAGES = 'https://packages.invalid/'
const WORKSPACE = '/workspace'
const HOME = '/home/user'

/** The engines, once loaded: `shell` (just-bash and fflate), `quickjs`, `pyodide`. @type {Record<string, any>} */
const engines = {}
/** Requests to Jean waiting for their answer, by id. @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
const waiting = new Map()
let asked = 0
/** Each conversation's computer, for the visit. @type {Map<string, Computer>} */
const computers = new Map()

/**
 * @typedef {{ fs: any, workspace: any, bash: any, run: number, env: Record<string, string> | null, synced: Map<string, string>,
 *   registries: Record<string, string>, limits: Record<string, number> }} Computer
 */

self.onmessage = async ({ data }) => {
  if (data.type === 'boot') return self.postMessage({ type: 'ready' })
  if (data.type === 'answer') return settle(data)
  if (data.type === 'load') {
    try {
      engines[data.engine] ??= await LOADERS[data.engine](data.files)
      self.postMessage({ type: 'loaded', engine: data.engine })
    } catch (error) {
      self.postMessage({ type: 'loaded', engine: data.engine, error: said(error) })
    }
  } else if (data.type === 'run') {
    try {
      const computer = await computerOf(data)
      await receive(computer, data.put, data.gone, data.fresh)
      const outcome = await RUNS[data.engine](data, computer)
      self.postMessage({ type: 'done', run: data.run, ...outcome, changes: await changes(computer) })
    } catch (error) {
      self.postMessage({ type: 'done', run: data.run, ok: false, error: said(error), logs: [] })
    }
  }
}

/** @param {any} error */
const said = (error) => String(error?.message ?? error)

/** Asks Jean for something and waits for the answer. @param {number} run @param {Record<string, any>} message @returns {Promise<any>} */
function ask(run, message) {
  return new Promise((resolve, reject) => {
    const id = ++asked
    waiting.set(id, { resolve, reject })
    self.postMessage({ ...message, run, id })
  })
}

/** @param {{ id: number, ok: boolean, value?: any, error?: string }} answer */
function settle({ id, ok, value, error }) {
  const pending = waiting.get(id)
  waiting.delete(id)
  if (ok) pending?.resolve(value)
  else pending?.reject(new Error(String(error)))
}

/** An engine, asked of Jean when this sandbox doesn't have it yet. @param {number} run @param {string} engine */
async function engine(run, engine) {
  if (!engines[engine]) await ask(run, { type: 'need', engine })
  return engines[engine]
}

// ─── Engines ─────────────────────────────────────────────────────────────────

/**
 * An engine's modules as blob URLs, leaves first, each `./name.mjs` import pointed at the URL of
 * the file it names.
 * @param {Record<string, string | ArrayBuffer>} files @returns {Record<string, string>}
 */
function modules(files) {
  /** @type {Record<string, string>} */
  const sources = Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.mjs')))
  /** @type {Record<string, string>} */
  const urls = {}
  const pending = Object.keys(sources)
  const imports = (/** @type {string} */ name) => [...sources[name].matchAll(/["']\.\/([\w.-]+\.mjs)["']/g)].map((match) => match[1])
  while (pending.length) {
    const next = pending.findIndex((name) => imports(name).every((dep) => urls[dep] || !sources[dep]))
    if (next < 0) throw new Error('The runtime has an import cycle')
    const [name] = pending.splice(next, 1)
    const text = sources[name].replace(/(["'])\.\/([\w.-]+\.mjs)\1/g, (match, quote, dep) => (urls[dep] ? quote + urls[dep] + quote : match))
    urls[name] = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
  }
  return urls
}

/** @type {Record<string, (files: Record<string, any>) => Promise<any>>} */
const LOADERS = {
  shell: async (files) => {
    // node:zlib, for gzip: fflate's, under Node's names.
    files['node-zlib.mjs'] = "export { gzipSync, gunzipSync } from './fflate.mjs'\nexport const constants = { Z_BEST_COMPRESSION: 9, Z_BEST_SPEED: 1, Z_DEFAULT_COMPRESSION: 6 }\n"
    const urls = modules(files)
    const [shell, zip] = await Promise.all([import(urls['just-bash.mjs']), import(urls['fflate.mjs'])])
    return { ...shell, zip }
  },
  quickjs: async (files) => {
    const urls = modules(files)
    const { newQuickJSWASMModuleFromVariant, newVariant } = await import(urls['index.mjs'])
    const variant = {
      type: 'sync',
      importFFI: () => import(urls['ffi.mjs']).then((module) => module.QuickJSFFI),
      importModuleLoader: () => import(urls['emscripten-module.mjs']).then((module) => module.default),
    }
    // The bytes come from Jean, so nothing is fetched; a location keeps Emscripten from
    // resolving one against import.meta.url, which a blob: URL can't be a base for.
    return newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmBinary: files['emscripten-module.wasm'], wasmLocation: 'emscripten-module.wasm' }))
  },
  // Pyodide's loader fetches its files: its own come from Jean in the load message, and packages
  // through Jean from the registry Settings name (D80, D162). Pyodide refuses classic workers when
  // importScripts() accepts a data: URL; the sandbox's policy refuses data: scripts, so it never does.
  pyodide: async (files) => {
    self.fetch = async (input, init) => {
      const url = String(/** @type {any} */ (input)?.url ?? input)
      const own = url.startsWith(INDEX) ? files[url.slice(INDEX.length)] : undefined
      if (own !== undefined) return new Response(own, { headers: { 'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } })
      if (!interpreter.computer) throw new TypeError('There is no network here.')
      return bridged(interpreter.computer, url.startsWith(PACKAGES) ? interpreter.computer.registries.pyodide.replace('{version}', engines.pyodide?.version ?? '') + url.slice(PACKAGES.length) : input, init)
    }
    const module = (/** @type {string} */ name) => import(URL.createObjectURL(new Blob([files[name]], { type: 'text/javascript' })))
    const [{ loadPyodide }, { default: createPyodideModule }] = await Promise.all([module('pyodide.mjs'), module('pyodide.asm.mjs')])
    // `import js` reaches only these, not the worker's globals: what pyfetch and micropip use, and
    // fetch, which goes through Jean.
    const jsglobals = { fetch: (/** @type {any[]} */ ...args) => self.fetch(...args), AbortController, AbortSignal, Headers, Request, Response, Object, Array, Promise, Uint8Array, ArrayBuffer, JSON, URL, URLSearchParams, Blob, TextEncoder, TextDecoder, setTimeout, clearTimeout }
    return loadPyodide({ indexURL: INDEX, lockFileContents: files['pyodide-lock.json'], packageBaseUrl: PACKAGES, createPyodideModule, jsglobals })
  },
}

// ─── A conversation's computer ───────────────────────────────────────────────

/** @param {{ run: number, computer: string, registries?: Record<string, string>, limits?: Record<string, number> }} data @returns {Promise<Computer>} */
async function computerOf({ run, computer: id, registries = {}, limits = {} }) {
  const { Bash, InMemoryFs, MountableFs } = await engine(run, 'shell')
  let computer = computers.get(id)
  if (!computer) {
    const workspace = new InMemoryFs()
    const fs = new MountableFs({ base: new InMemoryFs(), mounts: [{ mountPoint: WORKSPACE, filesystem: workspace }] })
    for (const dir of [HOME, '/tmp']) await fs.mkdir(dir, { recursive: true })
    const owner = computer = /** @type {Computer} */ ({ fs, workspace, run, env: null, synced: new Map(), registries, limits })
    computer.bash = new Bash({
      fs,
      cwd: WORKSPACE,
      env: { HOME, USER: 'user', LANG: 'C.UTF-8' },
      customCommands: commands(computer),
      executionLimits: { maxExecutionTimeMs: limits.time ?? 120_000, maxOutputSize: 32 * 1024 * 1024 },
      fetch: (/** @type {string} */ url, /** @type {any} */ options = {}) => secureFetch(owner, url, options),
    })
    computers.set(id, computer)
  }
  Object.assign(computer, { run, registries, limits })
  return computer
}

/**
 * Files Jean sends in (paths in /workspace), and files it took away; all of them, after another
 * folder's (`fresh`). @param {Computer} computer @param {Record<string, ArrayBuffer>} [put] @param {string[]} [gone] @param {boolean} [fresh]
 */
async function receive(computer, put = {}, gone = [], fresh = false) {
  const { workspace, synced } = computer
  if (fresh) for (const path of await filesOf(workspace)) await workspace.rm(path, { force: true })
  if (fresh) synced.clear()
  for (const [path, bytes] of Object.entries(put)) {
    const full = `/${path}`
    await workspace.mkdir(full.slice(0, full.lastIndexOf('/')) || '/', { recursive: true })
    await workspace.writeFile(full, new Uint8Array(bytes))
    synced.set(full, await stampOf(workspace, full))
  }
  for (const path of gone) {
    await workspace.rm(`/${path}`, { force: true })
    synced.delete(`/${path}`)
  }
}

/** @param {any} fs @param {string} path */
const stampOf = async (fs, path) => {
  const { size, mtime } = await fs.stat(path)
  return `${size}:${+mtime}`
}

/** The files of a filesystem, `node_modules` aside: it lives in the computer only. @param {any} fs */
async function filesOf(fs) {
  const paths = []
  for (const path of fs.getAllPaths()) if (!/\/node_modules\//.test(path) && (await fs.stat(path).catch(() => null))?.isFile) paths.push(path)
  return paths
}

/** What a run changed in /workspace, for Jean to keep (D162). @param {Computer} computer */
async function changes(computer) {
  const { workspace, synced } = computer
  /** @type {Record<string, ArrayBuffer>} */
  const put = {}
  const now = new Map()
  for (const path of await filesOf(workspace)) {
    const stamp = await stampOf(workspace, path)
    now.set(path, stamp)
    if (synced.get(path) !== stamp) put[path.slice(1)] = (await workspace.readFileBuffer(path)).slice().buffer
  }
  const gone = [...synced.keys()].filter((path) => !now.has(path)).map((path) => path.slice(1))
  computer.synced = now
  return { put, gone }
}

// ─── The internet, through Jean ──────────────────────────────────────────────

/**
 * A request, made by Jean under Settings › Computer, as a Response. @param {Computer} computer
 * @param {RequestInfo | URL} input @param {RequestInit} [init]
 */
async function bridged(computer, input, init = {}) {
  const request = new Request(input, init)
  const body = /^(GET|HEAD)$/.test(request.method) ? undefined : await request.arrayBuffer()
  const answer = await ask(computer.run, { type: 'fetch', url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body })
  const empty = request.method === 'HEAD' || [204, 205, 304].includes(answer.status)
  const response = new Response(empty ? null : answer.body, { status: answer.status, statusText: answer.statusText, headers: answer.headers })
  Object.defineProperty(response, 'url', { value: answer.url })
  return response
}

/** The same, as the shell's curl wants it. @param {Computer} computer @param {string} url @param {any} options */
async function secureFetch(computer, url, { method = 'GET', headers, body } = {}) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const answer = await ask(computer.run, { type: 'fetch', url, method, headers: Object.fromEntries(new Headers(headers)), body: bytes?.slice().buffer })
  return { status: answer.status, statusText: answer.statusText, headers: answer.headers, body: new Uint8Array(answer.body ?? new ArrayBuffer(0)), url: answer.url }
}

// ─── Runs ────────────────────────────────────────────────────────────────────

/** @type {Record<string, (data: any, computer: Computer) => Promise<Record<string, any>>>} */
const RUNS = {
  // A command, in the conversation's shell, which keeps its directory and variables between commands.
  shell: async ({ command }, computer) => {
    const env = computer.env ?? undefined
    const result = await computer.bash.exec(String(command), { ...(env && { env, cwd: env.PWD }) })
    computer.env = result.env
    return { ok: true, exit: result.exitCode, stdout: result.stdout, stderr: result.stderr, cwd: result.env?.PWD }
  },
  quickjs: (data, computer) => javascript({ ...data, cwd: WORKSPACE, tool: true }, computer),
  pyodide: (data, computer) => python({ ...data, cwd: WORKSPACE, tool: true }, computer),
}

/** @param {string | Uint8Array | undefined} stdin bytes the shell carries as latin1 text */
const text = (stdin) => (typeof stdin === 'string' ? new TextDecoder().decode(Uint8Array.from(stdin, (char) => char.charCodeAt(0))) : new TextDecoder().decode(stdin ?? new Uint8Array()))

/** @param {string} stdout @param {string} stderr @param {number} exitCode */
const exit = (stdout, stderr, exitCode) => ({ stdout, stderr, exitCode })

/** What the shell adds to its own commands: Python, pip, Node's way of running JavaScript, and tar. @param {Computer} computer */
function commands(computer) {
  const { defineCommand } = engines.shell
  /** @param {string} name @param {(args: string[], ctx: any) => Promise<any>} run */
  const command = (name, run) => defineCommand(name, async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    try {
      return await run(args, ctx)
    } catch (error) {
      return exit('', `${name}: ${said(error)}\n`, 1)
    }
  })
  /** A program's source: -c (or -e, -p) code, a file, or what comes on stdin. @param {string[]} args @param {any} ctx @param {string} flags */
  const source = async (args, ctx, flags) => {
    const [first, ...rest] = args
    if (first && flags.includes(first)) return { code: rest[0] ?? '', argv: rest.slice(1), print: first === '-p', name: first }
    if (first && first !== '-') return { code: await ctx.fs.readFile(ctx.fs.resolvePath(ctx.cwd, first)), argv: rest, name: first, file: ctx.fs.resolvePath(ctx.cwd, first) }
    return { code: text(ctx.stdin), argv: rest, name: '-' }
  }
  const py = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    if (/^(-V|--version)$/.test(args[0] ?? '')) return exit('Python 3 (Pyodide)\n', '', 0)
    if (args[0] === '-m' && args[1] === 'pip') return pip(args.slice(2), ctx)
    const program = await source(args, ctx, ['-c'])
    const ran = await python({ ...program, run: computer.run, cwd: ctx.cwd, stdin: program.name === '-' ? '' : text(ctx.stdin) }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  const pip = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    const [verb, ...names] = args.filter((arg) => !/^-/.test(arg))
    if (verb !== 'install' && verb !== 'list') return exit('', 'Only pip install and pip list work here.\n', 1)
    const code = verb === 'list' ? 'import micropip\nprint("\\n".join(f"{p.name}=={p.version}" for p in micropip.list().values()))'
      : `import micropip\nawait micropip.install(${JSON.stringify(names)}, index_urls=${JSON.stringify(computer.registries.pypi ?? '')} or None)\nprint("Installed:", ", ".join(${JSON.stringify(names)}))`
    const ran = await python({ code, run: computer.run, cwd: ctx.cwd, packages: ['micropip'] }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  const node = async (/** @type {string[]} */ args, /** @type {any} */ ctx) => {
    if (/^(-v|--version)$/.test(args[0] ?? '')) return exit('QuickJS (JavaScript)\n', '', 0)
    const program = await source(args, ctx, ['-e', '-p'])
    const ran = await javascript({ ...program, run: computer.run, cwd: ctx.cwd, env: Object.fromEntries(ctx.env ?? []) }, computer)
    return exit(ran.stdout, ran.stderr, ran.exit)
  }
  return [command('python', py), command('python3', py), command('pip', pip), command('pip3', pip), command('node', node), command('js', node),
    command('tar', (args, ctx) => tarCommand(args, ctx)), command('npm', (args, ctx) => npm(args, ctx, computer))]
}

// ─── tar and npm ─────────────────────────────────────────────────────────────

/** The entries of a tar archive (ustar, and pax for long names). @param {Uint8Array} bytes */
function* untar(bytes) {
  const text = (/** @type {number} */ from, /** @type {number} */ to) => new TextDecoder().decode(bytes.subarray(from, to)).replace(/\0[\s\S]*$/, '')
  let long = ''
  for (let at = 0; at + 512 <= bytes.length;) {
    const name = text(at, at + 100)
    if (!name) break
    const size = parseInt(text(at + 124, at + 136).trim() || '0', 8)
    const type = text(at + 156, at + 157)
    const prefix = text(at + 257, at + 263).startsWith('ustar') ? text(at + 345, at + 500) : ''
    const body = bytes.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') long = /(?:^|\n)\d+ path=([^\n]*)/.exec(new TextDecoder().decode(body))?.[1] ?? ''
    else {
      if (type === '0' || type === '' || type === '5') yield { path: long || (prefix ? `${prefix}/${name}` : name), bytes: body, dir: type === '5' }
      long = ''
    }
  }
}

/** A tar archive of files. @param {{ path: string, bytes: Uint8Array }[]} files */
function tarball(files) {
  const blocks = []
  const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
  for (const { path, bytes } of files) {
    const header = new Uint8Array(512)
    const put = (/** @type {string} */ text, /** @type {number} */ at, /** @type {number} */ length) => header.set(encode(text).subarray(0, length), at)
    const cut = path.length > 100 ? path.indexOf('/', path.length - 101) : -1
    put(cut > 0 ? path.slice(cut + 1) : path, 0, 100)
    if (cut > 0) put(path.slice(0, cut), 345, 155)
    put('0000644', 100, 8)
    put(`${bytes.length.toString(8).padStart(11, '0')}`, 124, 12)
    put(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}`, 136, 12)
    put('        0', 148, 9)
    put('ustar\u000000', 257, 8)
    put(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8)
    blocks.push(header, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0))
  let at = 0
  for (const block of blocks) {
    out.set(block, at)
    at += block.length
  }
  return out
}

/** tar: create (c), extract (x) or list (t) an archive, gzipped with z, in -C's folder. @param {string[]} args @param {any} ctx */
async function tarCommand(args, ctx) {
  const { fs } = ctx
  const flags = new Set()
  let file = ''
  let dir = ctx.cwd
  const paths = []
  for (let i = 0; i < args.length; i++) {
    if (/^-?[cxtzvf]+$/.test(args[i]) && (i === 0 || args[i].startsWith('-'))) for (const flag of args[i].replace('-', '')) flag === 'f' ? (file = args[++i]) : flags.add(flag)
    else if (args[i] === '-C') dir = fs.resolvePath(ctx.cwd, args[++i])
    else paths.push(args[i])
  }
  if (!file) return exit('', 'tar: name the archive with -f\n', 2)
  const archive = fs.resolvePath(ctx.cwd, file)
  const { gzipSync, gunzipSync } = engines.shell.zip
  if (flags.has('c')) {
    /** @type {{ path: string, bytes: Uint8Array }[]} */
    const files = []
    const add = async (/** @type {string} */ path) => {
      const full = fs.resolvePath(dir, path)
      if ((await fs.stat(full)).isDirectory) for (const name of await fs.readdir(full)) await add(`${path}/${name}`)
      else files.push({ path, bytes: await fs.readFileBuffer(full) })
    }
    for (const path of paths) await add(path.replace(/\/+$/, ''))
    const bytes = tarball(files)
    await fs.writeFile(archive, flags.has('z') ? gzipSync(bytes) : bytes)
    return exit(flags.has('v') ? lines(files.map((each) => each.path)) : '', '', 0)
  }
  const read = await fs.readFileBuffer(archive)
  const entries = [...untar(read[0] === 0x1f && read[1] === 0x8b ? gunzipSync(read) : read)]
  if (flags.has('x')) {
    for (const entry of entries) {
      const full = fs.resolvePath(dir, entry.path)
      if (entry.dir) await fs.mkdir(full, { recursive: true })
      else {
        await fs.mkdir(full.slice(0, full.lastIndexOf('/')) || '/', { recursive: true })
        await fs.writeFile(full, entry.bytes)
      }
    }
  }
  return exit(flags.has('t') || flags.has('v') ? lines(entries.map((entry) => entry.path)) : '', '', 0)
}

/** A version's numbers; a missing or wild one (x, *) as NaN. @param {string} version */
const numbers = (version) => version.replace(/^[v=\s]+/, '').split(/[-+]/)[0].split('.').slice(0, 3).map((part) => (/^\d+$/.test(part) ? Number(part) : NaN))

/** Whether a version is in a range of npm's: exact, x, ^, ~, comparisons, and their unions with ||. @param {string} version @param {string} [range] */
function satisfies(version, range = '*') {
  if (/-/.test(version.split('+')[0]) && !range.includes('-')) return false
  const v = numbers(version)
  const compare = (/** @type {number[]} */ base) => {
    for (let i = 0; i < 3; i++) if ((v[i] || 0) !== (base[i] || 0)) return Math.sign((v[i] || 0) - (base[i] || 0))
    return 0
  }
  return String(range).split('||').some((part) => part.trim().split(/\s+/).every((comparator) => {
    if (!comparator || /^(\*|x|latest)$/i.test(comparator)) return true
    const [, op = '', rest = ''] = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(comparator) ?? []
    const given = numbers(rest)
    const fixed = given.filter((n) => !isNaN(n)).length
    const base = given.map((n) => (isNaN(n) ? 0 : n))
    const order = compare(base)
    if (op === '>=') return order >= 0
    if (op === '>') return order > 0
    if (op === '<=') return order <= 0
    if (op === '<') return order < 0
    const same = op === '^' ? (base[0] || fixed === 1 ? 1 : base[1] || fixed === 2 ? 2 : 3) : op === '~' ? (fixed >= 2 ? 2 : 1) : fixed
    return order >= 0 && v.slice(0, same).every((n, i) => n === base[i])
  }))
}

/**
 * npm install: packages from the npm registry Settings name, into ./node_modules, flat, with their
 * dependencies; checked against their integrity; none that runs a script as it installs. With no
 * name, those package.json lists. The names asked for are added to package.json.
 * @param {string[]} args @param {any} ctx @param {Computer} computer
 */
async function npm(args, ctx, computer) {
  const [verb, ...specs] = args.filter((arg) => !arg.startsWith('-'))
  if (!/^(install|i|add)$/.test(verb ?? '')) return exit('', 'Only npm install works here.\n', 1)
  const { fs, cwd } = ctx
  const registry = (computer.registries.npm || 'https://registry.npmjs.org/').replace(/\/?$/, '/')
  const manifestPath = `${cwd}/package.json`
  const manifest = (await fs.exists(manifestPath)) ? JSON.parse(await fs.readFile(manifestPath)) : {}
  const wanted = specs.length ? specs.map((spec) => /^(@?[^@]+)(?:@(.+))?$/.exec(spec)?.slice(1) ?? [spec]) : Object.entries(manifest.dependencies ?? {})
  const queue = wanted.map(([name, range]) => [name, range || 'latest'])
  /** @type {Record<string, string>} */
  const added = {}
  while (queue.length) {
    const [name, range] = /** @type {[string, string]} */ (queue.shift())
    const at = `${cwd}/node_modules/${name}`
    const have = (await fs.exists(`${at}/package.json`)) ? JSON.parse(await fs.readFile(`${at}/package.json`)).version : null
    if (have && (range === 'latest' || satisfies(have, range))) continue
    const meta = await (await bridged(computer, `${registry}${name.replace('/', '%2f')}`)).json()
    if (!meta?.versions) throw new Error(`${name} isn't in the registry`)
    const tagged = meta['dist-tags']?.[range]
    const version = tagged ?? Object.keys(meta.versions).filter((each) => satisfies(each, range)).sort((a, b) => (satisfies(a, `>${b}`) ? 1 : -1)).at(-1)
    if (!version) throw new Error(`No version of ${name} matches ${range}`)
    const info = meta.versions[version]
    const scripts = Object.keys(info.scripts ?? {}).filter((script) => /^(pre|post)?install$/.test(script))
    if (scripts.length) throw new Error(`${name}@${version} runs a script as it installs (${scripts.join(', ')}), which can't run here`)
    const tgz = new Uint8Array(await (await bridged(computer, info.dist.tarball)).arrayBuffer())
    const [, algorithm, expected] = /^sha(512|256|1)-(.+)$/.exec(info.dist.integrity ?? '') ?? []
    if (algorithm && crypto.subtle) {
      const digest = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest(`SHA-${algorithm}`, tgz))))
      if (digest !== expected) throw new Error(`${name}@${version} isn't what the registry says it is`)
    }
    await fs.rm(at, { recursive: true, force: true })
    for (const entry of untar(engines.shell.zip.gunzipSync(tgz))) {
      const path = `${at}/${entry.path.replace(/^[^/]+\//, '')}`
      if (entry.dir) continue
      await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true })
      await fs.writeFile(path, entry.bytes)
    }
    added[name] = version
    for (const [dependency, wants] of Object.entries(info.dependencies ?? {})) queue.push([dependency, String(wants)])
  }
  if (specs.length) {
    manifest.dependencies = { ...manifest.dependencies, ...Object.fromEntries(wanted.map(([name]) => [name, added[name] ? `^${added[name]}` : manifest.dependencies?.[name] ?? '*'])) }
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  const count = Object.keys(added).length
  return exit(`added ${count} package${count === 1 ? '' : 's'}\n${lines(Object.entries(added).map(([name, version]) => `${name}@${version}`))}`, '', 0)
}

// ─── Packages, for node ──────────────────────────────────────────────────────

/** @param {string} path */
const dirOf = (path) => path.slice(0, path.lastIndexOf('/')) || '/'

/** A path without its . and .. parts. @param {string} path */
function normal(path) {
  const parts = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return `/${parts.join('/')}`
}

/**
 * Where an import or a require leads, as Node finds it: a relative path with its extension or
 * index, or a package in the nearest node_modules, by its exports, module or main.
 * @param {Map<string, string>} files @param {string} base the importing file @param {string} spec @param {'import' | 'require'} kind
 */
function resolve(files, base, spec, kind) {
  const file = (/** @type {string} */ path) => ['', '.js', '.mjs', '.cjs', '.json', '/index.js', '/index.mjs', '/index.cjs'].map((end) => path + end).find((each) => files.has(each))
  if (/^\.{0,2}\//.test(spec)) return file(normal(spec.startsWith('/') ? spec : `${dirOf(base)}/${spec}`))
  const [, name = '', sub] = /^((?:@[^/]+\/)?[^/]+)(?:\/(.*))?$/.exec(spec) ?? []
  for (let dir = dirOf(base); ; dir = dirOf(dir)) {
    const at = `${dir === '/' ? '' : dir}/node_modules/${name}`
    const manifest = files.get(`${at}/package.json`)
    if (manifest) {
      const pkg = JSON.parse(manifest)
      /** @param {any} entry @returns {string | undefined} */
      const pick = (entry) => (typeof entry === 'string' ? entry : Array.isArray(entry) ? pick(entry[0]) : entry && (pick(entry[kind]) ?? pick(entry.node) ?? pick(entry.default)))
      const exported = pkg.exports && (typeof pkg.exports === 'string' || Array.isArray(pkg.exports) || !Object.keys(pkg.exports)[0]?.startsWith('.') ? (sub ? undefined : pkg.exports) : pkg.exports[sub ? `./${sub}` : '.'])
      const entry = pick(exported) ?? (sub ? sub : (kind === 'import' && pkg.module) || pkg.main || 'index.js')
      return file(normal(`${at}/${entry}`))
    }
    if (dir === '/') return undefined
  }
}

/** Whether a file is an ES module rather than CommonJS. @param {string} path @param {string} source */
const isModule = (path, source) => path.endsWith('.mjs') || (!path.endsWith('.cjs') && /^\s*(import\s*[\w{*'"]|export\s)/m.test(source))


// ─── JavaScript (QuickJS) ────────────────────────────────────────────────────

// What a script can use, besides plain JavaScript. Every call goes through __call, or __host for
// the computer's files and the internet.
const PRELUDE = `
globalThis.tools = new Proxy({}, { get: (_, name) => (args = {}) => __call(String(name), JSON.stringify(args)) })
globalThis.searchTools = (query) => tools.find_tools({ query })
globalThis.models = {
  decide: async (state, questions) => JSON.parse(await tools.decide({ state, questions })),
  image: async (prompt) => JSON.parse(await tools.image({ prompt })),
}
globalThis.file = (name) => tools.file({ file: name })
globalThis.fs = {
  readFile: (path) => __host('read', String(path)),
  writeFile: async (path, text) => { await __host('write', JSON.stringify([String(path), String(text)])) },
  readdir: async (path = '.') => JSON.parse(await __host('list', String(path))),
  exists: async (path) => (await __host('exists', String(path))) === 'true',
}
globalThis.fetch = async (url, init = {}) => {
  const r = JSON.parse(await __host('fetch', JSON.stringify({ url: String(url), method: init.method, headers: init.headers, body: init.body })))
  const headers = { get: (name) => r.headers[String(name).toLowerCase()] ?? null }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: r.statusText, url: r.url, headers, text: async () => r.body, json: async () => JSON.parse(r.body) }
}
globalThis.csv = (text) => {
  const lines = String(text).replace(/\\r\\n?/g, '\\n').split('\\n').filter((line) => line.trim())
  const head = lines[0] ?? ''
  const separator = [',', ';', '\\t'].map((s) => [s, head.split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  const split = (line) => {
    const cells = []
    let cell = '', quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += c; i++ } else if (c === '"') quoted = false; else cell += c }
      else if (c === '"') quoted = true
      else if (c === separator) { cells.push(cell); cell = '' }
      else cell += c
    }
    cells.push(cell)
    return cells.map((value) => value.trim()).map((value) => (/^-?\\d+(\\.\\d+)?$/.test(value) ? Number(value) : value))
  }
  const names = split(head).map(String)
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((value, i) => [names[i] ?? 'column ' + (i + 1), value])))
}
`
// require(), Node's way, from the computer's files and node_modules (resolved by the worker).
const REQUIRE = `
const __cache = {}
globalThis.__requireFrom = (base) => (spec) => {
  const path = __resolve(base, String(spec))
  if (path === undefined) throw new Error("Cannot find module '" + spec + "': install it with npm install in bash, or name it by its path")
  if (__cache[path]) return __cache[path].exports
  const module = { exports: {} }
  __cache[path] = module
  const source = __source(path)
  if (path.endsWith('.json')) module.exports = JSON.parse(source)
  else new Function('module', 'exports', 'require', '__filename', '__dirname', source)(module, module.exports, __requireFrom(path), path, path.slice(0, path.lastIndexOf('/')))
  return module.exports
}
globalThis.require = __requireFrom(__cwd + '/[eval]')
`
// As a command, Node's way: process, and console to stdout and stderr.
const PROCESS = `
globalThis.process = { argv: JSON.parse(__argv), env: JSON.parse(__env), cwd: () => __cwd, exit: (code = 0) => { throw { __exit: Number(code) } }, platform: 'browser' }
`

/**
 * Runs JavaScript in QuickJS: as the `javascript` tool (its result is the value it returns or ends
 * on, as JSON), or as `node` (what it prints, and its exit code).
 * @param {{ run: number, code: string, cwd: string, tool?: boolean, print?: boolean, argv?: string[], name?: string, env?: Record<string, string>, limits?: Record<string, number> }} options
 * @param {Computer} computer
 */
async function javascript({ run, code, cwd, tool = false, print = false, argv = [], name = '-', env = {}, limits = {} }, computer) {
  const quickjs = await engine(run, 'quickjs')
  const memory = limits.memory ?? 64 * 1024 * 1024
  const cpu = limits.cpu ?? 20_000
  const output = limits.output ?? 6000
  const runtime = quickjs.newRuntime()
  runtime.setMemoryLimit(memory)
  runtime.setMaxStackSize(512 * 1024)
  // Computing time only: waiting for Jean (or for the user's approval) doesn't count.
  let spent = 0
  let started = Date.now()
  runtime.setInterruptHandler(() => spent + Date.now() - started > cpu)
  const step = (/** @type {() => void} */ work) => {
    started = Date.now()
    try {
      work()
    } finally {
      spent += Date.now() - started
    }
  }
  const vm = runtime.newContext()
  /** @type {string[]} */
  const logs = []
  /** @type {string[]} */
  const errors = []
  let logged = 0
  /** @type {Set<any>} */
  const pending = new Set()
  let alive = true
  try {
    /** @param {string} label @param {string[]} into */
    const writer = (label, into) => vm.newFunction(label, (/** @type {any[]} */ ...args) => {
      const line = args.map((handle) => show(vm.dump(handle))).join(' ')
      logged += line.length
      if (!tool || logged < output) into.push(line)
    })
    const console = vm.newObject()
    for (const [label, into] of /** @type {const} */ ([['log', logs], ['info', logs], ['error', tool ? logs : errors], ['warn', tool ? logs : errors]])) {
      const write = writer(label, into)
      vm.setProp(console, label, write)
      write.dispose()
    }
    vm.setProp(vm.global, 'console', console)
    console.dispose()
    /** A function whose promise settles when Jean, or the computer, answers. @param {string} label @param {(...args: string[]) => Promise<any>} work */
    const promised = (label, work) => {
      const handle = vm.newFunction(label, (/** @type {any[]} */ ...args) => {
        const deferred = vm.newPromise()
        pending.add(deferred)
        work(...args.map((arg) => vm.getString(arg))).then((value) => [true, value], (error) => [false, said(error)]).then(([ok, value]) => {
          if (!alive || !pending.delete(deferred)) return
          const answer = ok ? vm.newString(String(value ?? '')) : vm.newError(String(value))
          ok ? deferred.resolve(answer) : deferred.reject(answer)
          answer.dispose()
          step(() => runtime.executePendingJobs())
        })
        return deferred.handle
      })
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    promised('__call', (name, args) => ask(run, { type: 'call', name, args: JSON.parse(args) }))
    promised('__host', (op, arg) => host(computer, cwd, op, arg))
    for (const [label, value] of Object.entries({ __argv: JSON.stringify(['node', name, ...argv]), __env: JSON.stringify(env), __cwd: cwd })) {
      const handle = vm.newString(value)
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    // Modules: the computer's scripts and packages, read now, as require and import are synchronous.
    /** @type {Map<string, string>} */
    const files = new Map()
    for (const path of computer.fs.getAllPaths()) {
      if (/\/node_modules\/.*\.(m?js|cjs|json)$|\.(m?js|cjs)$|\/package\.json$/.test(path)) files.set(path, await computer.fs.readFile(path).catch(() => ''))
    }
    for (const [label, work] of /** @type {const} */ ([['__resolve', (/** @type {string} */ base, /** @type {string} */ spec) => resolve(files, base, spec, 'require')], ['__source', (/** @type {string} */ path) => files.get(path)]])) {
      const handle = vm.newFunction(label, (/** @type {any[]} */ ...args) => {
        const found = work(...args.map((arg) => vm.getString(arg)))
        return found === undefined ? vm.undefined : vm.newString(found)
      })
      vm.setProp(vm.global, label, handle)
      handle.dispose()
    }
    runtime.setModuleLoader((/** @type {string} */ path) => {
      const source = files.get(path) ?? ''
      if (path.endsWith('.json')) return `export default ${source}`
      if (isModule(path, source)) return source
      return `const __m = { exports: {} }\n;(function (module, exports, require, __filename, __dirname) {\n${source}\n})(__m, __m.exports, globalThis.__requireFrom(${JSON.stringify(path)}), ${JSON.stringify(path)}, ${JSON.stringify(dirOf(path))})\nexport default __m.exports`
    }, (/** @type {string} */ base, /** @type {string} */ spec) => resolve(files, base.startsWith('/') ? base : `${cwd}/${base}`, spec, 'import') ?? { error: new Error(`Cannot find module '${spec}'`) })
    vm.unwrapResult(vm.evalCode(PRELUDE + REQUIRE + (tool ? '' : PROCESS), 'prelude.js')).dispose()

    /** Waits for a value in the script's world, a promise or not. @param {any} handle */
    const settle = async (handle) => {
      const settled = vm.resolvePromise(handle)
      handle.dispose()
      step(() => runtime.executePendingJobs())
      const outcome = await settled
      if (outcome.error) {
        const error = vm.dump(outcome.error)
        outcome.error.dispose()
        if (error && typeof error === 'object' && '__exit' in error) return { exit: error.__exit }
        throw new Error(typeof error === 'object' && error ? `${error.name ?? 'Error'}: ${error.message}` : String(error))
      }
      return outcome.value
    }
    // The result is what the script returns or, as in a console, its last expression
    // (small brains write `Math.cos(9)` and expect its value). First as a script with
    // top-level await, which resolves to { value: <last expression> }; a top-level return
    // doesn't parse there, and nothing ran, so then as the body of an async function.
    /** @type {any} */
    let evaluated
    const exited = (/** @type {any} */ value) => ({ ok: true, exit: value.exit, stdout: lines(logs), stderr: lines(errors) })
    // A program with import or export is a module, whose value is nothing.
    if (!tool && isModule(name, code)) {
      step(() => { evaluated = vm.evalCode(code, name.startsWith('/') ? name : `${cwd}/[eval].mjs`, { type: 'module' }) })
      const done = await settle(vm.unwrapResult(evaluated))
      if (!done.dispose) return exited(done)
      done.dispose()
      return { ok: true, result: null, logs, exit: 0, stdout: lines(logs), stderr: lines(errors) }
    }
    step(() => { evaluated = vm.evalCode(code, name, ASYNC_SCRIPT) })
    const asScript = !evaluated.error
    if (!asScript) {
      evaluated.error.dispose()
      step(() => { evaluated = vm.evalCode(`(async () => {\n${code}\n})()`, name) })
    }
    let value = await settle(vm.unwrapResult(evaluated))
    if (!value.dispose) return exited(value)
    if (asScript) {
      const completion = value
      value = await settle(vm.getProp(completion, 'value'))
      completion.dispose()
      if (!value.dispose) return exited(value)
    }
    const result = vm.dump(value)
    value.dispose()
    if (print) logs.push(show(result))
    return { ok: true, result: result === undefined ? null : result, logs, exit: 0, stdout: lines(logs), stderr: lines(errors) }
  } catch (error) {
    const message = /interrupted/i.test(String(error)) ? 'The script used all its computing time and was stopped.'
      : /out of memory/i.test(String(error)) ? 'The script ran out of memory and was stopped.'
      : said(error)
    return { ok: false, error: message, logs, exit: 1, stdout: lines(logs), stderr: lines([...errors, message]) }
  } finally {
    alive = false
    for (const deferred of pending) deferred.dispose()
    try {
      vm.dispose()
      runtime.dispose()
    } catch {
      // A script stopped mid-way can leave QuickJS unusable: ask for a fresh sandbox.
      engines.quickjs = null
      self.postMessage({ type: 'reset' })
    }
  }
}

/** @param {string[]} printed */
const lines = (printed) => (printed.length ? `${printed.join('\n')}\n` : '')

/** @param {unknown} value */
function show(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** What a script asks of the computer: its files, or the internet. @param {Computer} computer @param {string} cwd @param {string} op @param {string} arg */
async function host(computer, cwd, op, arg) {
  const { fs } = computer
  const at = (/** @type {string} */ path) => fs.resolvePath(cwd, path)
  if (op === 'read') return fs.readFile(at(arg))
  if (op === 'list') return JSON.stringify(await fs.readdir(at(arg)))
  if (op === 'exists') return String(await fs.exists(at(arg)))
  if (op === 'write') {
    const [path, content] = JSON.parse(arg)
    const full = at(path)
    await fs.mkdir(full.slice(0, full.lastIndexOf('/')) || '/', { recursive: true })
    return fs.writeFile(full, content)
  }
  const { url, method = 'GET', headers, body } = JSON.parse(arg)
  const response = await bridged(computer, url, { method, headers, body })
  return JSON.stringify({ status: response.status, statusText: response.statusText, url: response.url, headers: Object.fromEntries(response.headers), body: await response.text() })
}

// ─── Python (Pyodide) ────────────────────────────────────────────────────────

// What a script can use, besides Python and its packages. Every call goes through _call.
const PYTHON = `
import json as _json

class _Tools:
    def __getattr__(self, name):
        async def call(**args):
            return await _call(name, _json.dumps(args))
        return call

tools = _Tools()

async def file(name):
    return await tools.file(file=name)

async def search_tools(query):
    return await tools.find_tools(query=query)
`

/**
 * Python, one run at a time: its interpreter, and the files it sees, are shared. The computer the
 * run belongs to answers its requests to the internet; `owner` is the one whose files it holds.
 * @type {{ computer: Computer | null, owner: Computer | null, copied: Map<string, { from: string, to: string }>, turn: Promise<unknown> }}
 */
const interpreter = { computer: null, owner: null, copied: new Map(), turn: Promise.resolve() }
const ROOTS = [WORKSPACE, HOME, '/tmp']

/**
 * Runs Python: as the `python` tool (the value of its last line, as JSON), or as `python3` (what it
 * prints, and its exit code). The computer's files are copied in first, and what it changed back.
 * @param {{ run: number, code: string, cwd: string, tool?: boolean, argv?: string[], name?: string, file?: string, stdin?: string, packages?: string[], limits?: Record<string, number> }} options
 * @param {Computer} computer
 */
function python(options, computer) {
  const work = interpreter.turn.then(() => runPython(options, computer))
  interpreter.turn = work.catch(() => {})
  return work
}

/** @param {Parameters<typeof python>[0]} options @param {Computer} computer */
async function runPython({ run, code, cwd, tool = false, argv = [], name = '<string>', file, stdin = '', packages = [], limits = {} }, computer) {
  const pyodide = await engine(run, 'pyodide')
  interpreter.computer = computer
  const output = limits.output ?? 6000
  /** @type {string[]} */
  const logs = []
  /** @type {string[]} */
  const errors = []
  let logged = 0
  const write = (/** @type {string[]} */ into) => (/** @type {string} */ line) => {
    logged += line.length
    if (!tool || logged < output) into.push(line)
  }
  pyodide.setStdout({ batched: write(logs) })
  pyodide.setStderr({ batched: write(tool ? logs : errors) })
  let input = /** @type {string | null} */ (stdin)
  pyodide.setStdin({ stdin: () => { const given = input; input = null; return given || null } })
  const scope = pyodide.globals.get('dict')()
  try {
    await toPython(pyodide, computer)
    pyodide.FS.mkdirTree(cwd)
    pyodide.FS.chdir(cwd)
    if (packages.length) await pyodide.loadPackage(packages, { messageCallback: () => {}, errorCallback: write(errors) })
    scope.set('_call', (/** @type {string} */ name, /** @type {string} */ args) => ask(run, { type: 'call', name, args: JSON.parse(args) }))
    scope.set('__name__', '__main__')
    if (file) scope.set('__file__', file)
    pyodide.runPython(`import sys\nsys.argv = ${JSON.stringify([name, ...argv])}`)
    await pyodide.runPythonAsync(PYTHON, { globals: scope })
    // The result is the value of the last line, as in a console, as JSON (anything else as text).
    const value = await pyodide.runPythonAsync(code, { globals: scope, filename: name })
    scope.set('_result', value)
    value?.destroy?.()
    const json = tool ? pyodide.runPython('_json.dumps(_result, default=str, ensure_ascii=False)', { globals: scope }) : 'null'
    return { ok: true, result: JSON.parse(json), logs, exit: 0, stdout: lines(logs), stderr: lines(errors) }
  } catch (error) {
    const exited = /SystemExit: ?(\d*)/.exec(String(/** @type {any} */ (error)?.message))
    if (exited && !tool) return { ok: true, exit: Number(exited[1] || 0), stdout: lines(logs), stderr: lines(errors) }
    const message = explain(error)
    return { ok: false, error: message, logs, exit: 1, stdout: lines(logs), stderr: lines([...errors, message]) }
  } finally {
    scope.destroy()
    await fromPython(pyodide, computer).catch(() => {})
    interpreter.computer = null
  }
}

/** Python's files: the computer's, copied in when they changed since, removed when gone. @param {any} pyodide @param {Computer} computer */
async function toPython({ FS }, computer) {
  if (interpreter.owner !== computer) for (const root of ROOTS) wipe(FS, root)
  interpreter.owner = computer
  const { fs } = computer
  const seen = new Set()
  for (const path of await filesOf(fs)) {
    if (!ROOTS.some((root) => path.startsWith(`${root}/`))) continue
    seen.add(path)
    const from = await stampOf(fs, path)
    if (interpreter.copied.get(path)?.from === from) continue
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')))
    FS.writeFile(path, await fs.readFileBuffer(path))
    interpreter.copied.set(path, { from, to: pyStamp(FS, path) })
  }
  for (const path of interpreter.copied.keys()) {
    if (seen.has(path)) continue
    try { FS.unlink(path) } catch {}
    interpreter.copied.delete(path)
  }
}

/** What Python made, changed or took away, back in the computer. @param {any} pyodide @param {Computer} computer */
async function fromPython({ FS }, computer) {
  const { fs } = computer
  const now = new Set()
  for (const path of ROOTS.flatMap((root) => walk(FS, root))) {
    now.add(path)
    const to = pyStamp(FS, path)
    if (interpreter.copied.get(path)?.to === to) continue
    await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true })
    await fs.writeFile(path, FS.readFile(path))
    interpreter.copied.set(path, { from: await stampOf(fs, path), to })
  }
  for (const path of [...interpreter.copied.keys()]) {
    if (now.has(path)) continue
    await fs.rm(path, { force: true })
    interpreter.copied.delete(path)
  }
}

/** @param {any} FS @param {string} path */
const pyStamp = (FS, path) => {
  const { size, mtime } = FS.stat(path)
  return `${size}:${+mtime}`
}

/** Every file under a folder of Python's filesystem, `node_modules` aside. @param {any} FS @param {string} dir @returns {string[]} */
function walk(FS, dir) {
  /** @type {string[]} */
  let names
  try {
    names = FS.readdir(dir)
  } catch {
    return []
  }
  return names.filter((name) => name !== '.' && name !== '..' && name !== 'node_modules').flatMap((name) => {
    const path = `${dir}/${name}`
    return FS.isDir(FS.stat(path).mode) ? walk(FS, path) : [path]
  })
}

/** @param {any} FS @param {string} dir */
function wipe(FS, dir) {
  for (const path of walk(FS, dir)) try { FS.unlink(path) } catch {}
  interpreter.copied.clear()
}

/**
 * A Python error carries its whole traceback: keep where it happened and what happened, and
 * replace Pyodide's advice to install a package by how it is done here.
 * @param {any} error
 */
function explain(error) {
  const lines = String(error?.message ?? error).trim().split('\n')
  const frame = lines.findLastIndex((line) => /^\s*File "/.test(line))
  const what = lines.slice(frame + 1).filter((line) => !/^\s/.test(line))
  const advice = what.findIndex((line) => /^You can install it/.test(line))
  if (advice >= 0) what.splice(advice, what.length, 'Install it first: pip install <package> in bash, or `import micropip` then `await micropip.install("<package>")`.')
  return [lines[frame]?.trim(), ...what].filter(Boolean).join('\n')
}
