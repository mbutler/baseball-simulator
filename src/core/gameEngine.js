/**
 * @fileoverview Minimal turn-by-turn baseball game simulation engine.
 * @module core/gameEngine
 */

import { randomWeightedChoice } from '../utils/random.js'
import { describeOutcome } from '../utils/describeOutcome.js'

/**
 * @typedef {Object} GameState
 * @property {number} inning - Current inning (1-based)
 * @property {boolean} top - True if top half, false if bottom
 * @property {number} outs - Number of outs in current half-inning
 * @property {number[]} bases - Array of 3 numbers, representing runners on 1B, 2B, 3B (0 or 1)
 * @property {number[]} lineupIndices - Current batter index for each team ([away, home])
 * @property {number[]} score - Current score ([away, home])
 * @property {{ battersFaced: number }[]} pitcherFatigue - Array tracking batters faced for each pitcher ([away, home])
 */

/**
 * @typedef {Object} Fielder
 * @property {string} position
 * @property {Record<string, number>} stats
 */

/**
 * @typedef {Object} PlayerWithStats
 * @property {Object.<string, number>} [stats] - Optional stats object
 */

/**
 * Initialize game state for two teams.
 * @returns {GameState} Initial game state object
 */
export function initGameState() {
  return {
    inning: 1,
    top: true,
    outs: 0,
    bases: [0, 0, 0],
    lineupIndices: [0, 0], // [away, home]
    score: [0, 0],         // [away, home]
    pitcherFatigue: [ { battersFaced: 0 }, { battersFaced: 0 } ] // [away, home]
  }
}

/**
 * Returns an array of base indices (0=1B, 1=2B, 2=3B) for runners who are forced to advance.
 * @param {number[]} bases - Array of 3 numbers, representing runners on 1B, 2B, 3B (0 or 1)
 * @returns {number[]} Indices of forced runners
 */
function getForcedRunners(bases) {
  // Forced if all bases behind are occupied (including batter becoming a runner)
  // On a ground ball, batter always goes to 1B, so all runners are forced if all bases behind are occupied
  const forced = [];
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
 * @param {number[]} bases - Array of 3 numbers, representing runners on 1B, 2B, 3B (0 or 1)
 * @param {string} outcome - Outcome of the at-bat ('1B', '2B', '3B', 'HR', etc.)
 * @returns {[number[], number]} Tuple: [newBases, runsScored]
 */
function advanceRunners(bases, outcome) {
  let runs = 0
  const newBases = [0, 0, 0]

  // Move existing runners
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue
    const destination = i + (
      outcome === '1B' ? 1 :
      outcome === '2B' ? 2 :
      outcome === '3B' ? 3 :
      4
    )

    if (destination >= 3) runs++
    else newBases[destination] = 1
  }

  // Place batter on base
  const base = { '1B': 0, '2B': 1, '3B': 2 }[outcome];
  if (base !== undefined) {
    newBases[base] = 1;
  }

  // For a home run, batter also scores
  if (outcome === 'HR') {
    runs++
  }

  return [newBases, runs]
}

/**
 * Simulates a single at-bat and updates the game state.
 *
 * @param {import('./matchupPreparer.js').Matchup[]} awayMatchups - Array of matchup objects for the away team
 * @param {import('./matchupPreparer.js').Matchup[]} homeMatchups - Array of matchup objects for the home team
 * @param {GameState} state - The current game state (mutated in place)
 * @param {Fielder[]} awayFielders - Array of normalized fielders for the away team
 * @param {Fielder[]} homeFielders - Array of normalized fielders for the home team
 * @param {function(Object): string} [randomFn] - Optional: function to pick outcome, defaults to randomWeightedChoice
 * @param {function(string): string} [describeFn] - Optional: function to describe outcome, defaults to describeOutcome
 * @returns {{ batter_id: string, outcome: string, fielder?: Fielder, fielderPosition?: string }} Object with batter_id, outcome description, and (if applicable) fielder info
 */
export function simulateAtBat(awayMatchups, homeMatchups, state, awayFielders, homeFielders, randomFn, describeFn) {
  const _randomWeightedChoice = randomFn || randomWeightedChoice
  const _describeOutcome = describeFn || describeOutcome
  const teamIndex = state.top ? 0 : 1
  /** @type {import('./matchupPreparer.js').Matchup[]} */
  const lineup = teamIndex === 0 ? awayMatchups : homeMatchups
  /** @type {Fielder[]} */
  let fielders = teamIndex === 0 ? homeFielders : awayFielders // fielding team
  // Defensive: ensure fielders is always an array
  const safeFielders = Array.isArray(fielders) ? fielders : [];
  const batterIndex = state.lineupIndices[teamIndex]
  const matchup = lineup[batterIndex % lineup.length]
  let probabilities = /** @type {Record<string, number>} */ (matchup.probabilities)

  // --- Pitcher Fatigue Logic ---
  if (state.pitcherFatigue && state.pitcherFatigue[1 - teamIndex]) {
    // Increment batters faced for the pitching team
    state.pitcherFatigue[1 - teamIndex].battersFaced++;
    const fatigue = state.pitcherFatigue[1 - teamIndex].battersFaced;
    if (fatigue > 18) { // After 2 times through the order
      // Adjust probabilities: increase BB/H, decrease K/Out
      const factor = Math.min((fatigue - 18) * 0.02, 0.2); // up to 20% adjustment
      probabilities = { ...probabilities };
      if (probabilities['BB']) probabilities['BB'] += factor;
      if (probabilities['HBP']) probabilities['HBP'] += factor / 2;
      if (probabilities['1B']) probabilities['1B'] += factor;
      if (probabilities['2B']) probabilities['2B'] += factor / 2;
      if (probabilities['3B']) probabilities['3B'] += factor / 4;
      if (probabilities['HR']) probabilities['HR'] += factor / 4;
      if (probabilities['K']) probabilities['K'] -= factor;
      if (probabilities['Out']) probabilities['Out'] -= factor;
      // Normalize so total = 1
      const total = Object.values(probabilities).reduce((a, b) => a + b, 0);
      Object.keys(probabilities).forEach(k => probabilities[k] = Math.max(0, probabilities[k] / total));
    }
  }

  const outcome = _randomWeightedChoice(probabilities)
  const descriptiveOutcome = _describeOutcome(outcome)

  state.lineupIndices[teamIndex]++

  let fielder = undefined
  let fielderPosition = ''
  let errorOccurred = false
  let doublePlayOccurred = false;
  let triplePlayOccurred = false;

  // If ball in play (not K, BB, HBP, HR), try to extract fielder position from description
  if (outcome === 'Out') {
    // e.g., "Groundout to SS"
    const match = descriptiveOutcome.match(/to ([A-Z0-9]+)/)
    if (match) {
      fielderPosition = match[1]
      fielder = safeFielders.find(f => f.position === fielderPosition)
      // Error probability logic
      if (fielder && fielder.stats) {
        const E = Number(fielder.stats['E']) || 0
        const PO = Number(fielder.stats['PO']) || 0
        const A = Number(fielder.stats['A']) || 0
        const chances = PO + A + E
        const errorProb = chances > 0 ? E / chances : 0.01 // fallback to 1% if no data
        if (Math.random() < errorProb) {
          errorOccurred = true
        }
      } else {
        // No stats, fallback to 1% error chance
        if (Math.random() < 0.01) {
          errorOccurred = true
        }
      }
    }
  }

  // --- Error logic takes precedence over double/triple play logic ---
  if (errorOccurred) {
    // Treat as error: advance runners as on a single, do not increment outs
    const [newBases, runs] = advanceRunners(state.bases, '1B')
    state.bases = newBases
    state.score[teamIndex] += runs
    return {
      batter_id: matchup.batter_id,
      outcome: `Error on ${fielderPosition}`,
      fielder,
      fielderPosition
    }
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
      // 1% chance for triple play
      if (Math.random() < 0.01) {
        triplePlayOccurred = true;
        // Remove batter and two lead forced runners
        // Remove highest base forced runners first
        const forcedSorted = forced.slice().sort((a, b) => b - a);
        for (let i = 0; i < 2 && i < forcedSorted.length; i++) {
          state.bases[forcedSorted[i]] = 0;
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
      // 25% chance for double play
      if (Math.random() < 0.25) {
        doublePlayOccurred = true;
        // Remove batter and lead forced runner
        // Remove highest base forced runner
        const leadForced = Math.max(...forced);
        state.bases[leadForced] = 0;
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
          state.bases[idx] = 0;
          state.score[teamIndex] += 1;
        } else {
          // Move runner up one base
          state.bases[idx + 1] = 1;
          state.bases[idx] = 0;
          console.log('Advancing forced runner from', idx, 'to', idx + 1, 'Bases:', state.bases);
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
    state.outs++
  } else if (outcome === 'BB' || outcome === 'HBP') {
    const [newBases, runs] = advanceRunners(state.bases, '1B')
    state.bases = newBases
    state.score[teamIndex] += runs
  } else {
    const [newBases, runs] = advanceRunners(state.bases, outcome)
    state.bases = newBases
    state.score[teamIndex] += runs
  }

  return {
    batter_id: matchup.batter_id,
    outcome: descriptiveOutcome,
    ...(fielder ? { fielder, fielderPosition } : {})
  }
}

/**
 * Attempt to steal a base.
 * @param {number} base - The base to steal (2 for 2B, 3 for 3B, 4 for home)
 * @param {GameState} state - The current game state (mutated in place)
 * @param {PlayerWithStats} runner - The runner object (should have .stats if available)
 * @param {PlayerWithStats} pitcher - The pitcher object (should have .stats if available)
 * @param {PlayerWithStats} catcher - The catcher object (should have .stats if available)
 * @param {number} fromBase - The base the runner is currently on (1 for 1B, 2 for 2B, 3 for 3B)
 * @param {function(number): number} [randomFn] - Optional random function, should be called as rand(1) to get [0,1)
 * @returns {{ success: boolean, out: boolean, description: string }}
 */
export function attemptSteal(base, state, runner, pitcher, catcher, fromBase, randomFn) {
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

  // Use stats if available
  if (runner?.stats && catcher?.stats) {
    // Example: runner SPD vs catcher ARM
    const runnerSpeed = Number(runner.stats['SPD'] || runner.stats['SB'] || 50); // fallback
    const catcherArm = Number(catcher.stats['ARM'] || catcher.stats['CS%'] || 50); // fallback
    // Simple model: higher speed, higher chance; higher arm, lower chance
    successProb = 0.5 + (runnerSpeed - catcherArm) / 200; // Range ~0.0-1.0
    // Adjust for base
    if (base === 3) successProb -= 0.2;
    if (base === 4) successProb -= 0.4;
    successProb = Math.max(0.05, Math.min(0.95, successProb));
  }

  const attempt = rand(1);
  if (attempt < successProb) {
    // Success: advance runner
    state.bases[fromBase - 1] = 0;
    if (base <= 3) {
      state.bases[base - 1] = 1;
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
    state.bases[fromBase - 1] = 0;
    state.outs++;
    return {
      success: false,
      out: true,
      description: `Runner caught stealing base ${base === 4 ? 'Home' : base}`
    };
  }
}

/**
 * Attempt a pickoff at a base.
 * @param {number} base - The base to pick off (1, 2, or 3)
 * @param {GameState} state - The current game state (mutated in place)
 * @param {PlayerWithStats} runner - The runner object (should have .stats if available)
 * @param {PlayerWithStats} pitcher - The pitcher object (should have .stats if available)
 * @param {PlayerWithStats} fielder - The fielder covering the base (should have .stats if available)
 * @param {function(number): number} [randomFn] - Optional random function, should be called as rand(1) to get [0,1)
 * @returns {{ success: boolean, out: boolean, error: boolean, description: string }}
 */
export function attemptPickoff(base, state, runner, pitcher, fielder, randomFn) {
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

  // Use stats if available
  if (pitcher?.stats && runner?.stats) {
    const pitcherPick = Number(pitcher.stats['PK'] || 50);
    const runnerLead = Number(runner.stats['SPD'] || 50);
    pickoffProb = 0.03 + (pitcherPick - runnerLead) / 1000; // Range ~0-0.1
    pickoffProb = Math.max(0.01, Math.min(0.15, pickoffProb));
  }
  if (fielder?.stats) {
    const fielderError = Number(fielder.stats['E'] || 0);
    errorProb = 0.05 + fielderError / 1000;
    errorProb = Math.max(0.01, Math.min(0.2, errorProb));
  }

  const attempt = rand(1);
  if (attempt < pickoffProb) {
    // Pickoff success
    state.bases[base - 1] = 0;
    state.outs++;
    return {
      success: true,
      out: true,
      error: false,
      description: `Runner picked off at base ${base}`
    };
  } else if (attempt < pickoffProb + errorProb) {
    // Pickoff error: runner advances
    state.bases[base - 1] = 0;
    if (base < 3) {
      state.bases[base] = 1;
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
