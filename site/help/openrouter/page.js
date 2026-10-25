// Start free with OpenRouter (D612): the one click the first message offers, Start for free, and the same way in
// Settings › Brains, its sign-in on OpenRouter's site and back; its free brains' limits and its credits. Show me opens
// Jean on that way's page.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/start-free-with-openrouter', fr: 'fr/aide/commencer-gratuitement-avec-openrouter' },
  kind: 'howto',
  moment: 'ai',
  minutes: 2,
  names: { settings: 'settings.title', brains: 'settings.brains', add: 'brain.add', quick: 'brain.quick.title', action: 'brain.quick.action', first: 'first.title', free: 'first.free', version: 'brain.model', device: 'help/on-device', choose: 'help/choose-ai' },
  open: 'brains/quick',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.brains', say: 'tour.here' } },
    { point: { on: '.brain-way button', named: 'brain.quick.action' } },
    {},
    {},
    { names: { connected: 'brain.connected' } },
  ],
  also: ['choose-ai', 'is-free', 'on-device'],
})
