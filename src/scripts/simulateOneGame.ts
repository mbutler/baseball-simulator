#!/usr/bin/env bun
/**
 * Simulate a single full game with play-by-play output
 */
import { loadTeamFile, getAvailableTeams } from '../utils/dataLoader.js';
import { buildRoster } from '../core/rosterBuilder.js';
import { prepareMatchups } from '../core/matchupPreparer.js';
import { initGameState, simulateAtBat } from '../core/gameEngine.js';
import { checkGameEnd } from '../core/gameEndLogic.js';

async function main() {
  const teams = await getAvailableTeams();
  const homeTeam = teams.includes('CHC-2025') ? 'CHC-2025' : teams[0];
  const awayTeam = teams.includes('MIL-2025') ? 'MIL-2025' : teams[1];

  const [home, away] = await Promise.all([
    loadTeamFile(homeTeam),
    loadTeamFile(awayTeam)
  ]);

  const homeRoster = buildRoster(
    home.batters.slice(0, 9).map(b => b.player_id),
    home.pitchers[0].player_id,
    home.batters,
    home.pitchers
  );
  const awayRoster = buildRoster(
    away.batters.slice(0, 9).map(b => b.player_id),
    away.pitchers[0].player_id,
    away.batters,
    away.pitchers
  );

  const homeMatchups = prepareMatchups(homeRoster);
  const awayMatchups = prepareMatchups(awayRoster);
  const state = initGameState();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${awayTeam} (Away) @ ${homeTeam} (Home)`);
  console.log(`${'='.repeat(60)}\n`);

  let atBatCount = 0;
  const MAX_AT_BATS = 200;
  let gameOver = false;

  const endGame = (winner: 'Home' | 'Away', score: [number, number], inning: number, lastWasTop: boolean) => {
    gameOver = true;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  FINAL: ${winner} wins ${score[0]}-${score[1]}`);
    console.log(`  (${inning}${lastWasTop ? ' Top' : ' Bottom'})`);
    console.log(`${'='.repeat(60)}\n`);
  };

  while (!gameOver && atBatCount < MAX_AT_BATS) {
    atBatCount++;
    const teamIndex = state.top ? 0 : 1;
    const roster = teamIndex === 0 ? awayRoster : homeRoster;
    const batterIdx = state.lineupIndices[teamIndex] % roster.lineup.length;
    const batter = roster.lineup[batterIdx];

    const result = simulateAtBat(
      awayMatchups,
      homeMatchups,
      state,
      away.fielders,
      home.fielders,
      awayRoster,
      homeRoster
    );

    const inningHalf = state.top ? 'Top' : 'Bot';
    const scoreStr = `${state.score[0]}-${state.score[1]}`;
    const basesStr = `[${state.bases.map(b => b ? 'X' : '·').join('')}]`;
    console.log(`  ${state.inning}${inningHalf[0]} ${state.outs} out ${basesStr} ${scoreStr} | ${batter.name}: ${result.outcome}`);

    if (state.outs >= 3) {
      // Must check game end BEFORE transitioning (checkGameEnd expects outs===3)
      const shouldEnd = checkGameEnd({
        inning: state.inning,
        top: state.top,
        score: state.score as [number, number],
        outs: state.outs
      }, endGame);
      if (shouldEnd) gameOver = true;

      console.log(`  --- End of ${state.top ? 'top' : 'bottom'} of ${state.inning} ---`);
      state.bases = [null, null, null];
      state.outs = 0;
      if (state.top) {
        state.top = false;
      } else {
        state.top = true;
        state.inning++;
      }
    }

    // Walk-off check (home ahead during bottom half)
    if (!gameOver) {
      const shouldEnd = checkGameEnd({
        inning: state.inning,
        top: state.top,
        score: state.score as [number, number],
        outs: state.outs
      }, endGame);
      if (shouldEnd) gameOver = true;
    }
    if (state.inning > 15) {
      console.log(`\n  Game ended (inning limit). Final: ${state.score[0]}-${state.score[1]}`);
      gameOver = true;
    }
  }

  console.log(`\nTotal plate appearances: ${atBatCount}`);
}

main().catch(console.error);
