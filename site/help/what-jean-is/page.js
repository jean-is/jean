// What Jean is (D612): one box, the brain that answers, what it makes, where the work stays, what it asks first and
// how more shows up, each in a few words and shown beside them: the box and the first step drawn as Jean draws them,
// the sales spreadsheet's request played again from /excel, where the work stays, the email that waits on its card
// from When Jean asks first, and an offer; the first article of Start here.
import { box, first, kept, offer, replay } from '../figures.js'
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/what-jean-is', fr: 'fr/aide/qu-est-ce-que-jean' },
  kind: 'explainer',
  moment: 'start',
  minutes: 3,
  start: 1,
  names: {
    settings: 'settings.title', capabilities: 'settings.capabilities', mistakes: 'composer.ai', once: 'approval.allowOnce', notnow: 'approval.rejectOnce',
    choose: 'help/choose-ai', asks: 'help/asks-first', backup: 'help/back-up',
  },
  shows: [
    { figure: box, caption: 'show.box' }, { figure: first, caption: 'show.first' }, { figure: replay('excel'), caption: 'show.sales' },
    { figure: kept, caption: 'show.kept' }, { figure: replay('help/asks-first'), caption: 'show.email' }, { figure: offer('computer'), caption: 'show.offer' },
  ],
  also: ['first-task', 'choose-ai', 'back-up'],
})
