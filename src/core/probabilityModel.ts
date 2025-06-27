/**
 * @fileoverview Computes at-bat outcome probabilities from batter and pitcher stats.
 * @module core/probabilityModel
 */

import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';

/**
 * Computes the average of two numbers.
 * @param a - First number
 * @param b - Second number
 * @returns The average of a and b
 */
function avg(a: number, b: number): number {
    return (a + b) / 2;
}

export interface AtBatProbabilities {
  K: number;
  BB: number;
  HBP: number;
  HR: number;
  '1B': number;
  '2B': number;
  '3B': number;
  Out: number;
}

function safeRate(rate: number | null | undefined, fallback: number): number {
  return rate == null || isNaN(rate) || rate === 0 ? fallback : rate;
}

const LEAGUE_K_RATE = 0.22; // MLB average K/PA
const LEAGUE_BB_RATE = 0.08; // MLB average BB/PA
const LEAGUE_HR_RATE = 0.03; // MLB average HR/PA

/**
 * Given a normalized batter and pitcher, compute the at-bat outcome probabilities.
 * @param batter - A normalized batter object
 * @param pitcher - A normalized pitcher object
 * @returns Map of outcome → probability. Keys: 'K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'
 */
export function getAtBatProbabilities(batter: NormalizedBatter, pitcher: NormalizedPitcher): AtBatProbabilities {
    const bRates = batter.rates || {};
    const pRates = pitcher.rates || {};
    const bStats = batter.stats || {};
  
    // Clamp all input rates, using league average if missing or zero
    const kRateB = clamp01(safeRate(bRates.kRate, LEAGUE_K_RATE), 'batter.kRate');
    const kRateP = clamp01(safeRate(pRates.kRate, LEAGUE_K_RATE), 'pitcher.kRate');
    const bbRateB = clamp01(safeRate(bRates.bbRate, LEAGUE_BB_RATE), 'batter.bbRate');
    const bbRateP = clamp01(safeRate(pRates.bbRate, LEAGUE_BB_RATE), 'pitcher.bbRate');
    const hrRateB = clamp01(safeRate(bRates.hrRate, LEAGUE_HR_RATE), 'batter.hrRate');
    const hrRateP = clamp01(safeRate(pRates.hrRate, LEAGUE_HR_RATE), 'pitcher.hrRate');
    const babipB = clamp01(bRates.BABIP ?? 0.29, 'batter.BABIP');
    const babipP = clamp01(pRates.BABIP ?? 0.29, 'pitcher.BABIP');
  
    // Clamp stats
    const PA = Math.max(0, batter.PA || 0);
    const HBP = Math.max(0, bStats.HBP ?? 0);
    const singles = Math.max(0, bStats.singles ?? 0);
    const doubles = Math.max(0, bStats.doubles ?? 0);
    const triples = Math.max(0, bStats.triples ?? 0);
  
    // 1. Assign K, BB, HBP, HR rates (average of batter and pitcher)
    let K = avg(kRateB, kRateP);
    let BB = avg(bbRateB, bbRateP);
    let HBP_rate = PA > 0 ? HBP / PA : 0.01;
    let HR = avg(hrRateB, hrRateP);
  
    // 2. Compute balls in play (BIP)
    let nonBIP = K + BB + HBP_rate + HR;
    let BIP = Math.max(0, 1 - nonBIP);
  
    // 3. Use league BABIP to determine hits on BIP
    // Use average of batter and pitcher BABIP, but clamp to [0.27, 0.33] for realism
    const BABIP = Math.max(0.27, Math.min(0.33, avg(babipB, babipP)));
    let hitsInPlay = BABIP * BIP;
    let outsInPlay = BIP - hitsInPlay;
  
    // 4. Assign hit types using MLB splits (2023: 1B ~75%, 2B ~20%, 3B ~5% of non-HR hits)
    const singleRate = 0.75;
    const doubleRate = 0.20;
    const tripleRate = 0.05;
    let oneB = hitsInPlay * singleRate;
    let twoB = hitsInPlay * doubleRate;
    let threeB = hitsInPlay * tripleRate;
  
    // 5. Scale down non-out events if needed to ensure outs are at least 60–65%
    let nonOutSum = K + BB + HBP_rate + HR + oneB + twoB + threeB;
    const minOutRate = 0.58; // 58% outs, 42% non-outs (more realistic offense)
    if (nonOutSum > 1 - minOutRate) {
      const scale = (1 - minOutRate) / nonOutSum;
      K *= scale;
      BB *= scale;
      HBP_rate *= scale;
      HR *= scale;
      oneB *= scale;
      twoB *= scale;
      threeB *= scale;
      // Recompute outs
      outsInPlay = 1 - (K + BB + HBP_rate + HR + oneB + twoB + threeB);
    }
  
    // 6. Clamp and normalize
    let result: AtBatProbabilities = {
      K: clamp01(K, 'K'),
      BB: clamp01(BB, 'BB'),
      HBP: clamp01(HBP_rate, 'HBP'),
      HR: clamp01(HR, 'HR'),
      '1B': clamp01(oneB, '1B'),
      '2B': clamp01(twoB, '2B'),
      '3B': clamp01(threeB, '3B'),
      Out: clamp01(outsInPlay, 'Out')
    };
    // Normalize to sum to 1.0
    const total = Object.values(result).reduce((sum, prob) => sum + prob, 0);
    if (total > 0) {
      Object.keys(result).forEach(key => {
        result[key as keyof AtBatProbabilities] = result[key as keyof AtBatProbabilities] / total;
      });
    }
    return result;
}

/**
 * Clamp a value to the range [0, 1]. Logs a warning if clamping occurs.
 * @param x - Value to clamp
 * @param label - Optional label for logging
 * @returns Clamped value
 */
function clamp01(x: number, label?: string): number {
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