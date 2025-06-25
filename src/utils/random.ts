/**
 * Pick a random key from an object weighted by values.
 * @param weights - Object with keys and their corresponding weights
 * @returns Randomly selected key based on weights
 */
export function randomWeightedChoice(weights: Record<string, number>): string {
    const total = Object.values(weights).reduce((sum, v) => sum + v, 0);
    let r = Math.random() * total;
    for (const [key, weight] of Object.entries(weights)) {
      if ((r -= weight) <= 0) return key;
    }
    return Object.keys(weights).pop() || '';
} 