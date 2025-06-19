/**
 * @fileoverview Entry point: loads and parses two Baseball Reference team pages and simulates a game.
 */

import { parseTables } from './utils/parseTables.js'
import { parseStatTable } from './utils/statParser.js'
import { normalizeBattingStats, normalizePitchingStats } from './utils/statNormalizer.js'
import { buildRoster } from './core/rosterBuilder.js'
import { prepareMatchups } from './core/matchupPreparer.js'
import { initGameState, simulateAtBat } from './core/gameEngine.js'

async function loadRosterFromFile(filename) {
  const res = await fetch(`./data/${filename}`)
  const html = await res.text()

  const { batting, pitching } = parseTables(html)
  const battingRaw = parseStatTable(batting)
  const pitchingRaw = parseStatTable(pitching)

  const batters = normalizeBattingStats(battingRaw)
  const pitchers = normalizePitchingStats(pitchingRaw)

  const lineupIds = batters
    .map(b => b.player_id)
    .filter((id, i, arr) => id && arr.indexOf(id) === i)
    .slice(0, 9)

  const pitcherId = pitchers.find(p => p.player_id)?.player_id
  if (!pitcherId) throw new Error('No valid pitcher found')

  return buildRoster(lineupIds, pitcherId, batters, pitchers)
}

async function main() {
  try {
    const homeRoster = await loadRosterFromFile('CHC-2025.html')
    const awayRoster = await loadRosterFromFile('MIL-2025.html')

    const homeMatchups = prepareMatchups(homeRoster)
    const awayMatchups = prepareMatchups(awayRoster)

    const state = initGameState()

    console.log(`⚾ Starting simulation: MIL (away) vs CHC (home)`)

    while (true) {
      // At the start of the bottom of the 9th or later, if home team is ahead, end the game (do not play the half-inning)
      if (!state.top && state.inning >= 9 && state.score[1] > state.score[0]) break;

      const matchups = state.top ? awayMatchups : homeMatchups;
      const team = state.top ? 'MIL' : 'CHC';

      // Simulate a half-inning
      let walkoff = false;
      while (state.outs < 3) {
        const prevScore = [...state.score];
        const result = simulateAtBat(awayMatchups, homeMatchups, state);
        if (!result) {
          console.error('❌ simulateAtBat() returned nothing — halting');
          return;
        }
        console.log(`Inning ${state.inning} ${state.top ? '↑' : '↓'} — ${team}: ${result.batter_id} → ${result.outcome}`);

        // Walk-off: if in bottom of 9th or later and home team takes the lead, end game immediately
        if (!state.top && state.inning >= 9 && prevScore[1] <= prevScore[0] && state.score[1] > state.score[0]) {
          walkoff = true;
          break;
        }
      }

      // If walk-off, end the game
      if (walkoff) break;

      // Advance half-inning
      const wasBottom = !state.top;
      if (state.top) {
        state.top = false;
      } else {
        state.top = true;
        state.inning++;
      }
      // After the bottom half of the 9th or later, if the score is not tied, end the game
      if (wasBottom && state.inning >= 9 && state.score[0] !== state.score[1]) break;
      // Reset outs and bases for next half-inning
      state.outs = 0;
      state.bases = [0, 0, 0];
    }
    console.log(`🏁 Final Score: MIL ${state.score[0]} — CHC ${state.score[1]}`);
  } catch (error) {
    console.error('❌ Error in main():', error);
  }
}

main();
