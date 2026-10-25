// Choose the AI that answers (D612): the ways to add a brain, as Settings › Brains › Add a brain lists them, and the
// first message's step, which has the same ways; Show me opens Jean on that page.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/choose-the-ai', fr: 'fr/aide/choisir-l-ia' },
  kind: 'howto',
  moment: 'ai',
  minutes: 3,
  start: 1,
  names: { settings: 'settings.title', brains: 'settings.brains', first: 'first.title', auto: 'auto.name', quick: 'brain.quick.title', refused: 'help/key-refused' },
  open: 'brains/add',
  steps: [
    { names: { add: 'brain.add' }, point: { on: '.settings-nav button', named: 'settings.brains', say: 'tour.here' } },
    { point: { on: '.brain-rows button', named: 'brain.quick.title' } },
    { names: { key: 'brain.key.title' }, point: { on: '.brain-rows button', named: 'brain.key.title' } },
    { names: { paid: 'brain.paid', local: 'brain.local.title' }, point: { on: '.settings-panel h3', named: 'brain.paid' } },
  ],
  also: ['key-refused', 'asks-first'],
})
