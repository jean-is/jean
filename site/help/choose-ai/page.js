// Choose the AI that answers: the ways to add a brain, as Settings › Brains › Add a brain lists them, and the
// first message's step, which has the same ways, each shown beside its step (the first step, and the page with Start in
// one click ringed); Show me opens Jean on that page.
import { first, settings } from '../figures.js'
import { helpArticle } from '../help.js'

/** Settings › Brains' Add a brain, its ways in the cloud with a key and free, Start in one click ringed. */
const ADD = settings({
  lede: ['brain.lede'],
  sections: [
    { head: 'brain.keyed', rows: [{ icon: 'key', title: 'brain.key.title', text: 'brain.key.text' }] },
    { head: 'brain.free', rows: [{ icon: 'brain-device', title: 'brain.device.title', text: 'brain.device.private' }, { icon: 'cloud', title: 'brain.quick.title', text: 'provider.openrouter', ring: true }, { icon: 'brain-device', title: 'brain.local.title', text: ['provider.ollama', 'provider.lmstudio'] }] },
  ],
})

export default helpArticle({
  addresses: { en: 'help/choose-the-ai', fr: 'fr/aide/choisir-l-ia' },
  kind: 'howto',
  moment: 'ai',
  minutes: 3,
  start: 2,
  names: { settings: 'settings.title', brains: 'settings.brains', add: 'brain.add', free: 'brain.free', keyed: 'brain.keyed', first: 'first.title', auto: 'auto.name', quick: 'brain.quick.title', refused: 'help/key-refused', stopped: 'help/plan-stopped' },
  open: 'brains/add',
  steps: [
    { names: { add: 'brain.add' }, point: { on: '.settings-nav button', named: 'settings.brains', say: 'tour.here' }, show: { figure: first, caption: 'show.first' } },
    { point: { on: '.brain-rows button', named: 'brain.quick.title' }, show: { figure: ADD, caption: 'show.add' } },
    { names: { key: 'brain.key.title' }, point: { on: '.brain-rows button', named: 'brain.key.title' } },
    { names: { paid: 'brain.paid', local: 'brain.local.title' }, point: { on: '.settings-panel h3', named: 'brain.paid' } },
  ],
  also: ['key-refused', 'asks-first'],
})
