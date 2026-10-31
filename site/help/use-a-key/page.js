// Use a key you already have: a key from one of the services that take requests from a browser, pasted in
// Settings › Brains' way for keys, with the steps it shows to make one; a key isn't a plan, and Vertex AI's is a
// service account's file. Show me opens Jean on that way's page.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/use-a-key-you-have', fr: 'fr/aide/utiliser-une-cle' },
  kind: 'howto',
  moment: 'ai',
  minutes: 3,
  names: {
    settings: 'settings.title', brains: 'settings.brains', add: 'brain.add', key: 'brain.key.title', service: 'brain.key.provider', label: 'brain.key.label',
    connect: 'brain.connect', yours: 'brain.connectedTitle', change: 'brain.key.change', paid: 'brain.paid', refused: 'help/key-refused', reach: 'help/couldnt-reach',
  },
  open: 'brains/key',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.brains', say: 'tour.here' } },
    { point: { on: '.brain-way select' } },
    { point: { on: '.key-steps' } },
    { point: { on: '.brain-way button', named: 'brain.connect' } },
    {},
  ],
  also: ['choose-ai', 'key-refused', 'is-free'],
})
