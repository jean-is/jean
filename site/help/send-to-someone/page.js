// SPDX-License-Identifier: MIT
// Send a task to someone: Settings › People › Add a person, side by side with a code to scan or apart with a link,
// the six digits their screen shows typed here; then, in Share, the person ticked and Send a copy, for a task or what
// Jean made; the card it comes as on their side, Send back to them and Take in, Publish told apart, removing a person,
// colleagues at work (D727, D731).
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/send-a-task-to-someone', fr: 'fr/aide/envoyer-une-tache-a-quelqu-un' },
  kind: 'howto',
  moment: 'further',
  minutes: 3,
  names: {
    settings: 'settings.title', people: 'cap.people.name', capabilities: 'settings.capabilities', add: 'people.add', who: 'people.who', side: 'people.side', apart: 'people.apart',
    from: 'people.from', accept: 'people.accept', confirm: 'people.confirm', invitations: 'people.invitations', shareMenu: 'share.menu', copy: 'action.copy', share: 'share.title',
    sendCopy: 'share.copy', publish: 'share.publish', reading: 'people.reading', words: 'people.words', waiting: 'people.answer', open: 'people.open', notNow: 'people.notNow', takeIn: 'people.takeIn',
    rename: 'people.rename', remove: 'action.remove', find: 'people.find', keep: 'people.keep', inviteMail: 'people.inviteMail', together: 'help/together',
  },
  steps: [{}, {}, {}, {}, {}, {}],
  also: ['together', 'your-devices', 'ai-sees'],
})
