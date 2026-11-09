// Work on something together: Share's Work on it together for a collection, a task, a document or slides, by a link
// that edits or views, or by inviting people met in People; the one question a newcomer answers; the faces of who is
// here and People in this…, with what the one who started it can do; in a task, each person's own Jean answering
// their requests one at a time, and asking another member's; Only on my devices; everyone's own copy, the 7 days,
// a whole project from its settings; a child's profile and the organisation's list (D733, D734).
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/work-on-something-together', fr: 'fr/aide/travailler-ensemble' },
  kind: 'howto',
  moment: 'further',
  minutes: 4,
  names: {
    shareMenu: 'share.menu', close: 'action.close', outShare: 'out.share', how: 'share.how', together: 'share.together', who: 'share.who', only: 'people.only',
    anyone: 'together.anyone', edit: 'together.canEdit', view: 'together.canView', start: 'together.start', copyLink: 'together.copyLink', invite: 'together.invite',
    join: 'together.join', yourName: 'together.yourName', inCollection: 'together.people', inTask: 'together.peopleTask', inDoc: 'together.peopleDoc', inDeck: 'together.peopleDeck',
    block: 'together.block', remove: 'together.remove', linkOff: 'together.linkOff', stop: 'together.stop', leave: 'together.leave',
    ask: 'together.ask', letAnswer: 'together.letAnswer', mine: 'together.mine', projectSettings: 'projects.edit', project: 'together.project', people: 'cap.people.name', meet: 'help/send-to-someone', devices: 'help/your-devices',
  },
  steps: [{}, {}, {}, {}, {}, {}],
  also: ['send-to-someone', 'your-devices', 'where-kept'],
})
