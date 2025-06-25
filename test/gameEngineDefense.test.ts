import { simulateAtBat } from '../src/core/gameEngine.js'

function assertEqual(actual: any, expected: any, msg: string): void {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}

function runTests(): void {
  console.log('Running gameEngineDefense.test.ts');

  // Test defensive play simulation
  const awayMatchups = [
    {
      batter_id: 'b1',
      pitcher_id: 'p1',
      probabilities: {
        K: 0.1,
        BB: 0.1,
        HBP: 0.02,
        HR: 0.05,
        '1B': 0.15,
        '2B': 0.05,
        '3B': 0.01,
        Out: 0.52
      }
    }
  ];

  const homeMatchups = [
    {
      batter_id: 'h1',
      pitcher_id: 'p2',
      probabilities: {
        K: 0.1,
        BB: 0.1,
        HBP: 0.02,
        HR: 0.05,
        '1B': 0.15,
        '2B': 0.05,
        '3B': 0.01,
        Out: 0.52
      }
    }
  ];

  const gameState = {
    inning: 1,
    top: true,
    outs: 0,
    bases: [0, 0, 0],
    lineupIndices: [0, 0],
    score: [0, 0],
    pitcherFatigue: [{ battersFaced: 0 }, { battersFaced: 0 }]
  };

  const awayFielders = [
    { position: 'SS', stats: { E: 0.05 } },
    { position: '2B', stats: { E: 0.03 } }
  ];

  const homeFielders = [
    { position: 'SS', stats: { E: 0.04 } },
    { position: '2B', stats: { E: 0.02 } }
  ];

  // Test with forced outcome
  const result = simulateAtBat(
    awayMatchups,
    homeMatchups,
    gameState,
    awayFielders,
    homeFielders,
    () => 'Out', // Force an out
    () => 'Groundout to SS' // Force specific description
  );

  assertEqual(result.batter_id, 'b1', 'Correct batter ID');
  assertEqual(result.outcome, 'Error on SS', 'Correct outcome description');
  assertEqual(result.fielderPosition, 'SS', 'Correct fielder position');
  assertEqual(result.fielder?.position, 'SS', 'Correct fielder object');

  console.log('✅ All gameEngineDefense tests passed.');
}

runTests() 