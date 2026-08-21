/**
 * @fileoverview Turns count-state profiles into the two cards the tabletop game uses.
 * @module core/countCards
 *
 * The tabletop loop is two rolls:
 *
 *   Roll 1 (LEVERAGE)   Pitch card vs batter card -> which count bucket the PA
 *                       reaches: early contact / ahead / even / behind. No K,
 *                       no BB, no hit. Just who won the first two pitches.
 *
 *   Roll 2 (RESOLUTION) The batter's contact card, in the column that roll 1
 *                       selected, yields one of the eight outcomes. Strikeouts
 *                       and walks live here, emerging from the count rather
 *                       than being printed as flat season rates.
 *
 * Both stages reuse the existing log5 + empirical-Bayes machinery, so a card is
 * the same math the digital sim runs, just conditioned on the count.
 */

import { log5, regressRate } from './probabilityModel.js';
import type { AtBatProbabilities } from './probabilityModel.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';

export const BUCKETS = ['early', 'ahead', 'even', 'behind'] as const;
export type Bucket = (typeof BUCKETS)[number];
export const OUTCOMES = ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Batted-ball classes for the out-type line, in printed order. */
export const OUT_TYPES = ['GB', 'FB', 'LD', 'POP'] as const;
export type OutType = (typeof OUT_TYPES)[number];

/** Raw tallies as written by buildCountProfiles.ts. */
export interface Tally {
  PA: number; buckets: number[]; outcomes: number[][];
  /** Absent in profile files built before batted-ball data was fetched. */
  outTypes?: number[];
}
export interface CountProfiles {
  metadata: Record<string, unknown>;
  league: Tally;
  batters: Record<string, Tally>;
  pitchers: Record<string, Tally>;
}

/**
 * Pseudo-counts. Leverage is observed once per PA so it matches PRIOR_PA;
 * a single bucket column holds far fewer PA, so it is regressed harder.
 */
export const PRIOR_LEVERAGE = 100;
export const PRIOR_RESOLUTION = 60;
/** Out types are observed only on balls in play, so a full season is a few hundred. */
export const PRIOR_OUT_TYPE = 120;

export interface CountCards {
  /** Roll 1: P(bucket). Sums to 1. */
  leverage: Record<Bucket, number>;
  /** Roll 2: P(outcome | bucket). Each column sums to 1. */
  resolution: Record<Bucket, AtBatProbabilities>;
  /** Marginal P(outcome) implied by the two cards — for calibration checks. */
  blended: AtBatProbabilities;
}

const normalize = (xs: number[]): number[] => {
  const total = xs.reduce((a, b) => a + b, 0);
  return total > 0 ? xs.map(x => x / total) : xs.map(() => 1 / xs.length);
};

/** Row of shrunk rates for one tally against a league row. */
function shrunkRow(counts: number[], n: number, leagueRow: number[], prior: number): number[] {
  return counts.map((c, i) =>
    regressRate(n > 0 ? c / n : null, n, leagueRow[i], prior)
  );
}

/**
 * Combine a batter profile and a pitcher profile into the two printable cards.
 *
 * @param batterTally - Batter's count tally, or null to use league (generic card)
 * @param pitcherTally - Pitcher's count tally, or null to use league
 * @param profiles - The full profile file, for league anchors
 */
export function getCountCards(
  batterTally: Tally | null,
  pitcherTally: Tally | null,
  profiles: CountProfiles
): CountCards {
  const L = profiles.league;
  const leagueLeverage = normalize(L.buckets);

  // --- Roll 1: leverage ---
  const bLev = shrunkRow(
    batterTally?.buckets ?? L.buckets, batterTally?.PA ?? 0, leagueLeverage, PRIOR_LEVERAGE);
  const pLev = shrunkRow(
    pitcherTally?.buckets ?? L.buckets, pitcherTally?.PA ?? 0, leagueLeverage, PRIOR_LEVERAGE);
  const leverage = normalize(
    BUCKETS.map((_, i) => log5(bLev[i], pLev[i], leagueLeverage[i])));

  // --- Roll 2: resolution, one column per bucket ---
  const resolution = {} as Record<Bucket, AtBatProbabilities>;
  BUCKETS.forEach((bucket, bi) => {
    const leagueCol = normalize(L.outcomes[bi]);
    const bN = batterTally?.buckets[bi] ?? 0;
    const pN = pitcherTally?.buckets[bi] ?? 0;
    const bRow = shrunkRow(batterTally?.outcomes[bi] ?? L.outcomes[bi], bN, leagueCol, PRIOR_RESOLUTION);
    const pRow = shrunkRow(pitcherTally?.outcomes[bi] ?? L.outcomes[bi], pN, leagueCol, PRIOR_RESOLUTION);
    const combined = normalize(
      OUTCOMES.map((_, oi) => log5(bRow[oi], pRow[oi], leagueCol[oi])));
    resolution[bucket] = Object.fromEntries(
      OUTCOMES.map((o, oi) => [o, combined[oi]])) as unknown as AtBatProbabilities;
  });

  // --- Marginal implied by the two cards ---
  const blended = Object.fromEntries(OUTCOMES.map(o => [o, 0])) as unknown as AtBatProbabilities;
  BUCKETS.forEach((bucket, bi) => {
    for (const o of OUTCOMES) {
      blended[o] += leverage[bi] * resolution[bucket][o];
    }
  });

  return {
    leverage: Object.fromEntries(BUCKETS.map((b, i) => [b, leverage[i]])) as Record<Bucket, number>,
    resolution,
    blended
  };
}

/**
 * The batter's out-type mix, shrunk toward league and combined with the pitcher's
 * the same way everything else is. Groundball pitchers are real, so the pitcher
 * belongs here; pass null for the generic card.
 *
 * Returns null when the profile file predates batted-ball data, so callers can
 * print the league line rather than silently inventing a personal one.
 */
export function getOutTypes(
  batterTally: Tally | null,
  pitcherTally: Tally | null,
  profiles: CountProfiles
): number[] | null {
  const lg = profiles.league.outTypes;
  if (!lg || lg.reduce((a, b) => a + b, 0) === 0) return null;
  const leagueRow = normalize(lg);
  const row = (t: Tally | null): number[] => {
    const counts = t?.outTypes;
    const n = counts ? counts.reduce((a, b) => a + b, 0) : 0;
    return shrunkRow(counts ?? lg, n, leagueRow, PRIOR_OUT_TYPE);
  };
  const b = row(batterTally), p = row(pitcherTally);
  return normalize(OUT_TYPES.map((_, i) => log5(b[i], p[i], leagueRow[i])));
}

/** Look up a player's tally by the `<player_id>|<TEAM>` key the profile file uses. */
export function tallyFor(
  profiles: CountProfiles,
  side: 'batters' | 'pitchers',
  playerId: string,
  team: string
): Tally | null {
  return profiles[side][`${playerId}|${team}`] ?? null;
}

/** The batter's declared approach on the resolution roll. See §7.9 of the count-game design. */
export type Approach = 'protect' | 'deadRed';

/**
 * Linear weights, used for one purpose only: holding the two approaches at equal
 * value so neither is strictly better. K and Out are both zero, which is exactly
 * why the choice stays live at the table — the situational worth of a ball in
 * play is the thing these weights cannot see.
 */
const APPROACH_WEIGHTS: Record<Outcome, number> = {
  K: 0, BB: 0.69, HBP: 0.72, HR: 2.10, '1B': 0.89, '2B': 1.27, '3B': 1.62, Out: 0
};

/**
 * Fixed "flavour" rates per approach. Power is deliberately absent: it is solved
 * per column rather than printed, because a fixed power multiplier cannot hit
 * neutrality in every column without draining an outcome to zero.
 */
export const APPROACH_SHAPE: Record<Approach, { K: number; BB: number; '1B': number }> = {
  protect: { K: 0.80, BB: 1.00, '1B': 1.08 },
  deadRed: { K: 1.20, BB: 0.88, '1B': 0.85 }
};

const wobaOf = (r: AtBatProbabilities): number =>
  OUTCOMES.reduce((a, o) => a + r[o] * APPROACH_WEIGHTS[o], 0);

/**
 * Recast one resolution column for a declared approach.
 *
 * K, BB and 1B move by the fixed rates above; the power outcomes (HR/3B/2B) are
 * scaled by a solved factor and Out absorbs the mass balance. The factor is
 * bisected so the column's value exactly matches the neutral column's — if either
 * approach were better in a vacuum it would not be a decision, it would be the
 * correct answer printed on a card.
 *
 * @param base - The neutral column for one bucket
 * @param approach - protect (contact, low variance) or deadRed (power, high variance)
 * @returns A column summing to 1, equal in value to `base`
 */
export function applyApproach(base: AtBatProbabilities, approach: Approach): AtBatProbabilities {
  const shape = APPROACH_SHAPE[approach];
  const target = wobaOf(base);

  const build = (power: number): AtBatProbabilities => {
    const r = {} as AtBatProbabilities;
    r.K = base.K * shape.K;
    r.BB = base.BB * shape.BB;
    r['1B'] = base['1B'] * shape['1B'];
    r.HBP = base.HBP;
    for (const o of ['HR', '3B', '2B'] as const) r[o] = base[o] * power;
    const used = OUTCOMES.filter(o => o !== 'Out').reduce((a, o) => a + r[o], 0);
    r.Out = Math.max(0, 1 - used);
    const total = OUTCOMES.reduce((a, o) => a + r[o], 0);
    for (const o of OUTCOMES) r[o] /= total;
    return r;
  };

  // Value rises monotonically with the power scale, so a plain bisection is safe.
  let lo = 0.05, hi = 4;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (wobaOf(build(mid)) > target) hi = mid; else lo = mid;
  }
  return build((lo + hi) / 2);
}

/** Fallback when the profile file predates batted-ball data. */
export const LEAGUE_OUT_TYPE_LINE = '0-4 GB · 5-7 FB · 8 LD · 9 POP';

/**
 * The ones digit of the resolution roll, split into batted-ball classes — a layer
 * that costs no extra die because the digit was already rolled.
 *
 * Two grounder boxes are special, and both degrade to ordinary grounders when
 * their conditions do not apply, so the basic game never notices them:
 *
 *   DP    a grounder that is a double play, if a runner is on first with
 *         fewer than two out
 *   THRU  a grounder that gets through for a single with the infield IN, and
 *         is an ordinary out with the infield BACK
 *
 * THRU is what makes the defensive declaration matter: the same box means
 * different things depending on what the fielding manager said, which is a
 * decision rather than a lookup. A sub-roll could not do this — the digit is
 * already spent naming the batted-ball type, so re-reading it for a second
 * question would correlate the two badly.
 */
export function outTypeLine(dist: number[] | null): string {
  if (!dist) return LEAGUE_OUT_TYPE_LINE;
  const raw = dist.map(v => v * 10);
  const n = raw.map(Math.floor);
  const short = 10 - n.reduce((a, b) => a + b, 0);
  raw.map((v, i) => ({ i, f: v - n[i] })).sort((a, b) => b.f - a.f)
    .slice(0, Math.max(0, short)).forEach(({ i }) => n[i]++);

  const gb = n[0];
  const dp = gb >= 2 ? 1 : 0;
  const thru = gb >= 3 ? 1 : 0;
  const plain = gb - dp - thru;

  const parts: string[] = [];
  let lo = 0;
  const push = (count: number, label: string) => {
    if (count <= 0) return;
    const hi = lo + count - 1;
    parts.push(`${lo === hi ? lo : `${lo}-${hi}`} ${label}`);
    lo = hi + 1;
  };
  // Labels must not contain the separator: 'GB·DP' beside ' · ' is ambiguous to
  // read and to parse. DP and THRU are grounders; the fielding page says so.
  push(dp, 'DP');
  push(plain, 'GB');
  push(thru, 'THRU');
  for (let i = 1; i < OUT_TYPES.length; i++) push(n[i], OUT_TYPES[i]);
  return parts.join(' · ');
}
