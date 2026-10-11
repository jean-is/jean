// Statistics for the evals: means and paired bootstrap intervals, seeded so a run repeats exactly.
import { rng } from './corpus.js'

/** @param {number[]} values */
export const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : NaN)

/**
 * A 95% interval of the mean of paired differences a − b, by resampling the pairs.
 * @param {number[]} a @param {number[]} b same length, same questions in the same order
 * @returns {{ mean: number, low: number, high: number, n: number }}
 */
export function pairedCI(a, b, resamples = 10000, seed = 1) {
  const d = a.map((value, i) => value - b[i])
  const n = d.length
  if (!n) return { mean: NaN, low: NaN, high: NaN, n }
  const r = rng(seed)
  const means = new Float64Array(resamples)
  for (let k = 0; k < resamples; k++) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += d[Math.floor(r() * n)]
    means[k] = sum / n
  }
  means.sort()
  return { mean: mean(d), low: means[Math.floor(resamples * 0.025)], high: means[Math.ceil(resamples * 0.975) - 1], n }
}

/** A 95% interval of a mean, by resampling. @param {number[]} values */
export function ci(values, resamples = 10000, seed = 1) {
  return pairedCI(values, values.map(() => 0), resamples, seed)
}

/** Percentiles of timings. @param {number[]} values @param {number} p 0–100 */
export function percentile(values, p) {
  const sorted = [...values].sort((x, y) => x - y)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1))]
}
