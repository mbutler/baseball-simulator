/**
 * @fileoverview Builds a playable team roster from selected player IDs and full stat pools.
 * @module core/rosterBuilder
 */

/**
 * @typedef {import('./probabilityModel.js').NormalizedBatter} NormalizedBatter
 * @typedef {import('./probabilityModel.js').NormalizedPitcher} NormalizedPitcher
 */

/**
 * Builds a playable team roster from selected player IDs and full stat pools.
 * @param {string[]} lineupIds - Array of 9 player_ids for batters
 * @param {string} pitcherId - player_id for starting pitcher
 * @param {NormalizedBatter[]} batters - Array of normalized batters
 * @param {NormalizedPitcher[]} pitchers - Array of normalized pitchers
 * @returns {{ lineup: NormalizedBatter[], pitcher: NormalizedPitcher }}
 * @throws {Error} If any player is missing or duplicated
 */
export function buildRoster(lineupIds, pitcherId, batters, pitchers) {
    const lineup = lineupIds.map(pid => {
      const player = batters.find(b => b.player_id === pid)
      if (!player) throw new Error(`Lineup player not found: ${pid}`)
      return player
    })
  
    const pitcher = pitchers.find(p => p.player_id === pitcherId)
    if (!pitcher) throw new Error(`Starting pitcher not found: ${pitcherId}`)
  
    // Ensure no duplicate player_ids
    const seen = new Set()
    for (const p of lineup) {
      if (seen.has(p.player_id)) throw new Error(`Duplicate player in lineup: ${p.player_id}`)
      seen.add(p.player_id)
    }
    if (seen.has(pitcherId)) throw new Error(`Pitcher also appears in lineup: ${pitcherId}`)
  
    return {
      lineup,
      pitcher
    }
  }
  