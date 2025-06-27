/**
 * @fileoverview Minimal turn-by-turn baseball game simulation engine.
 * @module core/gameEngine
 */

import { randomWeightedChoice } from '../utils/random.js';
import { describeOutcome } from '../utils/describeOutcome.js';
import type { Matchup, Roster } from './matchupPreparer.js';
import type { NormalizedBatter } from '../types/baseball.js';
import type { NormalizedBatter as StatNormalizedBatter } from '../types/baseball.js';
import { getAtBatProbabilities } from './probabilityModel.js';
import type { AtBatSituation } from './probabilityModel.js';

/**
 * @typedef {Object} GameState
 * @property {number} inning - Current inning (1-based)
 * @property {boolean} top - True if top half, false if bottom
 * @property {number} outs - Number of outs in current half-inning
 * @property {BasePlayer[]} bases - Array of 3 players, representing runners on 1B, 2B, 3B (null if empty)
 * @property {number[]} lineupIndices - Current batter index for each team ([away, home])
 * @property {number[]} score - Current score ([away, home])
 * @property {{ battersFaced: number }[]} pitcherFatigue - Array tracking batters faced for each pitcher ([away, home])
 */
export interface GameState {
  inning: number;
  top: boolean;
  outs: number;
  bases: (BasePlayer | null)[];
  lineupIndices: number[];
  score: number[];
  pitcherFatigue: { battersFaced: number }[];
}

/**
 * @typedef {Object} Fielder
 * @property {string} position
 * @property {Record<string, number>} stats
 */
export interface Fielder {
  position: string;
  stats: Record<string, number>;
}

/**
 * @typedef {Object} PlayerWithStats
 * @property {Object.<string, number>} [stats] - Optional stats object
 */
export interface PlayerWithStats {
  stats?: Record<string, number> | {
    // Batting stats
    H?: number;
    HR?: number;
    BB?: number;
    SO?: number;
    SF?: number;
    HBP?: number;
    singles?: number;
    doubles?: number;
    triples?: number;
    // Baserunning stats
    speed?: number;
    runsBaserunning?: number;
    // Fielding stats
    G?: number;
    Inn?: number;
    PO?: number;
    A?: number;
    E?: number;
    DP?: number;
    FP?: number;
    RF?: number;
    TZ?: number;
    // Catcher stats
    sbAllowed?: number;
    cs?: number;
    csPct?: number;
    pickoffs?: number;
    armStrength?: number;
  };
}

/**
 * Initialize game state for two teams.
 * @returns Initial game state object
 */
export function initGameState(): GameState {
  return {
    inning: 1,
    top: true,
    outs: 0,
    bases: [null, null, null],
    lineupIndices: [0, 0], // [away, home]
    score: [0, 0],         // [away, home]
    pitcherFatigue: [ { battersFaced: 0 }, { battersFaced: 0 } ] // [away, home]
  };
}

/**
 * Returns an array of base indices (0=1B, 1=2B, 2=3B) for runners who are forced to advance.
 * @param bases - Array of 3 players, representing runners on 1B, 2B, 3B (null if empty)
 * @returns Indices of forced runners
 */
function getForcedRunners(bases: (BasePlayer | null)[]): number[] {
  // Forced if all bases behind are occupied (including batter becoming a runner)
  // On a ground ball, batter always goes to 1B, so all runners are forced if all bases behind are occupied
  const forced: number[] = [];
  // If 1B is occupied, runner is forced
  if (bases[0]) forced.push(0);
  // If 2B is occupied and 1B is occupied, runner on 2B is forced
  if (bases[1] && bases[0]) forced.push(1);
  // If 3B is occupied and 2B and 1B are occupied, runner on 3B is forced
  if (bases[2] && bases[1] && bases[0]) forced.push(2);
  return forced;
}

/**
 * Advance runners and return number of runs scored.
 * Mutates gameState.bases.
 * @param bases - Array of 3 players, representing runners on 1B, 2B, 3B (null if empty)
 * @param outcome - Outcome of the at-bat ('1B', '2B', '3B', 'HR', etc.)
 * @param batter - The batter who just hit (will be placed on base if appropriate)
 * @returns Tuple: [newBases, runsScored]
 */
function advanceRunners(bases: (BasePlayer | null)[], outcome: string, batter: BasePlayer): [(BasePlayer | null)[], number] {
  let runs = 0;
  const newBases: (BasePlayer | null)[] = [null, null, null];

  // Move existing runners with enhanced baserunning logic
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    
    const runner = bases[i]!; // Non-null assertion since we just checked
    const runnerSpeed = runner.baserunning?.speed || 50; // Default to average speed
    const runnerBaserunningValue = runner.baserunning?.runsBaserunning || 0; // Baserunning skill
    
    // Enhanced: Use baserunning stats to determine advancement
    let destination = i + (
      outcome === '1B' ? 1 :
      outcome === '2B' ? 2 :
      outcome === '3B' ? 3 :
      4
    );

    // Speed-based adjustments for singles and doubles
    if (outcome === '1B') {
      // Fast runners (speed > 70) can sometimes advance an extra base on singles
      if (runnerSpeed > 70 && Math.random() < 0.15) {
        destination = Math.min(destination + 1, 3);
      }
    } else if (outcome === '2B') {
      // Elite baserunners (runsBaserunning > 2) are more likely to score from 1B on doubles
      if (i === 0 && runnerBaserunningValue > 2 && Math.random() < 0.25) {
        destination = 3; // Score from 1B on double
      }
    }

    if (destination >= 3) runs++;
    else newBases[destination] = runner;
  }

  // Place batter on base
  const base = { '1B': 0, '2B': 1, '3B': 2 }[outcome];
  if (base !== undefined) {
    newBases[base] = batter;
  }

  // For a home run, batter also scores
  if (outcome === 'HR') {
    runs++;
  }

  return [newBases, runs];
}

export interface AtBatResult {
  batter_id: string;
  outcome: string;
  fielder?: Fielder;
  fielderPosition?: string;
}

/**
 * Simulates a single at-bat and updates the game state.
 *
 * @param awayMatchups - Array of matchup objects for the away team
 * @param homeMatchups - Array of matchup objects for the home team
 * @param state - The current game state (mutated in place)
 * @param awayFielders - Array of normalized fielders for the away team
 * @param homeFielders - Array of normalized fielders for the home team
 * @param awayRoster - Away team roster with full player objects
 * @param homeRoster - Home team roster with full player objects
 * @param randomFn - Optional: function to pick outcome, defaults to randomWeightedChoice
 * @param describeFn - Optional: function to describe outcome, defaults to describeOutcome
 * @returns Object with batter_id, outcome description, and (if applicable) fielder info
 */
export function simulateAtBat(
  awayMatchups: Matchup[], 
  homeMatchups: Matchup[], 
  state: GameState, 
  awayFielders: Fielder[], 
  homeFielders: Fielder[], 
  awayRoster: GameRoster,
  homeRoster: GameRoster,
  randomFn?: (weights: Record<string, number>) => string,
  describeFn?: (outcome: string) => string
): AtBatResult {
  const _randomWeightedChoice = randomFn || randomWeightedChoice;
  const _describeOutcome = describeFn || describeOutcome;
  const teamIndex = state.top ? 0 : 1;
  const lineup = teamIndex === 0 ? awayMatchups : homeMatchups;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  let fielders = teamIndex === 0 ? homeFielders : awayFielders; // fielding team
  // Defensive: ensure fielders is always an array
  const safeFielders = Array.isArray(fielders) ? fielders : [];
  const batterIndex = state.lineupIndices[teamIndex];
  const matchup = lineup[batterIndex % lineup.length];
  const batter = roster.lineup[batterIndex % roster.lineup.length];

  // --- Situational Hitting Detection ---
  const risp = !!(state.bases[1] || state.bases[2]); // runner on 2B or 3B
  const late = state.inning >= 8 && Math.abs(state.score[0] - state.score[1]) <= 2;
  const twoOuts = state.outs === 2;
  const situation: AtBatSituation = { risp, late, twoOuts };

  // Use situational probabilities
  let probabilities = getAtBatProbabilities(batter, roster.pitcher, situation);

  // --- Pitcher Fatigue Logic ---
  if (state.pitcherFatigue && state.pitcherFatigue[1 - teamIndex]) {
    // Increment batters faced for the pitching team
    state.pitcherFatigue[1 - teamIndex].battersFaced++;
    const fatigue = state.pitcherFatigue[1 - teamIndex].battersFaced;
    if (fatigue > 18) { // After 2 times through the order
      // Revised: Smaller adjustment, only BB/1B up, Out down, Out never < 50% original
      const maxFactor = 0.05; // 5% max adjustment
      const factor = Math.min((fatigue - 18) * 0.005, maxFactor); // +0.5% per batter over 18
      probabilities = { ...probabilities };
      const origOut = probabilities['Out'];
      if (probabilities['BB']) probabilities['BB'] += factor;
      if (probabilities['1B']) probabilities['1B'] += factor;
      if (probabilities['Out']) {
        probabilities['Out'] -= factor;
        // Never let Out fall below 50% of original
        if (probabilities['Out'] < 0.5 * origOut) probabilities['Out'] = 0.5 * origOut;
      }
      // Renormalize so total = 1
      const total = Object.values(probabilities).reduce((a, b) => a + b, 0);
      Object.keys(probabilities).forEach(k => probabilities[k as keyof typeof probabilities] = Math.max(0, probabilities[k as keyof typeof probabilities] / total));
    }
  }

  const outcome = _randomWeightedChoice(probabilities as unknown as Record<string, number>);
  const descriptiveOutcome = _describeOutcome(outcome);

  state.lineupIndices[teamIndex]++;

  let fielder: Fielder | undefined = undefined;
  let fielderPosition = '';
  let errorOccurred = false;
  let doublePlayOccurred = false;
  let triplePlayOccurred = false;

  // If ball in play (not K, BB, HBP, HR), try to extract fielder position from description
  if (outcome === 'Out') {
    // e.g., "Groundout to SS"
    const match = descriptiveOutcome.match(/to ([A-Z0-9]+)/);
    if (match) {
      fielderPosition = match[1];
      fielder = safeFielders.find(f => f.position === fielderPosition);
      // Error probability logic
      if (fielder && fielder.stats) {
        const E = Number(fielder.stats['E']) || 0;
        const PO = Number(fielder.stats['PO']) || 0;
        const A = Number(fielder.stats['A']) || 0;
        const chances = PO + A + E;
        const errorProb = chances > 0 ? E / chances : 0.01; // fallback to 1% if no data
        if (Math.random() < errorProb) {
          errorOccurred = true;
        }
      } else {
        // No stats, fallback to 1% error chance
        if (Math.random() < 0.01) {
          errorOccurred = true;
        }
      }
    }
  }

  // --- Error logic takes precedence over double/triple play logic ---
  if (errorOccurred) {
    // Treat as error: advance runners as on a single, do not increment outs
    const [newBases, runs] = advanceRunners(state.bases, '1B', batter as BasePlayer);
    state.bases = newBases;
    state.score[teamIndex] += runs;
    return {
      batter_id: matchup.batter_id,
      outcome: `Error on ${fielderPosition}`,
      fielder,
      fielderPosition
    };
  }

  // --- Triple Play Logic ---
  // Only for groundouts, runners on 1st and 2nd (or bases loaded), 0 outs
  if (
    outcome === 'Out' &&
    /^Groundout to [A-Z0-9]+$/.test(descriptiveOutcome) &&
    state.outs === 0
  ) {
    const forced = getForcedRunners(state.bases);
    if (forced.length >= 2) {
      // Enhanced: Use fielding stats to determine triple play probability
      let tpProb = 0.01; // Base 1% chance
      
      if (fielder && fielder.stats) {
        const RF = Number(fielder.stats['RF']) || 0; // Range Factor
        const TZ = Number(fielder.stats['TZ']) || 0; // Total Zone
        const FP = Number(fielder.stats['FP']) || 0.985; // Fielding Percentage
        
        // Range Factor bonus: +0.5% per point above league average (4.5)
        const rfBonus = Math.max(0, (RF - 4.5) * 0.005);
        
        // Total Zone bonus: +0.2% per point above average
        const tzBonus = Math.max(0, TZ * 0.002);
        
        // Fielding Percentage bonus: +1% for elite fielders (FP > 0.995)
        const fpBonus = FP > 0.995 ? 0.01 : 0;
        
        tpProb = Math.min(0.05, tpProb + rfBonus + tzBonus + fpBonus);
      }
      
      if (Math.random() < tpProb) {
        triplePlayOccurred = true;
        // Remove batter and two lead forced runners
        // Remove highest base forced runners first
        const forcedSorted = forced.slice().sort((a, b) => b - a);
        for (let i = 0; i < 2 && i < forcedSorted.length; i++) {
          state.bases[forcedSorted[i]] = null;
        }
        // Remove batter (all 3 outs)
        state.outs = 3;
        return {
          batter_id: matchup.batter_id,
          outcome: 'Grounded into triple play',
          ...(fielder ? { fielder, fielderPosition } : {})
        };
      }
    }
  }

  // --- Double Play Logic ---
  // Only for groundouts, runner(s) forced, <2 outs
  if (
    outcome === 'Out' &&
    /^Groundout to [A-Z0-9]+$/.test(descriptiveOutcome) &&
    state.outs < 2
  ) {
    const forced = getForcedRunners(state.bases);
    if (forced.length >= 1) {
      // Enhanced: Use fielding stats to determine double play probability
      let dpProb = 0.25; // Base 25% chance
      
      if (fielder && fielder.stats) {
        const RF = Number(fielder.stats['RF']) || 0; // Range Factor
        const TZ = Number(fielder.stats['TZ']) || 0; // Total Zone
        const FP = Number(fielder.stats['FP']) || 0.985; // Fielding Percentage
        
        // Range Factor bonus: +5% per point above league average (4.5)
        const rfBonus = Math.max(0, (RF - 4.5) * 0.05);
        
        // Total Zone bonus: +2% per point above average
        const tzBonus = Math.max(0, TZ * 0.02);
        
        // Fielding Percentage bonus: +10% for elite fielders (FP > 0.995)
        const fpBonus = FP > 0.995 ? 0.10 : 0;
        
        dpProb = Math.min(0.60, dpProb + rfBonus + tzBonus + fpBonus);
      }
      
      if (Math.random() < dpProb) {
        doublePlayOccurred = true;
        // Remove batter and lead forced runner
        // Remove highest base forced runner
        const leadForced = Math.max(...forced);
        state.bases[leadForced] = null;
        // Increment outs by 2, but cap at 3
        state.outs = Math.min(state.outs + 2, 3);
        return {
          batter_id: matchup.batter_id,
          outcome: 'Grounded into double play',
          ...(fielder ? { fielder, fielderPosition } : {})
        };
      }
    }
  }

  // --- Standard groundout logic: batter out at 1B, forced runners advance, unforced runners hold ---
  if (outcome === 'Out' && /^Groundout to [A-Z0-9]+$/.test(descriptiveOutcome)) {
    // Remove batter (out at 1B)
    state.outs++;
    // Advance forced runners from highest to lowest base
    const forced = getForcedRunners(state.bases);
    for (const idx of forced.slice().sort((a, b) => b - a)) {
      if (state.bases[idx]) {
        if (idx === 2) {
          // Forced runner on 3B scores
          state.bases[idx] = null;
          state.score[teamIndex] += 1;
        } else {
          // Move runner up one base
          state.bases[idx + 1] = state.bases[idx];
          state.bases[idx] = null;
        }
      }
    }
    // Unforced runners hold
    return {
      batter_id: matchup.batter_id,
      outcome: descriptiveOutcome,
      ...(fielder ? { fielder, fielderPosition } : {})
    };
  }

  if (outcome === 'Out' || outcome === 'K') {
    state.outs++;
  } else if (outcome === 'BB' || outcome === 'HBP') {
    const [newBases, runs] = advanceRunners(state.bases, '1B', batter as BasePlayer);
    state.bases = newBases;
    state.score[teamIndex] += runs;
  } else {
    const [newBases, runs] = advanceRunners(state.bases, outcome, batter as BasePlayer);
    state.bases = newBases;
    state.score[teamIndex] += runs;
  }

  // --- Enhanced Catcher Defense Logic ---
  // Check for passed balls and wild pitches on certain outcomes
  if (outcome === 'K' || outcome === 'BB') {
    // Find the catcher from the defensive team
    const catcher = safeFielders.find(f => f.position === 'C');
    if (catcher && catcher.stats) {
      const FP = Number(catcher.stats['FP']) || 0.985; // Fielding Percentage
      const PB = Number(catcher.stats['PB']) || 0; // Passed Balls (lower is better)
      
      // Elite catchers (FP > 0.995) are less likely to allow passed balls
      const pbProb = FP > 0.995 ? 0.001 : 0.005; // 0.1% vs 0.5% chance
      
      if (Math.random() < pbProb) {
        // Passed ball: advance runners one base
        for (let i = 2; i >= 0; i--) {
          if (state.bases[i]) {
            if (i === 2) {
              // Runner on 3B scores
              state.bases[i] = null;
              state.score[teamIndex]++;
            } else {
              // Move runner up one base
              state.bases[i + 1] = state.bases[i];
              state.bases[i] = null;
            }
          }
        }
        return {
          batter_id: matchup.batter_id,
          outcome: 'Strikeout, but passed ball allows runner to advance',
          fielder: catcher,
          fielderPosition: 'C'
        };
      }
    }
  }

  return {
    batter_id: matchup.batter_id,
    outcome: descriptiveOutcome,
    ...(fielder ? { fielder, fielderPosition } : {})
  };
}

export interface StealResult {
  success: boolean;
  out: boolean;
  description: string;
}

/**
 * Attempt to steal a base.
 * @param base - The base to steal (2 for 2B, 3 for 3B, 4 for home)
 * @param state - The current game state (mutated in place)
 * @param runner - The runner object (should have .baserunning if available)
 * @param pitcher - The pitcher object (should have .stats if available)
 * @param catcher - The catcher object (should have .stats if available)
 * @param fromBase - The base the runner is currently on (1 for 1B, 2 for 2B, 3 for 3B)
 * @param randomFn - Optional random function, should be called as rand(1) to get [0,1)
 * @returns Object with success status, out status, and description
 */
export function attemptSteal(
  base: number, 
  state: GameState, 
  runner: StatNormalizedBatter, 
  pitcher: PlayerWithStats, 
  catcher: PlayerWithStats, 
  fromBase: number, 
  randomFn?: (max: number) => number
): StealResult {
  const rand = randomFn || Math.random;
  // Check runner is present on fromBase
  if (!state.bases[fromBase - 1]) {
    return {
      success: false,
      out: false,
      description: `No runner on base ${fromBase} to steal from.`
    };
  }
  // Default probabilities
  let successProb = base === 2 ? 0.6 : base === 3 ? 0.3 : 0.1;

  // Use real stats if available
  if (runner?.baserunning && catcher?.stats) {
    // Use baserunning speed from normalized stats
    const runnerSpeed = runner.baserunning.speed || 50; // fallback to average
    const catcherArm = catcher.stats.armStrength || 50; // fallback to average
    const runnerName = (runner as any).name || (runner as any).player_id || 'Unknown Runner';
    const catcherName = (catcher as any).name || (catcher as any).player_id || 'Unknown Catcher';
    console.log(`[STEAL ATTEMPT] Runner: ${runnerName} (speed: ${runnerSpeed}), Catcher: ${catcherName} (arm: ${catcherArm})`);
    // Simple model: higher speed, higher chance; higher arm, lower chance
    successProb = 0.5 + (runnerSpeed - catcherArm) / 200; // Range ~0.0-1.0
    // Adjust for base difficulty
    if (base === 3) successProb -= 0.2;
    if (base === 4) successProb -= 0.4;
    successProb = Math.max(0.05, Math.min(0.95, successProb));
  }

  const attempt = rand(1);
  if (attempt < successProb) {
    // Success: advance runner
    const runnerPlayer = state.bases[fromBase - 1];
    state.bases[fromBase - 1] = null;
    if (base <= 3) {
      state.bases[base - 1] = runnerPlayer;
    } else {
      // Stealing home: runner scores
      state.score[state.top ? 0 : 1] += 1;
    }
    return {
      success: true,
      out: false,
      description: `Runner successfully stole base ${base === 4 ? 'Home' : base}`
    };
  } else {
    // Caught stealing: runner out
    state.bases[fromBase - 1] = null;
    state.outs++;
    return {
      success: false,
      out: true,
      description: `Runner caught stealing base ${base === 4 ? 'Home' : base}`
    };
  }
}

export interface PickoffResult {
  success: boolean;
  out: boolean;
  error: boolean;
  description: string;
}

/**
 * Attempt a pickoff at a base.
 * @param base - The base to pick off (1, 2, or 3)
 * @param state - The current game state (mutated in place)
 * @param runner - The runner object (should have .baserunning if available)
 * @param pitcher - The pitcher object (should have .stats if available)
 * @param fielder - The fielder covering the base (should have .stats if available)
 * @param randomFn - Optional random function, should be called as rand(1) to get [0,1)
 * @returns Object with success status, out status, error status, and description
 */
export function attemptPickoff(
  base: number, 
  state: GameState, 
  runner: StatNormalizedBatter, 
  pitcher: PlayerWithStats, 
  fielder: PlayerWithStats, 
  randomFn?: (max: number) => number
): PickoffResult {
  const rand = randomFn || Math.random;
  // Check runner is present on base
  if (!state.bases[base - 1]) {
    return {
      success: false,
      out: false,
      error: false,
      description: `No runner on base ${base} to pick off.`
    };
  }
  // Default probabilities
  let pickoffProb = 0.05; // 5% pickoff
  let errorProb = 0.1;    // 10% error

  // Use real stats if available
  if (pitcher?.stats && runner?.baserunning) {
    // Use pitcher pickoff stats and runner speed
    const pitcherPick = pitcher.stats.pickoffs || 0; // Number of pickoffs
    const runnerSpeed = runner.baserunning.speed || 50; // Runner speed rating
    
    // Convert pickoff count to probability (more pickoffs = higher chance)
    pickoffProb = 0.03 + (pitcherPick * 0.02) - (runnerSpeed - 50) / 1000;
    pickoffProb = Math.max(0.01, Math.min(0.15, pickoffProb));
  }
  
  if (fielder?.stats) {
    // Use fielding error rate
    const fieldingPct = fielder.stats.FP || 0.985; // Fielding percentage
    errorProb = 0.05 + (1 - fieldingPct) * 2; // Higher error rate = more pickoff errors
    errorProb = Math.max(0.01, Math.min(0.2, errorProb));
  }

  const attempt = rand(1);
  if (attempt < pickoffProb) {
    // Pickoff success
    state.bases[base - 1] = null;
    state.outs++;
    return {
      success: true,
      out: true,
      error: false,
      description: `Runner picked off at base ${base}`
    };
  } else if (attempt < pickoffProb + errorProb) {
    // Pickoff error: runner advances
    const runnerPlayer = state.bases[base - 1];
    state.bases[base - 1] = null;
    if (base < 3) {
      state.bases[base] = runnerPlayer;
    } else {
      // Runner scores
      state.score[state.top ? 0 : 1] += 1;
    }
    return {
      success: false,
      out: false,
      error: true,
      description: `Pickoff error: runner advances from base ${base}`
    };
  } else {
    // No pickoff
    return {
      success: false,
      out: false,
      error: false,
      description: `Pickoff attempt at base ${base} unsuccessful`
    };
  }
}

// Re-export the Roster type with the correct NormalizedBatter type
export interface GameRoster {
  lineup: NormalizedBatter[];
  pitcher: any; // Keep pitcher type flexible for now
}

// Type alias for the base structure
export type BasePlayer = StatNormalizedBatter; 