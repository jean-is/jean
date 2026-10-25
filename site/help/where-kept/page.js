// Where your work is kept (D612): in this browser, on this device, sealed; each browser, profile and address its own;
// what can clear it, and the copies that keep it; Where your files go has the rest.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/where-your-work-is-kept', fr: 'fr/aide/ou-est-garde-votre-travail' },
  kind: 'explainer',
  moment: 'safe',
  minutes: 3,
  names: { settings: 'settings.title', data: 'settings.storage', unkept: 'data.unkept', space: 'data.space', sync: 'cap.sync.name', backup: 'help/back-up', gone: 'help/tasks-gone', files: 'files' },
  also: ['back-up', 'ai-sees', 'tasks-gone'],
})
