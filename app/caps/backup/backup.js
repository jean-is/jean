// Backup: everything Jean keeps, in one zip the user saves wherever they like. Keys stay
// on the device (they are never part of a backup). Restoring adds what is missing.
import { register, unlock } from '../../ui/caps.js'
import { app, answerOffer, notify, showError, updateSettings, refreshConversations, refreshProjects } from '../../ui/state.js'
import { exportBackup, importBackup, isBackupZip } from './archive.js'
import { save } from '../../ui/save.js'
import { t, useStrings } from '../../core/i18n.js'

await useStrings('backup')
register({ id: 'backup' })

export async function downloadBackup() {
  try {
    // A backup is the moment someone shows they care about this data.
    navigator.storage?.persist?.().catch(() => {})
    const { bytes, files } = await exportBackup(app.fs, { by: app.deviceId })
    const date = new Intl.DateTimeFormat('en-CA').format(new Date()) // YYYY-MM-DD in every locale
    save(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/zip' }), `${t('backup.fileName', { date })}.zip`)
    // When, for Your data's line and its Backup row (D519): this device's, as settings are.
    await updateSettings({ backedUp: new Date().toISOString() })
    await answerOffer('backup')
    notify(t('backup.saved', { count: files }))
  } catch (error) {
    showError(error)
  }
}

/** @param {File} file */
export async function restoreBackup(file) {
  try {
    const { added, updated } = await importBackup(app.fs, new Uint8Array(await file.arrayBuffer()))
    // Most likely from another computer: Sync is offered once this one starts again (D286).
    await updateSettings({ restored: true })
    notify(t('backup.restored', { count: added + updated }))
    // Projects and conversations are read at start; begin again from the restored folder, in the
    // room (Settings is in the address, D137).
    app.dialog.value = null
    setTimeout(() => location.reload(), 1200)
  } catch (error) {
    console.warn('Restore', error)
    notify(t('backup.notABackup'))
  }
}

/** Whether a file is a backup of Jean's, rather than an export from elsewhere. @param {File} file */
export const isBackup = async (file) => isBackupZip(new Uint8Array(await file.arrayBuffer()))

/**
 * Brings in an export of Gemini's from Google Takeout, of ChatGPT's or of Claude's, its parts
 * together, once the user says yes: its conversations into this project, its Gems or projects as
 * projects, its other files the project's (D340, D341).
 * @param {File[]} files
 */
export async function bringIn(files) {
  if (!confirm(t('backup.confirmImport'))) return
  try {
    const { unpack, importExport } = await import('./imports.js')
    const entries = (await Promise.all(files.map(async (file) => unpack(new Uint8Array(await file.arrayBuffer()), file.name)))).flat()
    const result = await importExport(app.fs, entries, { projectDir: app.projectDir, by: app.deviceId, pages })
    if (!result || result === 'html') return notify(t(result ? 'backup.chooseJson' : 'backup.notABackup'))
    await Promise.all([refreshConversations(), refreshProjects()])
    // Its Gems or projects are Jean's projects now: the rooms they are in show.
    if (result.projects) unlock('projects')
    notify(t('backup.imported', { count: result.conversations }))
  } catch (error) {
    console.warn('Import', error)
    notify(t('backup.notABackup'))
  }
}

/** A file's text, a PDF's included, as the files capability reads one. @param {string} name @param {Uint8Array} bytes */
const pages = async (name, bytes) => (/\.pdf$/i.test(name) ? (await import('../files/pdf.js')).pdfPages(bytes) : (await import('../files/extract.js')).extractPages(name, bytes))
