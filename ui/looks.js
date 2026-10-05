// Looks (D111): Jean's own room, or another style sheet over it (ui/looks/<id>.css). The user's
// touches over a look are ui/touches.js, loaded once there are some.

/** @typedef {import('../core/settings.js').Look} Look */

/**
 * Each look, with what the page needs before its style sheet says it: the browser bar's colour
 * by night and by day, and its accent, where the colour pickers start. Mail and Human keep the
 * conversations in view, beside the one open (`list`). Jean's own three first, then (D120) the
 * refined, the playful and the familiar.
 */
/** @typedef {'room' | 'mail' | 'paper' | 'minimal' | 'swiss' | 'fjord' | 'velvet' | 'terminal' | 'neon' | 'notebook' | 'depth' | 'classic' | 'pixel' | 'blueprint' | 'mondrian' | 'human'} LookId */
/** @type {Readonly<Record<LookId, { bar: [string, string], accent: string, list?: boolean }>>} */
export const LOOKS = Object.freeze({
  room: { bar: ['#120c08', '#fbf6ee'], accent: '#f29d38' },
  mail: { bar: ['#060708', '#f4f5f7'], accent: '#3d82f6', list: true },
  paper: { bar: ['#211e1a', '#faf7f0'], accent: '#b23a2a' },
  minimal: { bar: ['#0a0a0a', '#fdfdfd'], accent: '#161616' },
  swiss: { bar: ['#0d0d0d', '#fdfdfd'], accent: '#d81618' },
  fjord: { bar: ['#2d333f', '#eef0f5'], accent: '#88cada' },
  velvet: { bar: ['#1e0a16', '#f9f5ec'], accent: '#e5bf6d' },
  terminal: { bar: ['#07120a', '#f8fbf6'], accent: '#9aff81' },
  neon: { bar: ['#13062a', '#ffeffa'], accent: '#ff62be' },
  notebook: { bar: ['#1b3125', '#fcfcf9'], accent: '#cc272e' },
  depth: { bar: ['#060b18', '#f1f3f7'], accent: '#fca942' },
  classic: { bar: ['#2c2e31', '#c1c1c1'], accent: '#0126a3' },
  pixel: { bar: ['#202126', '#d0cec7'], accent: '#9bbc0f' },
  blueprint: { bar: ['#0c3c75', '#f2f8fc'], accent: '#fde56f' },
  mondrian: { bar: ['#100f0d', '#fbfaf6'], accent: '#d01e1c' },
  human: { bar: ['#1e1e1e', '#ffffff'], accent: '#0a84ff', list: true },
})

/** The look's id, also kept on this device: index.html applies it before the first paint, like light or dark (D85). */
export const LOOK_KEY = 'app.look'

/** A known look's id, or the room's. @param {unknown} id @returns {LookId} */
export const lookId = (id) => (typeof id === 'string' && Object.hasOwn(LOOKS, id) ? /** @type {LookId} */ (id) : 'room')

/** Whether the user changed anything over the look. @param {Look} [look] */
export const touched = (look = {}) => [look.accent, look.background, look.size, look.font, look.css].some((value) => value !== undefined)
