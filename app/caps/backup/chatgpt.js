// ChatGPT's part of what Restore brings in (D341, imports.js): its export's conversations.json, or
// conversations-000.json and on for a large one. A conversation is a tree of messages (`mapping`),
// since a request edited or an answer tried again starts a branch; the one kept is the branch the
// user saw last, from `current_node` back through each node's `parent`. What the user and ChatGPT
// said is kept, in its title and at its times (seconds since 1970), not what its tools did or what
// it thought, nor the citations' marks. The files the user shared (`metadata.attachments`, and
// pictures as `image_asset_pointer` parts) are beside it, named by their id: file-<id>-<name>, or
// file_<id>.dat, whose name conversation_asset_file_names.json gives when the message doesn't.
import { readJSON, iso, turnsOf } from './imports.js'

/** @import { Entry, Found } from './imports.js' */

/** The archive's file whose name starts with an id. @param {Entry[]} entries @param {string} id */
const fileOf = (entries, id) => (id ? entries.find((entry) => entry.path.slice(entry.path.lastIndexOf('/') + 1).startsWith(id)) : undefined)

/** @param {any[]} conversations @param {Entry[]} entries @returns {Promise<Found>} */
export async function chatgptOf(conversations, entries) {
  const names = (await readJSON(entries.find((entry) => entry.path === 'conversation_asset_file_names.json'))) ?? {}
  const chats = conversations.flatMap((conversation) => {
    const { mapping } = conversation
    const start = iso(conversation.create_time)
    if (!start) return []
    let time = start
    /** @type {any[]} */
    const branch = []
    for (let node = mapping[conversation.current_node]; node && !branch.includes(node); node = mapping[node.parent]) branch.unshift(node)
    const messages = branch.flatMap(({ message }) => {
      const { author, content, metadata = {}, recipient = 'all' } = message ?? {}
      if (!/^(user|assistant)$/.test(author?.role) || !/^(multimodal_)?text$/.test(content?.content_type) || metadata.is_visually_hidden_from_conversation || recipient !== 'all') return []
      time = iso(message.create_time) ?? time
      /** @type {any[]} */
      const parts = Array.isArray(content.parts) ? content.parts : []
      /** Its files by id, with their names when it gives them. @type {Map<string, any>} */
      const files = new Map((metadata.attachments ?? []).map((/** @type {any} */ file) => [file.id, file]))
      for (const id of parts.flatMap((part) => (part?.content_type === 'image_asset_pointer' ? [String(part.asset_pointer).replace(/^[\w-]+:\/\//, '')] : []))) if (!files.has(id)) files.set(id, {})
      return [{
        time,
        user: author.role === 'user',
        text: parts.map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '')).join('').replace(/\ue200[^\ue201]*\ue201/g, '').trim(),
        files: [...files].flatMap(([id, file]) => [fileOf(entries, id)].flatMap((entry) => (entry ? [{ name: file.name || String(names[`${id}.dat`] ?? entry.path).split('/').pop(), read: entry.read, type: file.mime_type }] : []))),
      }]
    })
    return [{ key: `chatgpt ${conversation.conversation_id ?? conversation.id}`, title: String(conversation.title ?? ''), turns: turnsOf(messages) }]
  })
  return { chats, rooms: [], files: [] }
}
