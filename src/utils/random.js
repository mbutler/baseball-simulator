/**
 * Pick a random key from an object weighted by values.
 * @param {Record<string, number>} weights
 * @returns {string}
 */
export function randomWeightedChoice(weights) {
    const total = Object.values(weights).reduce((sum, v) => sum + v, 0)
    let r = Math.random() * total
    for (const [key, weight] of Object.entries(weights)) {
      if ((r -= weight) <= 0) return key
    }
    return Object.keys(weights).pop() || '';
  }