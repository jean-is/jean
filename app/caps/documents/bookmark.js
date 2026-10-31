// A web bookmark: a line that is only a web link shows as a card, its title over its site. "/"'s Web
// bookmark asks for an address on a line of its own; pasted, or typed then Enter, the line becomes that link,
// titled once from the page when its site lets other sites read it, never as the document opens.
import { Plugin, PluginKey, Decoration, DecorationSet } from '#prosemirror'
import { schema } from './markdown.js'
import { el } from './ui.js'

/** Where the line asking for an address starts, while it asks. */
export const askKey = /** @type {PluginKey<number | null>} */ (new PluginKey('bookmark'))

/** A top-level line that is only a web link: its address. @param {import('prosemirror-model').Node} node */
function webLink(node) {
  const link = node.type === schema.nodes.paragraph && node.childCount === 1 && node.child(0).marks.find((mark) => mark.type === schema.marks.link)
  return link && /^https?:\/\//i.test(link.attrs.href) ? String(link.attrs.href) : null
}

/** @param {{ href: (typed: string) => string | null, label: (key: string) => string, announce: (text: string) => void }} options */
export function bookmarks({ href, label, announce }) {
  /** The asking line made the link of a web address typed or pasted, then titled; false for anything else. @param {import('prosemirror-view').EditorView} view @param {string} typed */
  function take(view, typed) {
    const [at, url] = [askKey.getState(view.state) ?? null, href(typed)]
    if (at === null || !url || !/^https?:/i.test(url)) return false
    view.dispatch(view.state.tr.replaceWith(at + 1, at + 1 + (view.state.doc.nodeAt(at)?.content.size ?? 0), schema.text(url, [schema.marks.link.create({ href: url })])).setMeta(askKey, null))
    import('../browser/pages.js').then(({ pageTitle }) => pageTitle(url)).then((title) => {
      const tr = view.state.tr
      if (title && !view.isDestroyed) view.state.doc.forEach((node, pos) => { if (webLink(node) === url && node.textContent === url) tr.replaceWith(tr.mapping.map(pos + 1), tr.mapping.map(pos + node.nodeSize - 1), schema.text(title, node.child(0).marks)) })
      if (tr.docChanged) view.dispatch(tr)
    })
    return true
  }

  return new Plugin({
    key: askKey,
    state: {
      init: () => null,
      // It asks while the caret stays on its line.
      apply(tr, at, _old, { selection: { $from } }) {
        const meta = tr.getMeta(askKey)
        if (meta !== undefined) return meta
        return at !== null && $from.depth === 1 && $from.before() === tr.mapping.map(at) ? $from.before() : null
      },
    },
    props: {
      decorations(state) {
        /** @type {Decoration[]} */
        const list = []
        state.doc.forEach((node, pos) => {
          if (pos === askKey.getState(state)) list.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-asking', 'data-ask': label('bookmarkAddress') }))
          const url = webLink(node)
          if (url) list.push(Decoration.node(pos, pos + node.nodeSize, { class: 'bookmark' }), Decoration.widget(pos + node.nodeSize - 1, () => el('span', { class: 'bookmark-site', contenteditable: 'false' }, new URL(url).host), { side: 1, key: url, ignoreSelection: true }))
        })
        return DecorationSet.create(state.doc, list)
      },
      handleKeyDown(view, event) {
        const at = askKey.getState(view.state) ?? null
        if (at === null || event.isComposing || !['Enter', 'Escape'].includes(event.key)) return false
        if (event.key === 'Enter' && take(view, view.state.doc.nodeAt(at)?.textContent ?? '')) return true
        // Anything else is a line of text again, Enter going on as it does there.
        view.dispatch(view.state.tr.setMeta(askKey, null))
        return event.key === 'Escape'
      },
      handlePaste(view, event) {
        const at = askKey.getState(view.state) ?? null
        return at !== null && !view.state.doc.nodeAt(at)?.content.size && take(view, event.clipboardData?.getData('text/plain') ?? '')
      },
    },
    view: () => ({ update(view, before) { if (askKey.getState(before) === null && askKey.getState(view.state) !== null) announce(label('bookmarkAddress')) } }),
  })
}
