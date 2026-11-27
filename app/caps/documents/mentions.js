// SPDX-License-Identifier: MIT
// Who a line is for, and a day, in a document. "@" after a space or at a line's start offers the assistant, the person themself and the people Jean knows (the
// `names` slot: People's people met, Together's members of the document's circle), each put in as `@[their name]`, then today, tomorrow and a day to pick, put
// in as YYYY-MM-DD (./markdown.js reads both back). A day is drawn as the language writes it; a press on it, or Enter on it selected, opens a field over it that
// changes it as it changes, Enter, Escape or leaving it closing it. The assistant's name holds a button that asks it, in the box, to do what its line says and
// tick it once done, so that a list of tasks gives some to the assistant and some to people.
import { PluginKey, NodeSelection, TextSelection } from '#prosemirror'
import { intlLocales } from '../../core/i18n.js'
import { app, assistantName, effective } from '../../ui/state.js'
import { slots } from '../../ui/caps.js'
import { slashMenu } from './slash.js'
import { schema } from './markdown.js'
import { el, pop, float } from './ui.js'

/** @import { EditorView } from '#prosemirror' */
/** @typedef {import('prosemirror-state').Command} Command */
/** @typedef {(key: string, values?: Record<string, string | number>) => string} Label */

const { nodes: N } = schema
/** A day from today on the device's calendar, as a date cell holds it. @param {number} ahead */
const dayFrom = (ahead) => ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(((now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead))(new Date()))

/**
 * "@"'s menu and how its nodes are drawn, for the document at `path` named `name()`.
 * @param {{ label: Label, announce: (text: string) => void, path?: string, name: () => string }} given
 */
export function mentions({ label, announce, path = '', name }) {
  /** The field over the day at `pos`, the keyboard in it. @param {EditorView} view @param {number} pos */
  const pick = (view, pos) => {
    const node = view.state.doc.nodeAt(pos)
    if (node?.type !== N.day) return
    const field = /** @type {HTMLInputElement} */ (el('input', { type: 'date', class: 'day-field', value: node.attrs.value, title: label('date') })), box = el('div', { class: 'day-box' }, field)
    let open = true
    const done = () => {
      if (!open) return
      open = false
      pop(box, view.dom, false)
      box.remove()
      view.focus()
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(pos + 1, view.state.doc.content.size))))
    }
    field.addEventListener('change', () => { if (field.value && view.state.doc.nodeAt(pos)?.type === N.day) view.dispatch(view.state.tr.setNodeMarkup(pos, null, { value: field.value })) })
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') e.preventDefault(), e.stopPropagation(), done() })
    field.addEventListener('blur', done)
    box.setAttribute('popover', 'manual')
    pop(box, view.dom, true)
    float(box, view.coordsAtPos(pos))
    field.focus()
  }
  /** A node put where the caret is, a space after it, then `then` given where it went. @param {() => import('#prosemirror').Node} make @param {(view: EditorView, pos: number) => void} [then] @returns {Command} */
  const put = (make, then) => (state, dispatch, view) => {
    if (!dispatch) return true
    const tr = state.tr.replaceSelectionWith(make()).insertText(' ')
    dispatch(tr.scrollIntoView())
    // Once the menu has given the keyboard back to the document.
    if (view && then) requestAnimationFrame(() => then(view, tr.selection.from - 2))
    return true
  }
  const people = () => [...new Set([assistantName(), ...slots('names').map((part) => part.me?.(path)), effective.value.settings.name, ...slots('names').flatMap((part) => part.of?.(path) ?? [])].filter(Boolean))]
  const plugin = slashMenu({ key: new PluginKey('mentions'), trigger: /(?<=^|[\s(（])[@＠]((?:[^\s@＠[\]]+ ?){0,3})$/u, id: 'mentions', label, announce, name: () => label('mentions'), items: () => [
    ...people().map((one, i) => ({ key: `@${one}`, name: one, glyph: i ? one.slice(0, 1).toLocaleUpperCase() : '✦', words: '', run: put(() => N.mention.create({ name: one })) })),
    ...(/** @type {const} */ ([['today', 0], ['tomorrow', 1], ['date', 0]])).map(([key, ahead]) => ({ key, glyph: '◷', words: key, run: put(() => N.day.create({ value: dayFrom(ahead) }), key === 'date' ? pick : undefined) })),
  ] })
  /** Enter on a day selected opens its field. @type {Command} */
  const change = ({ selection }, _dispatch, view) => selection instanceof NodeSelection && selection.node.type === N.day && Boolean(view && (pick(view, selection.from), true))
  /** @type {Record<string, import('prosemirror-view').NodeViewConstructor>} */
  const views = {
    day: (node, view, getPos) => {
      const dom = el('time', { class: 'day' })
      const show = (/** @type {string} */ value) => { dom.setAttribute('datetime', value); dom.textContent = new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium' }).format(new Date(`${value}T00:00`)) }
      show(node.attrs.value)
      dom.addEventListener('click', () => { const at = getPos(); if (at !== undefined) pick(view, at) })
      return { dom, update: (next) => next.type === N.day && (show(next.attrs.value), true), ignoreMutation: () => true }
    },
    mention: (node, view, getPos) => {
      const mine = node.attrs.name === assistantName(), dom = el('span', { class: mine ? 'mention is-assistant' : 'mention', dir: 'auto' }, `@${node.attrs.name}`)
      const ask = mine ? el('button', { type: 'button', class: 'mention-ask', 'aria-label': label('doIt') }, '▸') : null
      ask?.addEventListener('click', () => {
        const at = getPos(), line = at === undefined ? '' : view.state.doc.resolve(at).parent.textContent.replace(`@${node.attrs.name}`, '').replace(/\s+/g, ' ').trim()
        app.draft.value = label('asked', { document: name(), task: line })
        requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.getElementById('prompt'))?.focus())
      })
      if (ask) dom.append(ask)
      return { dom, stopEvent: (event) => event.target === ask, ignoreMutation: () => true }
    },
  }
  return { plugin, views, change }
}
