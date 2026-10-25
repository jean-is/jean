// Words you'll see (D612): what Jean's own words mean, from brain to extension, each as the screen says it and in a
// sentence; the ones a capability brings say so, since nothing of it shows before it is found (D281).
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/words-you-ll-see', fr: 'fr/aide/les-mots-de-jean' },
  kind: 'explainer',
  moment: 'start',
  minutes: 3,
  names: {
    settings: 'settings.title', brains: 'settings.brains', approvals: 'settings.approvals', capabilities: 'settings.capabilities', auto: 'auto.name',
    new: 'action.new', creations: 'creations.title', allow: 'rules.allow', ask: 'rules.ask', never: 'rules.never', choose: 'help/choose-ai',
    asks: 'help/asks-first', more: 'help/what-jean-can-do',
  },
  also: ['what-jean-is', 'what-jean-can-do', 'asks-first'],
})
