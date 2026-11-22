// SPDX-License-Identifier: MIT
// AI for sheet music (the job pages, ../excel/job.js), at /sheet-music and /fr/partitions, for the reader who searched
// for a free AI that writes a score. "Music" is what Jean calls the kind among the creations, but searched, it means
// recordings, which Jean doesn't make: its address and title say what it writes. Its Try sends a request for a lullaby
// with ?q= (ui/app.js): the brain reads Jean's own skill "Music score" (D401) and writes the tune in ABC notation, drawn
// as a score in the answer and played there (D196, D338). Its pane plays that task: the tune written here, eight bars
// in three time for a piano's two hands, each bar adding up, its title the page's.
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** The lullaby: the right hand's melody, and one note a bar for the left, in G, three quarter notes a bar. */
const RIGHT = 'B2 d | d2 B | c2 e | d3 | B2 d | g2 e | d B A | G3 |]'
const LEFT = 'G,3 | B,3 | C3 | D3 | G,3 | E,3 | D,3 | G,3 |]'
/** How long each bar must be, in quarter notes. */
export const BEATS = 3

/** The tune, as the skill has a brain write one: its header a field a line, the key last, then each hand's music. @param {string} title */
export const tune = (title) => `X:1
T:${title}
M:${BEATS}/4
L:1/4
Q:1/4=84
%%score {1 2}
V:1
V:2 clef=bass
K:G
V:1
${RIGHT}
V:2
${LEFT}`

export default job({
  addresses: { en: 'sheet-music', fr: 'fr/partitions' },
  into: 'ask',
  tall: true,
  // Its promise goes from asking to reading: asking, proved by what goes in, what comes out and where the music goes;
  // reading, hearing and printing, by one tune written step by step and by what a score is.
  proves: { ask: ['io', 'where'], read: ['replay', 'exact'] },
  exact: [ICONS.music, ICONS.computer, ICONS.shield],
  // The AI behind it and what it doesn't make, under asking; how it composes, what it won't copy, and being wrong, under reading.
  limits: { ask: [0, 1], read: [2, 3, 4] },
  filled: (kit) => ({ params: { play: kit.appText('scores.play'), midi: kit.appText('scores.out.midi') } }),
  drawn: () => ({ pane: '' }),
  demo: (kit, { text }) => ({ answer: `\`\`\`abc\n${tune(text('tune.title'))}\n\`\`\`\n\n${text('demo.after')}` }),
})
