// When Jean looks on its own while it watches, with no I/O (tested under node --test): once the scene has moved
// from what it last looked at and kept still a moment, as when a step is done, else every minute; never twice
// within a few seconds, and for ten minutes at most.

/** Fractions of the picture (0 to 1) and durations (ms). */
export const WATCH = Object.freeze({ moved: 0.04, still: 0.015, settleMs: 750, gapMs: 10_000, idleMs: 60_000, forMs: 600_000 })

/**
 * @param {number} start when watching began (ms)
 * @returns {(moved: number, step: number, now: number) => 'look' | 'end' | null} one call per sample: how far the scene is from
 *   the last look's, how far from the sample before, and when it is
 */
export function watcher(start, watch = WATCH) {
  let last = start
  /** @type {number | null} since when the scene has kept still */
  let still = null
  return (moved, step, now) => {
    if (now - start >= watch.forMs) return 'end'
    still = step <= watch.still ? still ?? now : null
    if (now - last < watch.gapMs) return null
    const settled = still !== null && now - still >= watch.settleMs
    if (!(moved >= watch.moved && settled) && now - last < watch.idleMs) return null
    last = now
    return 'look'
  }
}
