// Back up and restore (D612): one file with every task and file, from Settings › Your data, kept where only its owner
// opens it, and restored on any device from its Backup page, adding and deleting nothing; Show me opens Jean there.
// Its steps show the offer above the box after a third task, Your data with Download a backup ringed, and the Backup
// page with Choose a backup… ringed.
import { offered, settings } from '../figures.js'
import { helpArticle } from '../help.js'

/** Settings › Your data, Download a backup ringed at its top. */
const DATA = settings({
  title: 'settings.storage',
  button: { label: 'backup.download', icon: 'download', ring: true },
  lede: ['data.kept', 'data.unkept'],
  sections: [{ head: 'data.copies', rows: [{ icon: 'backup', title: 'cap.backup.name', text: 'cap.backup.text', state: 'data.never' }] }],
})

/** Its Backup page, Choose a backup… ringed under Restore a backup. */
const RESTORE = settings({
  back: 'settings.storage',
  title: 'cap.backup.name',
  button: { label: 'backup.download', icon: 'download' },
  lede: ['backup.text'],
  sections: [{ head: 'backup.restore', pick: { label: 'data.pick', icon: 'upload' } }],
})

export default helpArticle({
  addresses: { en: 'help/back-up-and-restore', fr: 'fr/aide/sauvegarder-et-restaurer' },
  kind: 'howto',
  moment: 'safe',
  minutes: 2,
  start: 4,
  names: { settings: 'settings.title', data: 'settings.storage', download: 'backup.download', backup: 'cap.backup.name', restore: 'backup.restore', pick: 'data.pick', brains: 'settings.brains', import: 'data.import' },
  open: 'data',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.storage', say: 'tour.here' }, show: { figure: offered('backup'), caption: 'show.offer' } },
    { point: { on: '.data-head button', named: 'backup.download' }, show: { figure: DATA, caption: 'show.data' } },
    {},
    { names: { backup: 'cap.backup.name' }, point: { on: '.data-rows button', named: 'cap.backup.name', go: 'click' } },
    { names: { restore: 'backup.restore', pick: 'data.pick' }, point: { on: 'label.button', named: 'data.pick' }, show: { figure: RESTORE, caption: 'show.restore' } },
  ],
  also: ['what-jean-is', 'first-task'],
})
