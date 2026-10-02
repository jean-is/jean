// Looks (D111): Jean's own room, or another style sheet over it (ui/looks/<id>.css). The user's
// touches over a look are ui/touches.js, loaded once there are some.

/** @typedef {import('../core/settings.js').Look} Look */

/**
 * Each look, with what the page needs before its style sheet says it: the browser bar's colour
 * by night and by day, and its accent, where the colour pickers start. Mail keeps the
 * conversations in view, beside the one open (`list`).
 */
/** @type {Readonly<Record<'room' | 'mail' | 'paper', { bar: [string, string], accent: string, list?: boolean }>>} */
export const LOOKS = Object.freeze({
  room: { bar: ['#120c08', '#fbf6ee'], accent: '#f29d38' },
  mail: { bar: ['#060708', '#f4f5f7'], accent: '#3d82f6', list: true },
  paper: { bar: ['#211e1a', '#faf7f0'], accent: '#b23a2a' },
})

/** @typedef {keyof typeof LOOKS} LookId */

/** The look's id, also kept on this device: index.html applies it before the first paint, like light or dark (D85). */
export const LOOK_KEY = 'app.look'

/** A known look's id, or the room's. @param {unknown} id @returns {LookId} */
export const lookId = (id) => (typeof id === 'string' && Object.hasOwn(LOOKS, id) ? /** @type {LookId} */ (id) : 'room')

/** Whether the user changed anything over the look. @param {Look} [look] */
export const touched = (look = {}) => [look.accent, look.background, look.size, look.font, look.css].some((value) => value !== undefined)
