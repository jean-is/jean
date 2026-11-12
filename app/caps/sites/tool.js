// SPDX-License-Identifier: MIT
// What the brain is given for Sites (D720): two tools, each with its line, which sites.js runs. Pure.
import { FACES } from './look.js'

export const LINES = [{ name: 'site', line: 'make a website of a few pages, or replace one whole; each call checks it and says what to fix' },
  { name: 'site_change', line: 'change a site by exact passages; it is checked again' }]

const FILE = { type: 'object', properties: {
  path: { type: 'string', description: 'Its path in the site: index.html, style.css, fr/index.html, photos/dunes.jpg' },
  text: { type: 'string', description: 'The whole file, for a page, a style sheet, a script or a drawing' },
  from: { type: 'string', description: 'For a picture or another file: the name of a file of the task, one the user shared or you made' } }, required: ['path'] }

/** The site's colours and type (D739), which sites.js writes into look.css (./look.js). */
const LOOK = { type: 'object', description: "Colours and type, written into look.css, readable by day and night: the user's when they give or ask for some, else an accent for the subject",
  properties: { accent: { type: 'string', description: '#rrggbb' }, paper: { type: 'string', description: '#rrggbb, pale' }, ink: { type: 'string', description: '#rrggbb' }, second: { type: 'string', description: '#rrggbb, a second accent' },
    type: { type: 'string', enum: Object.keys(FACES) } }, required: ['accent'] }

/** @type {import('../../core/types.js').ToolSpec} */
export const SITE = {
  name: 'site',
  description: 'Make a website of a few pages, or replace a site whole. Read the skill site first. Give every file: the pages as HTML, one style.css, a site.js only if needed, pictures from the task\'s files, shared or made. Each call checks every page at 320 and 1280 pixels, for screen readers and for search engines, and says what to fix: fix it and call again.',
  parameters: { type: 'object', properties: { name: { type: 'string', description: "The site's name, in the user's language" }, site: { type: 'string', description: "A site's place, to replace it whole" },
    files: { type: 'array', items: FILE }, look: LOOK }, required: ['name', 'files'] },
}

/** @type {import('../../core/types.js').ToolSpec} */
export const CHANGE = {
  name: 'site_change',
  description: 'Change a site by exact passages of its files, each found once; add or replace whole files with files, take some away with remove. It is checked again and said, as site does.',
  parameters: { type: 'object', properties: { site: { type: 'string', description: 'Its place, as site gave it' },
    changes: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
    files: { type: 'array', items: FILE }, remove: { type: 'array', items: { type: 'string' } }, look: LOOK }, required: ['site'] },
}
