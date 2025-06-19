/**
 * @fileoverview Minimal turn-by-turn baseball game simulation engine.
 */

import { randomWeightedChoice } from '../utils/random.js'
import { describeOutcome } from '../utils/describeOutcome.js'

/**
 * @typedef {Object} GameState
 * @property {number} inning
 * @property {boolean} top
 * @property {number} outs
 * @property {number[]} bases - length 3, representing 1B/2B/3B
 * @property {number[]} lineupIndices - current batter index for each team
 * @property {number[]} score - [away, home]
 */

/**
 * Initialize game state for two teams.
 * @returns {GameState}
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

    if (destination >= 4) runs++
    else newBases[destination - 1] = 1
  }

  // Place batter on base
  if (['1B', '2B', '3B'].includes(outcome)) {
    const base = { '1B': 0, '2B': 1, '3B': 2 }[outcome]
    newBases[base] = 1
  }

  return [newBases, runs]
}

/**
 * Simulates a single at-bat.
 * @param {object[]} awayMatchups
 * @param {object[]} homeMatchups
 * @param {GameState} state
 */
export function simulateAtBat(awayMatchups, homeMatchups, state) {
  const teamIndex = state.top ? 0 : 1
  const lineup = teamIndex === 0 ? awayMatchups : homeMatchups
  const batterIndex = state.lineupIndices[teamIndex]
  const matchup = lineup[batterIndex % lineup.length]
  const outcome = randomWeightedChoice(matchup.probabilities)
  const descriptiveOutcome = describeOutcome(outcome)

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
