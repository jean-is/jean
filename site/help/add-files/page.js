// Add files, folders and pictures: dropped on the box, picked with +, or pasted; what Jean reads in them and
// keeps in the project, @ to point at one again, and a folder worked on where it is, or as a copy outside Chrome and
// Edge; its pane replays a request about a shared PDF, as Jean answers it.
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/add-files-folders-and-pictures', fr: 'fr/aide/ajouter-fichiers-dossiers-et-images' },
  kind: 'howto',
  moment: 'ask',
  minutes: 3,
  names: {
    attach: 'files.attach', capture: 'capture.start', work: 'folders.drop.title', save: 'folders.save', folder: 'folders.add', reading: 'files.reading',
    picture: 'files.picture', big: 'files.tooBig', kind: 'files.unsupported', scan: 'files.noText', sees: 'help/ai-sees',
  },
  steps: [
    { names: { drop: 'files.drop' } },
    {},
    {},
    {},
    {},
  ],
  demo: (kit, text) => ({
    file: { name: text('demo.file'), type: 'application/pdf' },
    asked: text('demo.asked'),
    brain: text('demo.brain'),
    answer: text('demo.answer'),
  }),
  also: ['first-task', 'ai-sees', 'where-kept'],
})
