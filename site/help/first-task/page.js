// Your first task (D612): the box, a request in one's own words, the answer and its steps, a follow-up, and a new task
// for something else; its pane replays a first request, a note to a neighbour, as Jean answers it, and the box shows
// under the step that names it.
import { box } from '../figures.js'
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/your-first-task', fr: 'fr/aide/votre-premiere-tache' },
  kind: 'howto',
  moment: 'start',
  minutes: 3,
  start: 3,
  names: { first: 'first.title', retry: 'action.retry', copy: 'action.copy', more: 'action.more', choose: 'help/choose-ai' },
  steps: [
    { names: { placeholder: 'composer.placeholder' }, show: { figure: box, caption: 'show.box' } },
    {},
    {},
    {},
    {},
    { names: { new: 'action.new' } },
  ],
  demo: (kit, text) => ({ asked: text('demo.asked'), brain: text('demo.brain'), answer: text('demo.answer') }),
  also: ['what-jean-is', 'choose-ai', 'asks-first'],
})
