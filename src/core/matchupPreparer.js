/**
 * @fileoverview Prepares batter-pitcher matchups with outcome probabilities.
 * @module core/matchupPreparer
 */

import { getAtBatProbabilities } from './probabilityModel.js'

/**
 * @typedef {import('./probabilityModel.js').NormalizedBatter} NormalizedBatter
 * @typedef {import('./probabilityModel.js').NormalizedPitcher} NormalizedPitcher
 */

/**
 * @typedef {Object} Roster
 * @property {NormalizedBatter[]} lineup - Array of batter objects
 * @property {NormalizedPitcher} pitcher - Pitcher object
 */

/**
 * @typedef {Object} Matchup
 * @property {string} batter_id - Batter's player_id
 * @property {string} pitcher_id - Pitcher's player_id
 * @property {Object} probabilities - Map of outcome → probability
 */

/**
 * Given a team roster, generate batter-vs-pitcher matchups.
 * @param {Roster} roster - Team roster with lineup and pitcher
 * @returns {Matchup[]} Array of matchup objects (one per batter)
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
