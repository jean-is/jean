// Files: the user drops, pastes or picks files; Jean extracts their text, keeps the
// original in the project's library, and the next message links to them. Adds the
// `read` tool for pages that didn't fit in the message.
import { register } from '../../ui/caps.js'
import { app, currentFiles, rememberText, warm, notify } from '../../ui/state.js'
import { addFile, readTool } from '../../core/files.js'
import { extractPages } from '../../core/extract.js'
import { t } from '../../core/i18n.js'

const MAX_BYTES = 100 * 1024 * 1024

register({
  id: 'files',
  tools: [readTool({ fs: app.fs, projectDir: () => app.projectDir, files: currentFiles })],
  lines: [{ name: 'read', line: 'read pages of a file the user shared' }],
  rules: ['Shared files are in the message, sometimes only their first pages. Use read for the others.'],
})

let persisted = false

/**
 * Reads files into attachments for the next message. Each shows as "reading" until its
 * text is extracted and the file is stored.
 * @param {Iterable<File>} list
 */
export async function addFiles(list) {
  const files = [...list]
  if (!files.length) return
  // Files are user data: ask the browser not to evict them (silent in Chrome and Edge).
  if (!persisted) {
    persisted = true
    navigator.storage?.persist?.().catch(() => {})
  }
  await Promise.all(files.map(readOne))
  warm()
}

/** @param {File} file */
async function readOne(file) {
  const key = crypto.randomUUID()
  /** @param {Partial<import('../../ui/state.js').Attachment>} patch */
  const update = (patch) => {
    app.attachments.value = app.attachments.value.map((item) => (item.key === key ? { ...item, ...patch } : item))
  }
  app.attachments.value = [...app.attachments.value, { key, name: file.name, status: 'reading' }]
  try {
    if (file.size > MAX_BYTES) throw new Error(t('files.tooBig'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    const pages = await pagesOf(file, bytes)
    if (!pages) throw new Error(t('files.unsupported'))
    if (!pages.some((page) => page.trim())) throw new Error(t('files.noText'))
    const link = await addFile(app.fs, { projectDir: app.projectDir, name: file.name, mimeType: file.type, bytes, pages, by: app.deviceId })
    rememberText(link, pages)
    update({ status: 'ready', link, pages })
  } catch (error) {
    console.warn(file.name, error)
    const message = error instanceof Error && error.message ? error.message : t('files.unreadable')
    update({ status: 'failed', error: message })
    notify(t('files.failed', { name: file.name }))
  }
}

/** @param {File} file @param {Uint8Array} bytes */
async function pagesOf(file, bytes) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const { pdfPages } = await import('./pdf.js')
    return pdfPages(bytes)
  }
  return extractPages(file.name, bytes)
}
