// The bubble over a selection in a document (D485), as in Notion: bold, italic, strikethrough and a link for the text
// selected. It shows once the selection is made (the mouse let go, Shift+arrows, a phone's handles),
// above it, or below it on a touch screen, where the system's own menu sits above. From the keyboard,
// Alt+F10 (the editors' convention) or Tab reaches it, the arrows move along it in the direction the
// page reads, and Escape gives the document its focus and selection back, or hides the bubble from
// the document. ⌘K opens its link box. It is a toolbar whose buttons say whether they are on: on when
// all the selected text has the mark, which a press then takes off; otherwise a press puts it on all.
import { Plugin, PluginKey, TextSelection } from '#prosemirror'
import { el, icon, float } from './ui.js'

/** @typedef {import('prosemirror-state').EditorState} EditorState */
/** @typedef {import('prosemirror-view').EditorView} EditorView */
/** @typedef {import('prosemirror-model').MarkType} MarkType */
/** A mark the bubble puts on and takes off. @typedef {{ key: string, glyph: string, type: MarkType, keys: string }} Format */

export const bubbleKey = /** @type {PluginKey<{ dismissed: boolean }>} */ (new PluginKey('bubble'))

/** Text selected, outside what takes no marks (code, the title), that the bubble acts on. @param {EditorState} state */
function selectedText(state) {
  const { selection } = state
  if (selection.empty || !(selection instanceof TextSelection) || selection.$from.parent.type.spec.marks === '') return false
  return /\S/.test(state.doc.textBetween(selection.from, selection.to, ' ', ' '))
}

/** How much of the selected text has the mark: 'all', 'some' or 'none'. @param {EditorState} state @param {MarkType} type */
function coverage(state, type) {
  let all = true
  let some = false
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (!node.isText) return true
    if (type.isInSet(node.marks)) some = true
    else all = false
    return false
  })
  return some && all ? 'all' : some ? 'some' : 'none'
}

/**
 * @param {{ formats: Format[], link: MarkType, href: (typed: string) => string | null, label: (key: string) => string, mac: boolean, tabbable: (state: EditorState) => boolean }} options
 * `href` makes a typed address a link's (null when it can't be one); `tabbable` says where Tab may go to the bubble rather than indent.
 */
export function bubble({ formats, link, href, label, mac, tabbable }) {
  /** What the view gives the keys: whether the bubble shows, and how to go into it. */
  const ui = { shown: false, enter: () => {}, linkBox: () => {} }

  return new Plugin({
    key: bubbleKey,
    state: {
      init: () => ({ dismissed: false }),
      apply(tr, value) {
        const meta = tr.getMeta(bubbleKey)
        if (meta) return { dismissed: Boolean(meta.dismiss) }
        return tr.selectionSet || tr.docChanged ? { dismissed: false } : value
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (event.isComposing) return false
        const mod = mac ? event.metaKey : event.ctrlKey
        if (event.altKey && event.key === 'F10' && ui.shown) return ui.enter(), true
        if (event.key === 'Tab' && !event.shiftKey && !mod && !event.altKey && ui.shown && tabbable(view.state)) return ui.enter(), true
        if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k' && selectedText(view.state)) {
          view.dispatch(view.state.tr.setMeta(bubbleKey, { dismiss: false }))
          ui.linkBox()
          return true
        }
        if (event.key === 'Escape' && ui.shown) {
          view.dispatch(view.state.tr.setMeta(bubbleKey, { dismiss: true }))
          return true
        }
        return false
      },
    },
    view(editor) {
      const tools = formats.map((format) => {
        const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: `bubble-tool bubble-${format.key}`, 'aria-keyshortcuts': `${mac ? 'Meta' : 'Control'}+${format.keys}` }, el('span', { 'aria-hidden': 'true' }, format.glyph)))
        button.addEventListener('click', () => {
          const { from, to } = editor.state.selection
          editor.dispatch(coverage(editor.state, format.type) === 'all' ? editor.state.tr.removeMark(from, to, format.type) : editor.state.tr.addMark(from, to, format.type.create()))
        })
        return { format, button }
      })
      const linkButton = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'bubble-tool bubble-link', 'aria-keyshortcuts': `${mac ? 'Meta' : 'Control'}+K` }, icon('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2')))
      const buttons = [...tools.map(({ button }) => button), linkButton]
      const address = /** @type {HTMLInputElement} */ (el('input', { type: 'url', class: 'bubble-address', dir: 'ltr', autocomplete: 'off', spellcheck: 'false' }))
      const apply = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'bubble-apply' }, el('span', { 'aria-hidden': 'true' }, '↵')))
      const unlink = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'bubble-unlink' }, el('span', { 'aria-hidden': 'true' }, '⌫')))
      const box = el('div', { class: 'bubble-box', hidden: '' }, address, apply, unlink)
      const bar = el('div', { role: 'toolbar', class: 'bubble', hidden: '', 'aria-keyshortcuts': 'Alt+F10' }, ...buttons, box)
      document.body.append(bar)

      // A press on the bubble leaves the focus and the selection in the document: on mousedown, which a
      // tap makes too, as WebKit makes no click at all from a tap whose pointerdown was cancelled.
      bar.addEventListener('mousedown', (event) => { if (event.target !== address) event.preventDefault() })

      let pointer = false
      /** Where the arrows are along the bubble: one stop in the order of focus, as a toolbar has. */
      let roving = 0
      const focusAt = (/** @type {number} */ i) => {
        roving = (i + buttons.length) % buttons.length
        buttons.forEach((button, k) => { button.tabIndex = k === roving ? 0 : -1 })
        buttons[roving].focus()
      }
      ui.enter = () => focusAt(roving)

      const linking = () => !box.hidden
      const closeBox = (/** @type {boolean} */ back) => {
        box.hidden = true
        bar.classList.remove('linking')
        address.removeAttribute('aria-invalid')
        if (back) linkButton.focus()
      }
      ui.linkBox = () => {
        const { from, to } = editor.state.selection
        let current = ''
        editor.state.doc.nodesBetween(from, to, (node) => { current ||= link.isInSet(node.marks)?.attrs.href ?? ''; return !current })
        address.value = current
        unlink.hidden = !current
        box.hidden = false
        bar.classList.add('linking')
        draw()
        address.focus()
        address.select()
      }
      /** The selected text's link, to this address or none, and the keyboard back in the document. @param {string | null} target */
      const relink = (target) => {
        const { from, to } = editor.state.selection
        const tr = editor.state.tr.removeMark(from, to, link)
        editor.dispatch(target ? tr.addMark(from, to, link.create({ href: target })) : tr)
        closeBox(false)
        editor.focus()
      }
      const setLink = () => (href(address.value) ? relink(href(address.value)) : address.setAttribute('aria-invalid', 'true'))
      linkButton.addEventListener('click', () => (linking() ? closeBox(true) : ui.linkBox()))
      apply.addEventListener('click', setLink)
      unlink.addEventListener('click', () => relink(null))

      bar.addEventListener('keydown', (event) => {
        if (event.isComposing) return
        if (event.target === address) {
          if (event.key !== 'Enter' && event.key !== 'Escape') return
          event.preventDefault()
          return event.key === 'Enter' ? setLink() : closeBox(true)
        }
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
        if (step !== undefined) focusAt(roving + (getComputedStyle(bar).direction === 'rtl' ? -step : step))
        else if (event.key === 'Home' || event.key === 'End') focusAt(event.key === 'Home' ? 0 : buttons.length - 1)
        else if (event.key === 'Escape') {
          if (linking()) closeBox(true)
          else editor.focus()
        } else {
          const mod = mac ? event.metaKey : event.ctrlKey
          const format = mod && tools.find(({ format: f }) => f.keys.toLowerCase() === `${event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`)
          if (!format) return
          format.button.click()
        }
        event.preventDefault()
      })

      const place = () => {
        const [a, b] = [editor.coordsAtPos(editor.state.selection.from), editor.coordsAtPos(editor.state.selection.to)]
        const [left, right] = a.top === b.top ? [a.left, b.right] : [Math.min(a.left, b.left), Math.max(a.right, b.right)]
        // On a touch screen, below the selection: the system's menu takes the space above it.
        const touch = matchMedia('(pointer: coarse)').matches
        float(bar, { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left, right }, { over: !touch, centred: true, gap: touch ? 16 : 8 })
      }

      const draw = () => {
        const state = editor.state
        const focused = editor.hasFocus() || bar.contains(document.activeElement)
        const show = selectedText(state) && !pointer && focused && !bubbleKey.getState(state)?.dismissed
        ui.shown = show
        if (!show) {
          if (!bar.hidden) {
            bar.hidden = true
            closeBox(false)
          }
          return
        }
        bar.setAttribute('aria-label', label('format'))
        for (const { format, button } of tools) {
          button.setAttribute('aria-label', label(format.key))
          button.setAttribute('aria-pressed', String(coverage(state, format.type) === 'all'))
        }
        linkButton.setAttribute('aria-label', label('link'))
        linkButton.setAttribute('aria-pressed', String(coverage(state, link) !== 'none'))
        address.setAttribute('aria-label', label('linkAddress'))
        address.placeholder = label('linkAddress')
        apply.setAttribute('aria-label', label('applyLink'))
        unlink.setAttribute('aria-label', label('removeLink'))
        if (bar.hidden) buttons.forEach((button, k) => { button.tabIndex = k === roving ? 0 : -1 })
        bar.hidden = false
        place()
      }

      // While the mouse drags a selection, nothing shows: the bubble comes when it is let go.
      const down = () => { pointer = true; draw() }
      const up = () => { if (pointer) { pointer = false; draw() } }
      const later = () => setTimeout(draw, 0)
      const replace = () => { if (!bar.hidden) place() }
      const off = new AbortController()
      const on = { signal: off.signal }
      editor.dom.addEventListener('mousedown', down, on)
      document.addEventListener('mouseup', up, on)
      document.addEventListener('focusin', later, on)
      document.addEventListener('focusout', later, on)
      addEventListener('scroll', replace, { ...on, capture: true })
      addEventListener('resize', replace, on)
      draw()
      return { update: draw, destroy: () => (off.abort(), bar.remove()) }
    },
  })
}
