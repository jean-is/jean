// What the brain is given for Games (D648): two tools, each with its line, which games.js runs. Pure.
import { ENGINES, ACTIONS } from './file.js'

export const LINES = [{ name: 'game', line: 'make an original game that plays here, or replace one whole; each call plays it and says what broke' },
  { name: 'game_change', line: 'change a game by exact passages; it is played again' }]

/** @type {import('../../core/types.js').ToolSpec} */
export const GAME = {
  name: 'game',
  description: 'Make an original game that plays here, or replace a game whole. Read the skill game first. The game is one JavaScript module using `host`. Each call plays it out of sight and says what broke, what each control did and the moments reached: fix what it says and call again.',
  parameters: { type: 'object', properties: {
    name: { type: 'string', description: "Its title, in the user's language" }, card: { type: 'string', description: 'Its design card, 120 words at most' },
    engine: { type: 'string', enum: ENGINES }, actions: { type: 'array', items: { type: 'string', enum: ACTIONS }, description: 'The actions it uses' },
    game: { type: 'string', description: "A game's place, to replace it whole" }, code: { type: 'string', description: 'The whole game' } },
  required: ['name', 'card', 'engine', 'actions', 'code'] },
}

/** @type {import('../../core/types.js').ToolSpec} */
export const CHANGE = {
  name: 'game_change',
  description: 'Change a game by exact passages of its code, each found once, with its card when the design changes. It is played again and said, as game does.',
  parameters: { type: 'object', properties: { game: { type: 'string', description: 'Its place, as game gave it' }, card: { type: 'string' },
    changes: { type: 'array', items: { type: 'object', properties: { old: { type: 'string' }, new: { type: 'string' } }, required: ['old', 'new'] } } }, required: ['game', 'changes'] },
}
