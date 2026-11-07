// Documents' shapes, for the type check only: what the editor's modules share, kept out of the code it loads.
import type { Node as PMNode, Fragment, NodeSpec } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { DecorationSet, ViewMutationRecord } from 'prosemirror-view'
import type { MarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown'
import type { create } from './editor.js'
import type { creationsHere } from '../../ui/creations.js'

export type { Node as PMNode, Mark as PMMark, NodeType } from 'prosemirror-model'
export type { EditorState, Command } from 'prosemirror-state'
export type { EditorView } from 'prosemirror-view'
export type { Mappable } from 'prosemirror-transform'

/**
 * A block: where it starts and ends as a selection of blocks has it (a list's first item from the list's
 * start, its last to the list's end), where its node is, and the list it is an item of (blocks.js).
 */
export type Unit = { from: number, to: number, at: number, node: PMNode, list: { pos: number, node: PMNode } | null }

/** What a line can become, from the "/" menu's: its name's key, its glyph, and the command that turns it (blocks.js). */
export type Kind = { key: string, glyph: string, run: Command }

/** The blocks a change replaces (from–to; none: from = to), Jean's (none for blocks taken away), how many, and Jean's words (suggest.js). */
export type Change = { id: number, from: number, to: number, content: Fragment, size: number, why: string }

/** Jean's changes, as their plugin holds them (suggest.js). */
export type State = { changes: Change[], deco: DecorationSet }

/** A block as an answer draws it, and what lets it go. */
export type Drawn = HTMLElement & { stop: () => void }

/** Blocks as an answer draws them (drawn.js), for Jean's changes (suggest.js). */
export type Form = { drawn: (node: PMNode) => boolean, draw: (node: PMNode, plain: () => Node) => Drawn | null }

/** A block's view, as ProseMirror's own drawing or a table's (drawn.js). */
export type Own = { dom: Node, contentDOM?: HTMLElement | null, update?: (node: PMNode) => boolean, ignoreMutation?: (mutation: ViewMutationRecord) => boolean, destroy?: () => void }

/** How a block's kind draws it, which each of the blocks an answer may draw has (drawn.js). */
export type ToDOM = NonNullable<NodeSpec['toDOM']>

/** An editor open: the document it shows, its front matter and text as last saved, what the person selected in it, and its editor (documents.js). */
export type Editor = { path: string, name: string, head: Record<string, unknown>, body: string, context: string, editor: ReturnType<typeof create> }

/** A creation of Documents', as Creations hands one (documents.js). */
export type Kept = { path: string }

/** The project's creations, as "[[" offers them (editor.js). */
export type Creations = Awaited<ReturnType<typeof creationsHere>>

/** A picture kept, its place from the document's folder (editor.js). */
export type Keep = (file: File) => Promise<string | null>

/** prosemirror-markdown's state as markdown.js writes with it: what it holds that its types leave out. */
export interface Writer extends MarkdownSerializerState { out: string, inAutolink?: boolean, flushClose(size?: number): void }

/** What a link's marks write with. */
export type Link = MarkdownSerializerState & { inAutolink?: boolean }

/** Its class, whose constructor its types leave out. */
export type Writing = typeof MarkdownSerializerState & (new (nodes: MarkdownSerializer['nodes'], marks: MarkdownSerializer['marks'], options: { tightLists?: boolean }) => Writer)

/** How a mark is written. */
export type Spec = MarkdownSerializer['marks'][string]
