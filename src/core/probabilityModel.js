/**
 * @fileoverview Computes at-bat outcome probabilities from batter and pitcher stats.
 * @module core/probabilityModel
 */

/**
 * Computes the average of two numbers.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} The average of a and b
 */
function avg(a, b) {
    return (a + b) / 2
  }
  
/**
 * @typedef {Object} NormalizedBatter
 * @property {string} name
 * @property {string} player_id
 * @property {number} PA
 * @property {Object} stats
 * @property {number} stats.HBP
 * @property {number} stats.singles
 * @property {number} stats.doubles
 * @property {number} stats.triples
 * @property {Object} rates
 * @property {number} rates.kRate
 * @property {number} rates.bbRate
 * @property {number} rates.hrRate
 * @property {number} rates.BABIP
 */

/**
 * @typedef {Object} NormalizedPitcher
 * @property {string} name
 * @property {string} player_id
 * @property {number} TBF
 * @property {Object} stats
 * @property {number} stats.HBP
 * @property {Object} rates
 * @property {number} rates.kRate
 * @property {number} rates.bbRate
 * @property {number} rates.hrRate
 * @property {number} rates.BABIP
 */

/**
 * Given a normalized batter and pitcher, compute the at-bat outcome probabilities.
 * @param {NormalizedBatter} batter - A normalized batter object
 * @param {NormalizedPitcher} pitcher - A normalized pitcher object
 * @returns {Object} Map of outcome → probability. Keys: 'K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'
 */
export function getAtBatProbabilities(batter, pitcher) {
    const bRates = batter.rates || {}
    const pRates = pitcher.rates || {}
    const bStats = batter.stats || {}
  
    // Clamp all input rates
    const kRateB = clamp01(bRates.kRate ?? 0, 'batter.kRate')
    const kRateP = clamp01(pRates.kRate ?? 0, 'pitcher.kRate')
    const bbRateB = clamp01(bRates.bbRate ?? 0, 'batter.bbRate')
    const bbRateP = clamp01(pRates.bbRate ?? 0, 'pitcher.bbRate')
    const hrRateB = clamp01(bRates.hrRate ?? 0, 'batter.hrRate')
    const hrRateP = clamp01(pRates.hrRate ?? 0, 'pitcher.hrRate')
    const babipB = clamp01(bRates.BABIP ?? 0.29, 'batter.BABIP')
    const babipP = clamp01(pRates.BABIP ?? 0.29, 'pitcher.BABIP')
  
    // Clamp stats
    const PA = Math.max(0, batter.PA || 0)
    const HBP = Math.max(0, bStats.HBP ?? 0)
    const singles = Math.max(0, bStats.singles ?? 0)
    const doubles = Math.max(0, bStats.doubles ?? 0)
    const triples = Math.max(0, bStats.triples ?? 0)
  
    const K = clamp01(avg(kRateB, kRateP), 'K')
    const BB = clamp01(avg(bbRateB, bbRateP), 'BB')
    const HR = clamp01(avg(hrRateB, hrRateP), 'HR')
    const BABIP = clamp01(avg(babipB, babipP), 'BABIP')
  
    const HBP_rate = clamp01(PA > 0 ? HBP / PA : 0, 'HBP')
  
    // Remove all non-ball-in-play outcomes from total
    const nonBIP = K + BB + HBP_rate + HR
    const inPlay = Math.max(0, 1 - nonBIP)
  
    const hitRate = BABIP * inPlay
    const outRate = inPlay - hitRate
  
    const totalHits = singles + doubles + triples
    const singleRate = totalHits > 0 ? singles / totalHits : 0.7
    const doubleRate = totalHits > 0 ? doubles / totalHits : 0.2
    const tripleRate = totalHits > 0 ? triples / totalHits : 0.1
  
    // Clamp output probabilities
    const result = {
      K: clamp01(K, 'K'),
      BB: clamp01(BB, 'BB'),
      HBP: clamp01(HBP_rate, 'HBP'),
      HR: clamp01(HR, 'HR'),
      '1B': clamp01(hitRate * singleRate, '1B'),
      '2B': clamp01(hitRate * doubleRate, '2B'),
      '3B': clamp01(hitRate * tripleRate, '3B'),
      Out: clamp01(outRate, 'Out')
    }
    return result;
  }
  
/**
 * Clamp a value to the range [0, 1]. Logs a warning if clamping occurs.
 * @param {number} x - Value to clamp
 * @param {string} [label] - Optional label for logging
 * @returns {number} Clamped value
 */
function clamp01(x, label) {
  if (typeof x !== 'number' || isNaN(x)) return 0;
  if (x < 0) {
    if (label) console.warn(`[probabilityModel] Clamped negative value for ${label}: ${x} → 0`);
    return 0;
  }
  if (x > 1) {
    if (label) console.warn(`[probabilityModel] Clamped value >1 for ${label}: ${x} → 1`);
    return 1;
  }
  return x;
}
  