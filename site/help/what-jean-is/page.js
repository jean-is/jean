// What Jean is (D612): one box, the brain that answers, what it makes, where the work stays, what it asks first and
// how more shows up, each in a few words; the first article of Start here.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/what-jean-is', fr: 'fr/aide/qu-est-ce-que-jean' },
  kind: 'explainer',
  moment: 'start',
  minutes: 3,
  start: 1,
  names: { settings: 'settings.title', capabilities: 'settings.capabilities', mistakes: 'composer.ai', choose: 'help/choose-ai', asks: 'help/asks-first', backup: 'help/back-up' },
  also: ['first-task', 'choose-ai', 'back-up'],
})
