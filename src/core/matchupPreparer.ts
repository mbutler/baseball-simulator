/**
 * @fileoverview Prepares batter-pitcher matchups with outcome probabilities.
 * @module core/matchupPreparer
 */

import { getAtBatProbabilities } from './probabilityModel.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';

/**
 * @typedef {Object} Roster
 * @property {NormalizedBatter[]} lineup - Array of batter objects
 * @property {NormalizedPitcher} pitcher - Pitcher object
 */
export interface Roster {
  lineup: NormalizedBatter[];
  pitcher: NormalizedPitcher;
}

/**
 * @typedef {Object} Matchup
 * @property {string} batter_id - Batter's player_id
 * @property {string} pitcher_id - Pitcher's player_id
 * @property {Object} probabilities - Map of outcome → probability
 */
export interface Matchup {
  batter_id: string;
  pitcher_id: string;
  probabilities: {
    K: number;
    BB: number;
    HBP: number;
    HR: number;
    '1B': number;
    '2B': number;
    '3B': number;
    Out: number;
  };
}

/**
 * Given a batting roster, generate batter-vs-pitcher matchups.
 * Pass the opposing roster as the second argument so each batter is paired
 * with the pitcher on the mound, not their own starter.
 * @param battingRoster - Team at the plate
 * @param pitchingRoster - Team in the field (defaults to battingRoster for tests)
 * @returns Array of matchup objects (one per batter)
 */
export function prepareMatchups(battingRoster: Roster, pitchingRoster?: Roster): Matchup[] {
  const { lineup } = battingRoster;
  const pitcher = (pitchingRoster ?? battingRoster).pitcher;

  return lineup.map(batter => {
    const probabilities = getAtBatProbabilities(batter, pitcher);
    return {
      batter_id: batter.player_id,
      pitcher_id: pitcher.player_id,
      probabilities: probabilities as Matchup['probabilities']
    };
  });
} 