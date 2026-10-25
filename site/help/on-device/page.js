// Use the AI on this computer (D612): the brain on this device, offered under Free in Settings › Brains' ways only where
// it runs (a computer of about 12 GB, a graphics chip the browser lets a page use, room for its download), downloaded
// once, then Auto's for anything personal and offline, or every request with Keep on this device. Show me opens Jean on
// the ways and points where it is offered, which a computer that can't run it doesn't show.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/ai-on-this-computer', fr: 'fr/aide/l-ia-sur-cet-ordinateur' },
  kind: 'howto',
  moment: 'ai',
  minutes: 3,
  names: {
    settings: 'settings.title', brains: 'settings.brains', add: 'brain.add', free: 'brain.free', device: 'brain.device.title', ready: 'brain.device.ready',
    who: 'brain.who', keep: 'picker.keepOnDevice', auto: 'auto.name', first: 'first.title', also: 'first.also',
    local: 'receipt.local', data: 'settings.storage', space: 'data.space', choose: 'help/choose-ai', openrouter: 'help/openrouter',
  },
  open: 'brains/add',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.brains', say: 'tour.here' } },
    { point: { on: '.settings-panel h3', named: 'brain.free', say: 'tour.free' } },
    {},
    {},
    {},
  ],
  also: ['choose-ai', 'ai-sees', 'openrouter'],
})
