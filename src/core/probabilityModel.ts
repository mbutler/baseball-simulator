/**
 * @fileoverview Computes at-bat outcome probabilities from batter and pitcher stats.
 * @module core/probabilityModel
 */

/**
 * Computes the average of two numbers.
 * @param a - First number
 * @param b - Second number
 * @returns The average of a and b
 */
function avg(a: number, b: number): number {
    return (a + b) / 2;
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
export interface NormalizedBatter {
  name: string;
  player_id: string;
  PA: number;
  stats: {
    HBP: number;
    singles: number;
    doubles: number;
    triples: number;
  };
  rates: {
    kRate: number | null;
    bbRate: number | null;
    hrRate: number | null;
    BABIP: number | null;
  };
}

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
export interface NormalizedPitcher {
  name: string;
  player_id: string;
  TBF: number;
  stats: {
    HBP: number;
  };
  rates: {
    kRate: number | null;
    bbRate: number | null;
    hrRate: number | null;
    BABIP: number | null;
  };
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
  
    // Multiplicative model for rare events
    const K = clamp01(LEAGUE_K_RATE > 0 ? (kRateB * kRateP) / LEAGUE_K_RATE : 0, 'K');
    const BB = clamp01(LEAGUE_BB_RATE > 0 ? (bbRateB * bbRateP) / LEAGUE_BB_RATE : 0, 'BB');
    const HR = clamp01(LEAGUE_HR_RATE > 0 ? (hrRateB * hrRateP) / LEAGUE_HR_RATE : 0, 'HR');
    const BABIP = clamp01(avg(babipB, babipP), 'BABIP');
  
    const HBP_rate = clamp01(PA > 0 ? HBP / PA : 0, 'HBP');
  
    // Remove all non-ball-in-play outcomes from total
    const nonBIP = K + BB + HBP_rate + HR;
    const inPlay = Math.max(0, 1 - nonBIP);
  
    const hitRate = BABIP * inPlay;
    const outRate = inPlay - hitRate;
  
    const totalHits = singles + doubles + triples;
    const singleRate = totalHits > 0 ? singles / totalHits : 0.7;
    const doubleRate = totalHits > 0 ? doubles / totalHits : 0.2;
    const tripleRate = totalHits > 0 ? triples / totalHits : 0.1;
  
    // Clamp output probabilities
    const result: AtBatProbabilities = {
      K: clamp01(K, 'K'),
      BB: clamp01(BB, 'BB'),
      HBP: clamp01(HBP_rate, 'HBP'),
      HR: clamp01(HR, 'HR'),
      '1B': clamp01(hitRate * singleRate, '1B'),
      '2B': clamp01(hitRate * doubleRate, '2B'),
      '3B': clamp01(hitRate * tripleRate, '3B'),
      Out: clamp01(outRate, 'Out')
    };
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