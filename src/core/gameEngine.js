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
    score: [0, 0]          // [away, home]
  }
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
 * @param {function(Object): string} [randomFn] - Optional: function to pick outcome, defaults to randomWeightedChoice
 * @param {function(string): string} [describeFn] - Optional: function to describe outcome, defaults to describeOutcome
 * @returns {{ batter_id: string, outcome: string }} Object with batter_id and outcome description
 */
export function simulateAtBat(awayMatchups, homeMatchups, state, randomFn, describeFn) {
  const _randomWeightedChoice = randomFn || randomWeightedChoice
  const _describeOutcome = describeFn || describeOutcome
  const teamIndex = state.top ? 0 : 1
  /** @type {import('./matchupPreparer.js').Matchup[]} */
  const lineup = teamIndex === 0 ? awayMatchups : homeMatchups
  const batterIndex = state.lineupIndices[teamIndex]
  const matchup = lineup[batterIndex % lineup.length]
  const probabilities = /** @type {Record<string, number>} */ (matchup.probabilities)
  const outcome = _randomWeightedChoice(probabilities)
  const descriptiveOutcome = _describeOutcome(outcome)

  state.lineupIndices[teamIndex]++

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
    outcome: descriptiveOutcome
  }
}
