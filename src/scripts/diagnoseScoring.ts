#!/usr/bin/env bun
/**
 * Diagnose run scoring: compare our simulation to MLB baselines
 */
import { loadTeamFile, getAvailableTeams } from '../utils/dataLoader.js';
import { buildRoster } from '../core/rosterBuilder.js';
import { prepareMatchups } from '../core/matchupPreparer.js';
import { initGameState, simulateAtBat } from '../core/gameEngine.js';
import { checkGameEnd } from '../core/gameEndLogic.js';
import { getAtBatProbabilities } from '../core/probabilityModel.js';

const NUM_GAMES = 100;

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

  const homeMatchups = prepareMatchups(homeRoster, awayRoster);
  const awayMatchups = prepareMatchups(awayRoster, homeRoster);

  // --- Sample probability outputs from first few batters ---
  console.log('\n=== Probability Model Sample (first 3 batters vs pitcher) ===');
  for (let i = 0; i < 3; i++) {
    const batter = awayRoster.lineup[i];
    const pitcher = homeRoster.pitcher;
    const probs = getAtBatProbabilities(batter, pitcher);
    // Strikeouts are outs; reaching base = BB + HBP + HR + 1B + 2B + 3B.
    const outRate = probs.Out + probs.K;
    const reachRate = probs.BB + probs.HBP + probs.HR + probs['1B'] + probs['2B'] + probs['3B'];
    console.log(`  ${batter.name}: Out=${(outRate * 100).toFixed(1)}% (K=${(probs.K * 100).toFixed(1)}%) Reach=${(reachRate * 100).toFixed(1)}%`);
  }

  // --- MLB baselines (2024) ---
  console.log('\n=== MLB 2024 Baselines ===');
  console.log('  Runs/team/game: ~4.3');
  console.log('  Total runs/game: ~8.6');
  console.log('  Outs/team/game: 27');
  console.log('  PA/team/game: ~38.5');
  console.log('  Out rate (outs/PA): ~70%');
  console.log('  Reach rate: ~30%');

  // --- Simulate games ---
  let totalHomeRuns = 0;
  let totalAwayRuns = 0;
  let totalPA = 0;
  let gamesHitInningLimit = 0;
  const runTotals: number[] = [];

  for (let g = 0; g < NUM_GAMES; g++) {
    const state = initGameState();
    let gameOver = false;
    let paCount = 0;

    const endGame = () => { gameOver = true; };

    while (!gameOver && paCount < 200) {
      paCount++;
      simulateAtBat(
        awayMatchups,
        homeMatchups,
        state,
        away.fielders,
        home.fielders,
        awayRoster,
        homeRoster
      );

      if (state.outs >= 3) {
        checkGameEnd({
          inning: state.inning,
          top: state.top,
          score: state.score as [number, number],
          outs: state.outs
        }, endGame);

        state.bases = [null, null, null];
        state.outs = 0;
        state.top = !state.top;
        if (!state.top) state.inning++;
      }

      if (!gameOver) {
        checkGameEnd({
          inning: state.inning,
          top: state.top,
          score: state.score as [number, number],
          outs: state.outs
        }, endGame);
      }

      if (state.inning > 15) {
        gamesHitInningLimit++;
        gameOver = true;
      }
    }

    totalHomeRuns += state.score[1];
    totalAwayRuns += state.score[0];
    totalPA += paCount;
    runTotals.push(state.score[0] + state.score[1]);
  }

  // Fix totalOuts - we need to count properly. Each game has 27 outs per team when it ends in 9.
  // Simpler: total outs = games * 27 * 2 when 9 innings, but extras add more.
  // Let's just report runs and PA.
  const avgRunsPerGame = (totalHomeRuns + totalAwayRuns) / NUM_GAMES;
  const avgPAPerGame = totalPA / NUM_GAMES;
  const avgHomeRuns = totalHomeRuns / NUM_GAMES;
  const avgAwayRuns = totalAwayRuns / NUM_GAMES;

  console.log('\n=== Simulation Results ===');
  console.log(`  Games simulated: ${NUM_GAMES}`);
  console.log(`  Games hit 15-inning limit: ${gamesHitInningLimit}`);
  console.log(`  Avg total runs/game: ${avgRunsPerGame.toFixed(2)} (MLB: ~8.6)`);
  console.log(`  Avg home runs/game: ${avgHomeRuns.toFixed(2)} (MLB: ~4.3)`);
  console.log(`  Avg away runs/game: ${avgAwayRuns.toFixed(2)} (MLB: ~4.3)`);
  console.log(`  Avg PA/game: ${avgPAPerGame.toFixed(1)} (MLB 9-inning: ~77)`);
  console.log(`  Run distribution: min=${Math.min(...runTotals)} max=${Math.max(...runTotals)}`);
  console.log(`  (For 9-inning game: 54 outs / ~77 PA = 70% out rate needed)`);
}

main().catch(console.error);
