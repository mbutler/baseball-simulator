import { loadTeamFile } from '../utils/dataLoader.js';
import { buildRoster } from '../core/rosterBuilder.js';
import { prepareMatchups } from '../core/matchupPreparer.js';
import { initGameState, simulateAtBat } from '../core/gameEngine.js';
import { checkGameEnd } from '../core/gameEndLogic.js';

const HOME_TEAM = 'CHC-2025.html';
const AWAY_TEAM = 'MIL-2025.html';
const NUM_GAMES = 25;

async function simulateGame(homeFile: string, awayFile: string): Promise<{away: number, home: number}> {
  // Load teams
  const [home, away] = await Promise.all([
    loadTeamFile(homeFile),
    loadTeamFile(awayFile)
  ]);
  // Build rosters
  const homeRoster = buildRoster(
    home.batters.slice(0,9).map(b=>b.player_id),
    home.pitchers[0].player_id,
    home.batters,
    home.pitchers
  );
  const awayRoster = buildRoster(
    away.batters.slice(0,9).map(b=>b.player_id),
    away.pitchers[0].player_id,
    away.batters,
    away.pitchers
  );
  // Prepare matchups
  const homeMatchups = prepareMatchups(homeRoster);
  const awayMatchups = prepareMatchups(awayRoster);
  // Init game state
  const state = initGameState();
  // Simulate game
  let gameOver = false;
  let atBatCount = 0;
  const MAX_AT_BATS = 200; // Safety timeout
  
  // Proper endGame function that actually ends the game
  const endGame = (winner: 'Home' | 'Away', score: [number, number], inning: number, lastWasTop: boolean) => {
    gameOver = true;
    console.log(`🎯 Game ended: ${winner} wins ${score[0]}-${score[1]} in ${inning}${lastWasTop ? 'T' : 'B'}`);
  };
  
  while (!gameOver && atBatCount < MAX_AT_BATS) {
    atBatCount++;
    simulateAtBat(
      awayMatchups,
      homeMatchups,
      state,
      away.fielders,
      home.fielders,
      awayRoster,
      homeRoster
    );
    
    // Check for inning/half-inning transitions
    if (state.outs >= 3) {
      state.bases = [null, null, null];
      state.outs = 0;
      if (state.top) {
        state.top = false;
      } else {
        state.top = true;
        state.inning++;
      }
    }
    
    // Debug logging every 50 at-bats
    if (atBatCount % 50 === 0) {
      console.log(`  At-bat ${atBatCount}: ${state.inning}${state.top ? 'T' : 'B'}, ${state.outs} outs, ${state.score[0]}-${state.score[1]}`);
    }
    
    // Check for game end
    const shouldEnd = checkGameEnd({
      inning: state.inning,
      top: state.top,
      score: state.score as [number, number],
      outs: state.outs
    }, endGame);
    
    if (shouldEnd) {
      gameOver = true;
    }
    
    // Add maximum inning limit for testing (15 innings)
    if (state.inning > 15) {
      console.log(`⏰ Game ended due to inning limit: ${state.inning}${state.top ? 'T' : 'B'}, ${state.score[0]}-${state.score[1]}`);
      gameOver = true;
    }
  }
  
  if (atBatCount >= MAX_AT_BATS) {
    console.log(`⚠️ Game hit safety timeout after ${MAX_AT_BATS} at-bats. Final state: ${state.inning}${state.top ? 'T' : 'B'}, ${state.outs} outs, ${state.score[0]}-${state.score[1]}`);
  }
  
  return { away: state.score[0], home: state.score[1] };
}

async function main() {
  console.log(`Starting simulation of ${NUM_GAMES} games...`);
  let totalHome = 0, totalAway = 0;
  let homeWins = 0, awayWins = 0, ties = 0;
  const scoreDist: Record<string, number> = {};
  for (let i = 0; i < NUM_GAMES; i++) {
    console.log(`Simulating game ${i + 1}/${NUM_GAMES}...`);
    const { away, home } = await simulateGame(HOME_TEAM, AWAY_TEAM);
    console.log(`Game ${i + 1} result: ${away}-${home}`);
    totalHome += home;
    totalAway += away;
    if (home > away) homeWins++;
    else if (away > home) awayWins++;
    else ties++;
    const key = `${away}-${home}`;
    scoreDist[key] = (scoreDist[key] || 0) + 1;
  }
  console.log(`\nSimulated ${NUM_GAMES} games: ${HOME_TEAM.replace('.html','')} (home) vs ${AWAY_TEAM.replace('.html','')} (away)`);
  console.log(`Average Home: ${(totalHome/NUM_GAMES).toFixed(2)}, Average Away: ${(totalAway/NUM_GAMES).toFixed(2)}`);
  console.log(`Home Wins: ${homeWins}, Away Wins: ${awayWins}, Ties: ${ties}`);
  console.log('Score distribution (Away-Home):');
  Object.entries(scoreDist).sort((a,b)=>b[1]-a[1]).forEach(([score, count]) => {
    console.log(`${score}: ${count}`);
  });
}

main(); 