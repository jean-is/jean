// Work on something together: in Share, the people met in People ticked, then Work on it together, or Copy an invitation
// link instead, for a collection, a task, a document or slides; the one question a newcomer answers; the faces of who is
// here and People in this…, with what the one who started it can do; in a task, each person's own Jean answering
// their requests one at a time, and asking another member's; a whole project from its settings; Your devices ticked for
// a thing kept in step on them alone; Publish told apart; everyone's own copy, the 7 days, a child's profile and the
// organisation's list (D733, D734).
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/work-on-something-together', fr: 'fr/aide/travailler-ensemble' },
  kind: 'howto',
  moment: 'further',
  minutes: 4,
  names: {
    shareMenu: 'share.menu', close: 'action.close', outShare: 'out.share', share: 'share.title', together: 'share.together', inviteLink: 'share.inviteLink', publish: 'share.publish',
    copyLink: 'together.copyLink', join: 'together.join', yourName: 'together.yourName', edit: 'together.canEdit', view: 'together.canView',
    inCollection: 'together.people', inTask: 'together.peopleTask', inDoc: 'together.peopleDoc', inDeck: 'together.peopleDeck',
    block: 'together.block', remove: 'together.remove', linkOff: 'together.linkOff', stop: 'together.stop', leave: 'together.leave',
    ask: 'together.ask', letAnswer: 'together.letAnswer', projectSettings: 'projects.edit', project: 'together.project',
    people: 'cap.people.name', devices: 'cap.devices.name', meet: 'help/send-to-someone', onDevices: 'help/your-devices',
  },
  steps: [{}, {}, {}, {}, {}],
  also: ['send-to-someone', 'your-devices', 'where-kept'],
})
