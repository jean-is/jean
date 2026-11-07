// Globals that exist only inside QuickJS, never in the worker itself: the prelude
// (computer-worker.js) defines them before nodeModules' source runs there. They are
// declared here only so nodeModules, which the worker serialises and never calls,
// type-checks. Keep the list to what nodeModules uses.
//
// feross's types are named by their file, so that Node's own 'buffer' can never stand in for them.

/** feross's Buffer, which buffer.js sets (scripts/vendor.js). */
declare var Buffer: typeof import('buffer/index.js').Buffer

/** buffer.js's module.exports, for require('buffer'). */
declare var __buffer: typeof import('buffer/index.js')

/** What PROCESS sets when a script runs as a command; a run of the `javascript` tool has none. */
declare var process: {
  argv: string[]
  env: Record<string, string>
  cwd(): string
  exit(code?: number): never
  platform: string
  version: string
  versions: { node: string }
  release: { name: string }
  nextTick(fn: (...args: unknown[]) => void, ...args: unknown[]): void
} | undefined
