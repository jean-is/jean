// How Jean shows what it can do (D612): one box at first, then each capability offered above it when a moment calls for
// it, Turn it on or No thanks; Settings › Capabilities, the case of every one found or still to find and how it comes,
// each turned on early or off from its page, or all at once (D127, D281, D433). Show me opens Jean there. An offer
// above the box shows how one comes, and a group of the page, two found and one still to find, how the page reads.
import { offered, settings } from '../figures.js'
import { helpArticle } from '../help.js'

/** Settings › Capabilities' first group, two found and lit, one still to find, dashed and ringed. */
const CASE = settings({
  title: 'settings.capabilities',
  sections: [{
    head: 'case.group.files',
    count: [2, 8],
    rows: [{ icon: 'file', title: 'cap.files.name', text: 'cap.files.text' }, { icon: 'note', title: 'cap.made.name', text: 'cap.made.text' }, { icon: 'table', title: 'cap.tables.name', text: 'cap.tables.hint', todo: true, ring: true }],
  }],
})

export default helpArticle({
  addresses: { en: 'help/what-jean-can-do', fr: 'fr/aide/ce-que-jean-sait-faire' },
  kind: 'explainer',
  moment: 'further',
  minutes: 3,
  start: 6,
  names: {
    settings: 'settings.title', capabilities: 'settings.capabilities', yes: 'offer.yes', no: 'offer.no', search: 'cap.search.yes', on: 'collection.turnOn', off: 'collection.turnOff',
    all: 'collection.all', made: 'cap.made.name', words: 'help/words',
  },
  open: 'capabilities',
  steps: [
    { point: { on: '.settings-nav button', named: 'settings.capabilities', say: 'tour.here' } },
    { point: { on: '.case-bar' } },
    { point: { on: '.case li.is-todo button', say: 'tour.row' }, show: { figure: CASE, caption: 'show.rows' } },
    { point: { on: '.case-all button', named: 'collection.all' } },
  ],
  shows: [{ figure: offered('search'), caption: 'show.offer' }],
  also: ['what-jean-is', 'words', 'first-task'],
})
