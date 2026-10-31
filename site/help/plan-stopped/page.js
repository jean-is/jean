// Your plan stopped answering: a Claude, ChatGPT or Copilot plan answers through This computer (D235, D262),
// a line that runs while its terminal does, so after a restart or once the terminal closes its brain can't be
// reached until the line runs again, copied from Settings › Computer › This computer; the plan's brain links here
// while it can't be reached. Show me opens Jean on Settings › Computer.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/plan-stopped', fr: 'fr/aide/forfait-arrete' },
  kind: 'fix',
  moment: 'fix',
  minutes: 2,
  names: { settings: 'settings.title', brains: 'settings.brains', section: 'cap.computer.name', computer: 'cap.machine.name', off: 'machine.off', retry: 'action.retry', trouble: 'brain.trouble', reach: 'help/couldnt-reach', choose: 'help/choose-ai' },
  open: 'computer',
  steps: [
    { point: { on: '.data-rows button', named: 'cap.machine.name', go: 'click', say: 'tour.row' } },
    { names: { copy: 'action.copy' }, point: { on: '.machine-line button', named: 'action.copy' } },
    {},
    {},
  ],
  also: ['couldnt-reach', 'choose-ai'],
})
