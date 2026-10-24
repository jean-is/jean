// A document's "/" menu (D485), as in Notion: "/" typed at the start of a line opens what the line can become.
// What follows the slash narrows it, by the name in Jean's language or in English; the arrows and
// Enter or Tab choose, as does a click or a tap, and Escape closes it, leaving the slash as text.
// "／", which a Japanese keyboard types, opens it too. Only what the line can become is offered, as it is when it opens,
// a collection (D510) once something follows the slash. "[[" anywhere in a line opens another of its kind (D575): the
// project's creations, one picked referred to there.
// The list is a listbox the document points at (aria-activedescendant), and the choice is said
// aloud as it changes, which VoiceOver needs in an editable element.
import { Plugin, PluginKey } from '#prosemirror'
import { el, float } from './ui.js'

/** @typedef {import('prosemirror-state').EditorState} EditorState */
/** @typedef {import('prosemirror-state').Command} Command */
/** @typedef {import('prosemirror-view').EditorView} EditorView */
/** One thing a line can become, `name` or its key's words. @typedef {{ key: string, name?: string, typed?: boolean, glyph: string, words: string, run: Command }} Item */
/** @typedef {{ open: boolean, from: number, query: string, index: number }} State */

export const slashKey = /** @type {PluginKey<State>} */ (new PluginKey('slash'))
const CLOSED = /** @type {State} */ ({ open: false, from: 0, query: '', index: 0 })
const TRIGGER = /^[/／]([^\n]{0,32})$/

/** What opens it and what follows, before the caret, in a paragraph or a heading. @param {EditorState} state @param {RegExp} trigger */
function typed(state, trigger) {
  const { $from, empty } = state.selection
  if (!empty || !['paragraph', 'heading'].includes($from.parent.type.name)) return null
  const match = trigger.exec($from.parent.textBetween(0, $from.parentOffset, undefined, '￼'))
  return match ? { from: $from.start() + match.index, query: match[1] } : null
}

/**
 * A menu, the slash's unless `key`, `trigger` (the slash at a line's start), `id` and `name` (its list's) say otherwise.
 * @param {{ items: () => Item[], label: (key: string, values?: Record<string, string | number>) => string, announce: (text: string) => void,
 *   key?: PluginKey<State>, trigger?: RegExp, id?: string, name?: () => string }} options
 */
export function slashMenu({ items, label, announce, key = slashKey, trigger = TRIGGER, id = 'slash', name = () => label('blocks') }) {
  /** @param {Item} item */
  const nameOf = (item) => item.name ?? label(item.key)
  /** What the menu offers now: what the line can become, whose name or words hold what was typed. @param {EditorState} state */
  const offered = (state) => {
    const { query } = /** @type {State} */ (key.getState(state))
    const wanted = query.trim().toLocaleLowerCase()
    return items().filter((item) => item.run(state) && (wanted ? `${nameOf(item)} ${item.words}`.toLocaleLowerCase().includes(wanted) : !item.typed))
  }

  /** @param {EditorView} view @param {Item} item */
  const choose = (view, item) => {
    const { from } = /** @type {State} */ (key.getState(view.state))
    view.dispatch(view.state.tr.delete(from, view.state.selection.from).setMeta(key, { close: true }))
    item.run(view.state, view.dispatch, view)
    view.focus()
  }

  return new Plugin({
    key,
    state: {
      init: () => CLOSED,
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(key)
        const now = typed(state, trigger)
        if (meta?.close || !now) return CLOSED
        // It opens on the slash just typed, never on one the caret comes back to.
        if (!value.open) return tr.docChanged && now.query === '' ? { open: true, from: now.from, query: '', index: 0 } : CLOSED
        if (now.from !== tr.mapping.map(value.from)) return CLOSED
        return { open: true, from: now.from, query: now.query, index: meta?.index ?? (now.query === value.query ? value.index : 0) }
      },
    },
    props: {
      handleKeyDown(view, event) {
        const value = key.getState(view.state)
        if (!value?.open || event.isComposing) return false
        const list = offered(view.state)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (list.length) view.dispatch(view.state.tr.setMeta(key, { index: (value.index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length }))
          return true
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && list.length) {
          choose(view, list[value.index])
          return true
        }
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(key, { close: true }))
          return true
        }
        return false
      },
      attributes(state) {
        const value = key.getState(state)
        return value?.open ? { 'aria-controls': `${id}-menu`, 'aria-autocomplete': 'list', ...(offered(state).length ? { 'aria-activedescendant': `${id}-${value.index}` } : {}) } : {}
      },
    },
    view(editor) {
      const menu = el('div', { id: `${id}-menu`, class: 'slash', role: 'listbox', hidden: '' })
      // A click or a tap on the list leaves the caret where it is.
      menu.addEventListener('mousedown', (event) => event.preventDefault())
      document.body.append(menu)
      let said = ''
      /** @param {EditorView} view */
      const place = (view) => {
        // Under the slash, where its line starts, or over it when there is more room there.
        const at = view.coordsAtPos(/** @type {State} */ (key.getState(view.state)).from)
        menu.style.maxBlockSize = `${Math.min(340, Math.max(innerHeight - at.bottom, at.top) - 14)}px`
        float(menu, at)
      }
      /** @param {EditorView} view */
      const draw = (view) => {
        const value = key.getState(view.state)
        if (!value?.open) {
          menu.hidden = true
          said = ''
          return
        }
        const list = offered(view.state)
        menu.setAttribute('aria-label', name())
        menu.replaceChildren(...list.map((item, i) => {
          const option = el('div', { id: `${id}-${i}`, class: 'slash-option', role: 'option', 'aria-selected': String(i === value.index) }, el('span', { class: 'slash-glyph', 'aria-hidden': 'true' }, item.glyph), el('span', {}, nameOf(item)))
          option.addEventListener('click', () => choose(view, item))
          return option
        }))
        if (!list.length) menu.append(el('div', { class: 'slash-none' }, label('noMatch')))
        menu.hidden = false
        place(view)
        menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
        const now = list[value.index] ? label('choice', { item: nameOf(list[value.index]), i: value.index + 1, n: list.length }) : label('noMatch')
        if (now !== said) announce(now)
        said = now
      }
      const replace = () => { if (!menu.hidden) place(editor) }
      const off = new AbortController()
      addEventListener('scroll', replace, { signal: off.signal, capture: true })
      addEventListener('resize', replace, { signal: off.signal })
      draw(editor)
      return { update: draw, destroy: () => (off.abort(), menu.remove()) }
    },
  })
}
