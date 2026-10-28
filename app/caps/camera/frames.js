// What the camera's frames are worth, with no I/O (tested under node --test): how sharp one is, how far the scene
// moved from another, and the sharpest of the last few, which goes with what the user says, since a phone held in
// the hand shakes. Every loop stays within its array: JavaScriptCore slows down on a read past the end.

/** The luma of RGBA pixels, a byte each (Rec. 601). @param {Uint8ClampedArray} rgba @returns {Uint8Array} */
export function luma(rgba) {
  const grey = new Uint8Array(rgba.length >> 2)
  for (let i = 0; i < grey.length; i++) grey[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8
  return grey
}

/** How sharp a picture is: the variance of its Laplacian, higher for crisp edges. @param {Uint8Array} grey @param {number} width */
export function sharpness(grey, width) {
  const height = Math.floor(grey.length / width)
  let sum = 0, squares = 0, count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const edge = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i]
      sum += edge
      squares += edge * edge
      count++
    }
  }
  return count ? squares / count - (sum / count) ** 2 : 0
}

/** How far one scene is from another of the same size, from 0 to 1: the mean difference of their pixels. @param {Uint8Array} a @param {Uint8Array} b */
export function difference(a, b) {
  if (a.length !== b.length || !a.length) return 1
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i])
  return total / a.length / 255
}

/** The sharpest of the frames kept, the latest of two alike. @template T @param {{ frame: T, sharpness: number }[]} kept @returns {T | undefined} */
export const sharpest = (kept) => kept.reduce((best, one) => (one.sharpness >= best.sharpness ? one : best), kept[0])?.frame
