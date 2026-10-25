// Back up and restore (D612): one file with every task and file, from Settings › Your data, kept where only its owner
// opens it, and restored on any device from its Backup page, adding and deleting nothing; Show me opens Jean there.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/back-up-and-restore', fr: 'fr/aide/sauvegarder-et-restaurer' },
  kind: 'howto',
  moment: 'safe',
  minutes: 2,
  start: 4,
  names: { settings: 'settings.title', data: 'settings.storage', download: 'backup.download', brains: 'settings.brains', import: 'data.import' },
  open: 'data',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.storage', say: 'tour.here' } },
    { point: { on: '.data-head button', named: 'backup.download' } },
    {},
    { names: { backup: 'cap.backup.name' }, point: { on: '.data-rows button', named: 'cap.backup.name', go: 'click' } },
    { names: { restore: 'backup.restore', pick: 'data.pick' }, point: { on: 'label.button', named: 'data.pick' } },
  ],
  also: ['what-jean-is', 'first-task'],
})
