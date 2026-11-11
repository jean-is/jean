// Prototypes (D742): clickable mockups of an app or a flow, a page per screen, the brain makes with its skill "Make a prototype". Each is a
// folder of the project, `prototypes/<ulid>-<slug>`, a kind of folder as a site is (../sites/kind.js): made or replaced whole by `prototype`
// and changed by exact passages with `prototype_change`, dressed in its look (D739), checked from its files (./check.js), pressed through
// from its first page and seen at a phone's and a computer's width (./press.js, ../sites/frame.js), and said to the brain before it is shown.
// Beside the task its pages lie side by side on a board and run in Try it (./board.js); its words are retyped in place and its parts pointed
// at (D741), and what the brain changes after the turn that made it waits for the person to accept or reject (D505). Only with a brain that
// isn't the device's or a local server's, as Tables' (D491). Found by its skill, which brings it (D401).
import { html, svg } from 'lit-html'
import { effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { icon } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { isLocal } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'
import { folderKind } from '../sites/kind.js'
import { shown } from '../sites/frame.js'
import { LOOK, cssOf } from '../sites/look.js'
import { unescape } from '../sites/html.js'
import { checkScreens, told } from './check.js'
import { pressed } from './press.js'
import { LINES, PROTOTYPE, CHANGE } from './tool.js'
import './board.js'

await Promise.all([useStrings('sites'), useStrings('prototypes'), styleSheet(new URL('../sites/sites.css', import.meta.url)), styleSheet(new URL('prototypes.css', import.meta.url))])

/**
 * A prototype checked: from its files, pressed through from its first page, and as its pages show, by day and by night alike, whichever
 * the device prefers. @param {import('../sites/kind.js').One} one @param {import('../sites/look.js').Look | null} look @param {string[]} said @param {AbortSignal} [signal]
 */
async function check(one, look, said, signal) {
  const report = checkScreens(one.files), as = (/** @type {'day' | 'night'} */ when) => look && new Map(one.files).set(LOOK, new TextEncoder().encode(cssOf({ ...look, day: look[when], night: look[when] })))
  const press = await pressed(as('day') || one.files, report.pages, signal)
  report.problems = [...new Set([...report.problems, ...said, ...press.problems, ...await shown(as('day') || one.files, report.pages, signal, as('night') || undefined)])]
  return { ...report, ...(press.flow && { flow: press.flow }) }
}

const kind = folderKind({ id: 'prototypes', folder: 'prototypes', record: 'prototype.json', noun: 'prototype', words: 'prototypes', element: 'app-prototype', skill: 'prototype', at: 2.9,
  /** Pages side by side, the first leading to the next. */
  glyph: icon(svg`<path d="M3 5h6v14H3zM15 5h6v14h-6zM9 12h6M13 10l2 2-2 2"/>`),
  specs: { make: PROTOTYPE, change: CHANGE }, for: (brain) => !isLocal(brain), check, told: (report, at) => told(/** @type {any} */ (report), at),
  text: (files) => unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(new TextDecoder().decode(files.get('index.html') ?? new Uint8Array()))?.[1].trim() ?? ''),
  view: (shown, one) => html`<app-prototype class="beside" .prototype=${{ ...shown, label: t('prototypes.frame', { name: shown.name }), flow: one.record.check?.flow }}></app-prototype>` })
export const { metaOf, bytesOf, editor } = kind

effect(() => register({ id: 'prototypes', tools: kind.tools, lines: LINES, slots: { ...kind.joined.value, modes: { at: 14, draw: () => null, notes: kind.notes },
  out: { at: 2, draw: () => null, of: (/** @type {{ uri: string }} */ { uri }) => /^prototypes\//.test(uri), load: async () => ({ ways: (/** @type {{ uri: string }} */ file) => ({ files: kind.zip(file) }) }) } } }))
