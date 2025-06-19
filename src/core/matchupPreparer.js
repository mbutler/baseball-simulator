/**
 * @fileoverview Prepares batter-pitcher matchups with outcome probabilities.
 */

import { getAtBatProbabilities } from './probabilityModel.js'

/**
 * Given a team roster, generate batter-vs-pitcher matchups.
 * @param {{ lineup: object[], pitcher: object }} roster
 * @returns {object[]} Array of 9 matchup objects
 */
export function prepareMatchups(roster) {
  const { lineup, pitcher } = roster

  return lineup.map(batter => {
    const probabilities = getAtBatProbabilities(batter, pitcher)
    return {
      batter_id: batter.player_id,
      pitcher_id: pitcher.player_id,
      probabilities
    }
  })
}
