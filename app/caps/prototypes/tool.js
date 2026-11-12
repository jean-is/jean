// SPDX-License-Identifier: MIT
// What the brain is given for Prototypes (D742): two tools, each with its line, which prototypes.js runs; a file and a look as a site's
// are given (../sites/tool.js). Pure.
import { SITE } from '../sites/tool.js'

export const LINES = [{ name: 'prototype', line: 'make a clickable prototype of an app or a flow, a few pages; each call presses through it and says what to fix' },
  { name: 'prototype_change', line: 'change a prototype by exact passages; it is checked again' }]

const { files: FILES, look: LOOK } = /** @type {any} */ (SITE.parameters).properties
const FILE = { ...FILES.items, properties: { ...FILES.items.properties, path: { type: 'string', description: 'Its path in the prototype: index.html, time.html, style.css, prototype.js' } } }

/** @type {import('../../core/types.js').ToolSpec} */
export const PROTOTYPE = {
  name: 'prototype',
  description: 'Make a clickable prototype of an app or a flow, a page per screen, or replace one whole. Read the skill prototype first. Give every file: each screen as HTML, index.html first, one style.css, a prototype.js only if needed; and its shape. Each call presses every control from index.html on and checks every page at 320 and 1280 pixels, then says what to fix: fix it and call again.',
  parameters: { type: 'object', properties: { name: { type: 'string', description: "The prototype's name, in the user's language" }, prototype: { type: 'string', description: "A prototype's place, to replace it whole" },
    files: { type: 'array', items: FILE }, look: LOOK,
    shape: { type: 'string', enum: ['phone', 'computer'], description: 'What it is made for: phone, an app in a column, or computer, a dashboard or a wide form. Its pictures and Try it open in that shape.' } }, required: ['name', 'files'] },
}

/** @type {import('../../core/types.js').ToolSpec} */
export const CHANGE = {
  name: 'prototype_change',
  description: 'Change a prototype by exact passages of its files, each found once; add or replace whole files with files, take some away with remove. It is checked again and said, as prototype does.',
  parameters: { type: 'object', properties: { prototype: { type: 'string', description: 'Its place, as prototype gave it' },
    changes: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
    files: { type: 'array', items: FILE }, remove: { type: 'array', items: { type: 'string' } }, look: LOOK }, required: ['prototype'] },
}
