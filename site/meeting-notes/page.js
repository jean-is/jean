// SPDX-License-Identifier: MIT
// AI for meeting notes (the job pages, ../excel/job.js), at /meeting-notes and /fr/comptes-rendus, for the reader who
// searched for a free AI that turns a recording into minutes, or one that transcribes without sending the sound away.
// A recording or a film shared is heard on the device (D713, caps/voice/heard.js): what is said in it becomes its text, a
// line for each window of up to 30 s with when it starts, which any brain then reads as it reads a document. Jean has
// no sample recording, so its Try opens Jean, and the page says to drop one in the box. Its replay is a bookshop's
// Monday meeting: six of its lines, each at its time as Jean writes one (heard.js's stamp()), and the minutes made of
// them, which its pane plays, each point with the time of the line that says it.
import { stamp } from '../../app/caps/voice/heard.js'
import { ICONS, xml } from '../site.js'
import { job } from '../excel/job.js'

/** The lines the page shows of the recording, as its words give them: when each starts, in seconds, and what is said. @param {import('../site.js').Kit} kit */
export const linesOf = (kit) => /** @type {string[][]} */ (kit.raw('heard.lines')).map(([at, said]) => ({ at: stamp(Number(at)), said }))

export default job({
  addresses: { en: 'meeting-notes', fr: 'fr/comptes-rendus' },
  into: 'open',
  tall: true,
  // Its promise goes from the notes to where they are heard: the notes, proved by one meeting step by step and by
  // what goes in and comes out; heard here, by what writes speech down and by where the recording goes.
  proves: { notes: ['replay', 'io'], private: ['exact', 'where'] },
  exact: [ICONS.mic, ICONS.clock, ICONS.brain],
  // The AI behind it, voices not told apart, no recording of its own and what is misheard, under the notes; the
  // language it writes in and how long it takes, under hearing it here.
  limits: { notes: [0, 1, 2, 3], private: [4, 5] },
  // Each line's time, for the minutes to give: {t0}, {t1}…
  filled: (kit) => ({ params: Object.fromEntries(linesOf(kit).map(({ at }, i) => [`t${i}`, at])) }),
  drawn (kit, { list }) {
    const [starts, said] = list('heard.columns')
    // What was heard, a line a row, its time first; on a narrow window, in a box of its own that scrolls.
    const work = /* html */ `<div class="job-scroll"><table class="job-table is-said">
      <thead><tr><th scope="col">${starts}</th><th scope="col">${said}</th></tr></thead>
      <tbody>${linesOf(kit).map((line) => /* html */ `
        <tr><th scope="row">${xml(line.at)}</th><td dir="${kit.dir}">${xml(line.said)}</td></tr>`).join('')}
      </tbody>
    </table></div>`
    return { pane: '', work }
  },
  demo: (kit, { text }) => ({ type: 'audio/mp4', answer: text('demo.answer') }),
})
