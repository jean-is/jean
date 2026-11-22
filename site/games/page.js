// SPDX-License-Identifier: MIT
// AI for games (the job pages, ../excel/job.js), at /games and /fr/jeux, for the reader who searched for a free AI that
// makes a game. Its Try sends a teacher's request with ?q= (ui/app.js): asked for a game, the brain reads Jean's own
// skill "Make a game" (D401), which brings Games (D648), and makes it with `game`. Its pane is no conversation but the
// game that request makes, live in Jean's own game frame (site/creation.js): ./game.js, one module on a plain canvas as
// the skill has a brain write one, its numbers in TUNING and its words the page's, in WORDS.
import { readFile } from 'node:fs/promises'
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** The game's code, as it is written, and the words it draws, by their names in it. */
const CODE = await readFile(new URL('game.js', import.meta.url), 'utf8')
const WORDS = ['title', 'how', 'start', 'again', 'won', 'over', 'right', 'best']
const HOLE = '/* WORDS */ {}'
if (!CODE.includes(HOLE)) throw new Error('site/games/game.js has no place for its words')

export default job({
  addresses: { en: 'games', fr: 'fr/jeux' },
  into: 'ask',
  // Its promise goes from the words to the play: the words, proved by what goes in, what comes out and where the game
  // lives; the play, by one game made step by step and what Jean plays before it shows it.
  proves: { say: ['io', 'where'], play: ['replay', 'exact'] },
  exact: [ICONS.computer, ICONS.app, ICONS.shield],
  // The AI behind it and what a game is drawn with, under the words; how large a game is, who plays it, and being wrong, under the play.
  limits: { say: [0, 1], play: [2, 3, 4] },
  filled: (kit) => ({ params: { play: kit.appText('games.play') } }),
  drawn: () => ({ pane: '' }),
  made: (kit, { text }) => ({
    kind: 'game', name: text('made.name'), card: text('made.card'), engine: 'none', actions: ['left', 'right', 'a'],
    code: CODE.replace(HOLE, JSON.stringify(Object.fromEntries(WORDS.map((word) => [word, text(`made.words.${word}`)])))),
  }),
})
