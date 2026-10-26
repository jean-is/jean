// When Jean asks first (D612): what Jean does by itself, what it asks before doing and what it never does, as
// Settings › Approvals has them; its pane replays a request to send an email, which waits on its card for the reader
// to answer, and Show me opens Jean on Approvals. The card it waits on shows under what Jean asks first, and the three
// rules with their kinds under the step that names them.
import { asking, rules } from '../figures.js'
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/when-jean-asks-first', fr: 'fr/aide/quand-jean-demande-d-abord' },
  kind: 'explainer',
  moment: 'ask',
  minutes: 3,
  start: 5,
  names: {
    settings: 'settings.title', approvals: 'settings.approvals', allow: 'rules.allow', ask: 'rules.ask', never: 'rules.never',
    once: 'approval.allowOnce', always: 'approval.allowAlways', notnow: 'approval.rejectOnce', nothing: 'approval.rejectAlways',
  },
  open: 'approvals',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.approvals', say: 'tour.here' } },
    { point: { on: '.approval-bins' }, show: { figure: rules(), caption: 'show.rules' } },
    { names: { reset: 'approvals.reset' } },
  ],
  demo: (kit, text) => ({
    file: { name: text('demo.file'), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    asked: text('demo.asked'),
    brain: text('demo.brain'),
    call: { name: 'send_email', title: text('demo.call'), input: { to: 'team@example.org', subject: text('demo.subject') }, output: text('demo.sent'), asks: true },
    answer: text('demo.answer'),
  }),
  shows: [null, { figure: asking('demo.call'), caption: 'show.card' }],
  also: ['choose-ai'],
})
