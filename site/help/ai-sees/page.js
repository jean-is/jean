// What the AI sees: what a brain reads for a request and what it never reads, who it goes to for each way of
// answering, where each answer says it went, and how to keep it all on the device; Where your files go has the rest.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/what-the-ai-sees', fr: 'fr/aide/ce-que-voit-l-ia' },
  kind: 'explainer',
  moment: 'safe',
  minutes: 3,
  names: { settings: 'settings.title', brains: 'settings.brains', who: 'brain.who', keep: 'picker.keepOnDevice', project: 'projects.local', about: 'receipt.about', local: 'receipt.local', cloud: 'receipt.inCloud', out: 'receipt.out', choose: 'help/choose-ai', files: 'files', privacy: 'privacy' },
  also: ['where-kept', 'asks-first', 'choose-ai'],
})
