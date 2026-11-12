// SPDX-License-Identifier: MIT
// What tsconfig.workers.json resolves `sharp` to: nothing. Transformers.js names it in its types for a method Jean never
// calls, and sharp's own types bring Node's globals (Buffer, process) into every worker, where they don't exist.
export {}
