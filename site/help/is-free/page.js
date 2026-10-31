// Is Jean free: Jean costs no one anything, the brain behind it may; what each way of answering costs, where
// an answer says what it cost, and what an organisation pays, with a link to the page for IT.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/is-jean-free', fr: 'fr/aide/jean-est-il-gratuit' },
  kind: 'explainer',
  moment: 'start',
  minutes: 2,
  names: { settings: 'settings.title', brains: 'settings.brains', about: 'receipt.about', cost: 'receipt.cost', free: 'receipt.free', choose: 'help/choose-ai', enterprise: 'enterprise' },
  also: ['choose-ai', 'what-jean-is'],
})
