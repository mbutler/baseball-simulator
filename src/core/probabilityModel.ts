/**
 * @fileoverview Computes at-bat outcome probabilities from batter and pitcher stats.
 * @module core/probabilityModel
 */

import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';

/**
 * Log5 formula: combines batter and pitcher rates using league average as baseline.
 * P(matchup) = (P_b * P_p / P_L) / (P_b * P_p / P_L + (1-P_b)*(1-P_p)/(1-P_L))
 * @param rateB - Batter's rate (e.g. K/PA)
 * @param rateP - Pitcher's rate (e.g. K/TBF)
 * @param rateL - League average rate
 * @returns Matchup probability
 */
function log5(rateB: number, rateP: number, rateL: number): number {
  if (rateL <= 0 || rateL >= 1) return (rateB + rateP) / 2; // fallback if invalid league
  const num = (rateB * rateP) / rateL;
  const den = (1 - rateB) * (1 - rateP) / (1 - rateL);
  const p = num / (num + den);
  return Math.max(0, Math.min(1, p));
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

export interface AtBatSituation {
  risp?: boolean;
  late?: boolean;
  twoOuts?: boolean;
}

export const LEAGUE_K_RATE = 0.22;
export const LEAGUE_BB_RATE = 0.08;
export const LEAGUE_HR_RATE = 0.03;
export const LEAGUE_HBP_RATE = 0.01;
export const LEAGUE_BABIP = 0.29;
export const LEAGUE_ERR_RATE = 0.012; // ~.988 fielding percentage

/** Pseudo-counts for empirical-Bayes shrinkage. About 100 PA / 80 BIP / 80 chances. */
export const PRIOR_PA = 100;
export const PRIOR_TBF = 100;
export const PRIOR_BIP = 80;
export const PRIOR_HITS = 30;
export const PRIOR_CHANCES = 80;

/**
 * Shrink an observed rate toward a league mean. Tiny samples (including 0-for-N)
 * move close to league; full-season samples stay close to the observed rate.
 */
export function regressRate(
  observed: number | null | undefined,
  n: number,
  league: number,
  priorN: number
): number {
  if (observed == null || Number.isNaN(observed) || !(n > 0)) return league;
  return (observed * n + league * priorN) / (n + priorN);
}

/**
 * Given a normalized batter and pitcher, compute the at-bat outcome probabilities.
 * @param batter - A normalized batter object
 * @param pitcher - A normalized pitcher object
 * @param situation - Optional situation for situational hitting adjustments
 * @returns Map of outcome → probability. Keys: 'K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'
 */
export function getAtBatProbabilities(
  batter: NormalizedBatter,
  pitcher: NormalizedPitcher,
  situation?: AtBatSituation
): AtBatProbabilities {
  const bRates = batter.rates || {};
  const pRates = pitcher.rates || {};
  const bStats = batter.stats || {};
  const pStats = pitcher.stats || {};

  const PA = Math.max(0, batter.PA || 0);
  const TBF = Math.max(0, pitcher.TBF || 0);
  const HBP = Math.max(0, bStats.HBP ?? 0);
  const singles = Math.max(0, bStats.singles ?? 0);
  const doubles = Math.max(0, bStats.doubles ?? 0);
  const triples = Math.max(0, bStats.triples ?? 0);
  const pitcherHBP = Math.max(0, pStats.HBP ?? 0);

  const kRateB = clamp01(regressRate(bRates.kRate, PA, LEAGUE_K_RATE, PRIOR_PA), 'batter.kRate');
  const kRateP = clamp01(regressRate(pRates.kRate, TBF, LEAGUE_K_RATE, PRIOR_TBF), 'pitcher.kRate');
  const bbRateB = clamp01(regressRate(bRates.bbRate, PA, LEAGUE_BB_RATE, PRIOR_PA), 'batter.bbRate');
  const bbRateP = clamp01(regressRate(pRates.bbRate, TBF, LEAGUE_BB_RATE, PRIOR_TBF), 'pitcher.bbRate');
  const hrRateB = clamp01(regressRate(bRates.hrRate, PA, LEAGUE_HR_RATE, PRIOR_PA), 'batter.hrRate');
  const hrRateP = clamp01(regressRate(pRates.hrRate, TBF, LEAGUE_HR_RATE, PRIOR_TBF), 'pitcher.hrRate');

  const bipB = Math.max(0, PA - (bStats.BB ?? 0) - (bStats.HBP ?? 0) - (bStats.SO ?? 0) - (bStats.HR ?? 0));
  const bipP = Math.max(0, TBF - (pStats.BB ?? 0) - (pStats.SO ?? 0) - (pStats.HR ?? 0) - pitcherHBP);
  const babipB = clamp01(regressRate(bRates.BABIP, bipB, LEAGUE_BABIP, PRIOR_BIP), 'batter.BABIP');
  const babipP = clamp01(regressRate(pRates.BABIP, bipP, LEAGUE_BABIP, PRIOR_BIP), 'pitcher.BABIP');

  const hbpRateP = clamp01(regressRate(TBF > 0 ? pitcherHBP / TBF : null, TBF, LEAGUE_HBP_RATE, PRIOR_TBF), 'pitcherHBP');
  const hbpRateB = clamp01(regressRate(PA > 0 ? HBP / PA : null, PA, LEAGUE_HBP_RATE, PRIOR_PA), 'batterHBP');

  // 1. Assign K, BB, HBP, HR rates using log5 (batter vs pitcher matchup)
  let K = log5(kRateB, kRateP, LEAGUE_K_RATE);
  let BB = log5(bbRateB, bbRateP, LEAGUE_BB_RATE);
  let HBP_rate = log5(hbpRateB, hbpRateP, LEAGUE_HBP_RATE);
  let HR = log5(hrRateB, hrRateP, LEAGUE_HR_RATE);

  // 2. Compute balls in play (BIP)
  let nonBIP = K + BB + HBP_rate + HR;
  let BIP = Math.max(0, 1 - nonBIP);

  // 3. Use log5 for BABIP; clamp to [0.24, 0.40] to keep results realistic while
  // still allowing meaningful separation between contact-quality profiles.
  let BABIP = Math.max(0.24, Math.min(0.40, log5(babipB, babipP, LEAGUE_BABIP)));
  let hitsInPlay = BABIP * BIP;
  let outsInPlay = BIP - hitsInPlay;

  // 4. Assign hit types: batter mix shrunk toward league 75/20/5 so a 0-triple
  // week of April does not become a true 0% triple rate.
  const totalNonHR = singles + doubles + triples;
  let singleRate = regressRate(totalNonHR > 0 ? singles / totalNonHR : null, totalNonHR, 0.75, PRIOR_HITS);
  let doubleRate = regressRate(totalNonHR > 0 ? doubles / totalNonHR : null, totalNonHR, 0.20, PRIOR_HITS);
  let tripleRate = regressRate(totalNonHR > 0 ? triples / totalNonHR : null, totalNonHR, 0.05, PRIOR_HITS);
  const hitMix = singleRate + doubleRate + tripleRate;
  if (hitMix > 0) {
    singleRate /= hitMix;
    doubleRate /= hitMix;
    tripleRate /= hitMix;
  }
  let oneB = hitsInPlay * singleRate;
  let twoB = hitsInPlay * doubleRate;
  let threeB = hitsInPlay * tripleRate;

  // --- Situational Adjustments ---
  if (situation) {
    // RISP: slightly higher BABIP. Late & Close: more walks and strikeouts.
    // Two outs: slightly lower BABIP.
    if (situation.risp) BABIP += 0.01; // +10 points of BABIP
    if (situation.late) { BB *= 1.10; K *= 1.05; }
    if (situation.twoOuts) BABIP -= 0.01; // -10 points of BABIP

    // Recompute hits after BABIP changes.
    hitsInPlay = Math.max(0, Math.min(1, BABIP)) * BIP;
    outsInPlay = BIP - hitsInPlay;
    oneB = hitsInPlay * singleRate;
    twoB = hitsInPlay * doubleRate;
    threeB = hitsInPlay * tripleRate;

    // RISP doubles bump: shift a little single share into doubles AFTER the
    // recompute above (previously this was overwritten and had no effect).
    // Keeping total hits constant so it doesn't inflate the run environment.
    if (situation.risp) {
      const boost = twoB * 0.10;
      twoB += boost;
      oneB = Math.max(0, oneB - boost);
    }
  }

  // 5. Cap the reach-base rate so the total out rate stays MLB-realistic.
  // IMPORTANT: strikeouts are OUTS, so they are NOT part of the reach bucket.
  // Only on-base/scoring events (BB, HBP, HR, 1B, 2B, 3B) are scaled; batted-ball
  // outs then absorb whatever is left after K and reach events. This keeps total
  // outs (K + Out) near the MLB ~68% and preserves separation between hitters.
  // MLB 2024: OBP ~.315, so reach ~32% and outs ~68% of PA.
  const maxReachRate = 0.38; // cap on combined BB+HBP+HR+1B+2B+3B
  let reachSum = BB + HBP_rate + HR + oneB + twoB + threeB;
  if (reachSum > maxReachRate) {
    const scale = maxReachRate / reachSum;
    BB *= scale;
    HBP_rate *= scale;
    HR *= scale;
    oneB *= scale;
    twoB *= scale;
    threeB *= scale;
    reachSum = maxReachRate;
  }
  // Batted-ball outs are the remainder after strikeouts and reach events.
  outsInPlay = Math.max(0, 1 - K - reachSum);

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