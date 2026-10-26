// A brain couldn't be reached (D612): what "Couldn't reach …" means, offline or a service that refuses a browser,
// and how to try again or answer with another brain, from Settings › Brains, where the brain says it needs you; the
// brain's page links here while it does, but a plan's, whose line has most often stopped (help/plan-stopped). Show
// me opens Jean there.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/couldnt-reach', fr: 'fr/aide/injoignable' },
  kind: 'fix',
  moment: 'fix',
  minutes: 2,
  names: { settings: 'settings.title', brains: 'settings.brains', trouble: 'brain.trouble', retry: 'action.retry', add: 'brain.add', check: 'brain.manage', auto: 'auto.name', choose: 'help/choose-ai', plan: 'help/plan-stopped' },
  open: 'brains',
  steps: [
    {},
    { point: { on: '.brain-rows button', named: 'brain.trouble', go: 'click', say: 'tour.trouble' } },
    { point: { on: '.brain-wait button', named: 'action.retry' } },
    {},
  ],
  also: ['plan-stopped', 'choose-ai', 'key-refused'],
})
