/**
 * @fileoverview Computes at-bat outcome probabilities from batter and pitcher stats.
 */

/**
 * Computes the average of two numbers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function avg(a, b) {
    return (a + b) / 2
  }
  
  /**
   * Given a normalized batter and pitcher, compute the at-bat outcome probabilities.
   * @param {object} batter - A normalized batter object
   * @param {object} pitcher - A normalized pitcher object
   * @returns {object} Map of outcome → probability
   */
  export function getAtBatProbabilities(batter, pitcher) {
    const bRates = batter.rates || {}
    const pRates = pitcher.rates || {}
    const bStats = batter.stats || {}
  
    const K = avg(bRates.kRate ?? 0, pRates.kRate ?? 0)
    const BB = avg(bRates.bbRate ?? 0, pRates.bbRate ?? 0)
    const HR = avg(bRates.hrRate ?? 0, pRates.hrRate ?? 0)
    const BABIP = avg(bRates.BABIP ?? 0.29, pRates.BABIP ?? 0.29)
  
    const HBP = (bStats.HBP ?? 0) / (batter.PA || 1)
  
    // Remove all non-ball-in-play outcomes from total
    const nonBIP = K + BB + HBP + HR
    const inPlay = Math.max(0, 1 - nonBIP)
  
    const hitRate = BABIP * inPlay
    const outRate = inPlay - hitRate
  
    const totalHits = (bStats.singles ?? 0) + (bStats.doubles ?? 0) + (bStats.triples ?? 0)
    const singleRate = totalHits > 0 ? (bStats.singles ?? 0) / totalHits : 0.7
    const doubleRate = totalHits > 0 ? (bStats.doubles ?? 0) / totalHits : 0.2
    const tripleRate = totalHits > 0 ? (bStats.triples ?? 0) / totalHits : 0.1
  
    return {
      K,
      BB,
      HBP,
      HR,
      '1B': hitRate * singleRate,
      '2B': hitRate * doubleRate,
      '3B': hitRate * tripleRate,
      Out: outRate
    }
  }
  