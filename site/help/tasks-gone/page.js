// My tasks are gone (D612): where they most often still are (another browser, address, profile or project, or a
// private window), why a browser clears them, and restoring the last backup, the one way back.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/my-tasks-are-gone', fr: 'fr/aide/mes-taches-ont-disparu' },
  kind: 'fix',
  moment: 'fix',
  minutes: 2,
  names: { settings: 'settings.title', data: 'settings.storage', backups: 'help/back-up', kept: 'help/where-kept' },
  steps: [
    {},
    { names: { profiles: 'profiles.title' } },
    {},
    {},
    { names: { backup: 'cap.backup.name', pick: 'data.pick' } },
  ],
  also: ['back-up', 'where-kept'],
})
