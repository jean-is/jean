// Backup: everything Jean keeps, in one zip the user saves wherever they like. Keys stay
// on the device (they are never part of a backup). Restoring adds what is missing.
import { register } from '../../ui/caps.js'
import { app, answerOffer, notify, showError } from '../../ui/state.js'
import { exportBackup, importBackup } from './archive.js'
import { save } from '../../ui/save.js'
import { t } from '../../core/i18n.js'

register({ id: 'backup' })

export async function downloadBackup() {
  try {
    // A backup is the moment someone shows they care about this data.
    navigator.storage?.persist?.().catch(() => {})
    const { bytes, files } = await exportBackup(app.fs, { by: app.deviceId })
    const date = new Intl.DateTimeFormat('en-CA').format(new Date()) // YYYY-MM-DD in every locale
    save(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/zip' }), `${t('backup.fileName', { date })}.zip`)
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
