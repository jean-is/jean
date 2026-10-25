// A brain refused the key (D612): what "… refused the key" means and how to put in a new key, from Settings ›
// Brains, where the brain says it needs you; the brain's page links here while it does. Show me opens Jean there.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/key-refused', fr: 'fr/aide/cle-refusee' },
  kind: 'fix',
  moment: 'fix',
  minutes: 2,
  names: { settings: 'settings.title', brains: 'settings.brains', trouble: 'brain.trouble', change: 'brain.key.change', choose: 'help/choose-ai' },
  open: 'brains',
  steps: [
    { point: { on: '.brain-rows button', named: 'brain.trouble', go: 'click', say: 'tour.trouble' } },
    {},
    { names: { key: 'brain.key.label', connect: 'brain.connect' }, point: { on: 'button', named: 'brain.key.change' } },
    { names: { add: 'brain.add' } },
  ],
  also: ['choose-ai'],
})
