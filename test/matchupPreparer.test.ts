import { prepareMatchups } from '../src/core/matchupPreparer.js'

function assertEqual(actual: any, expected: any, msg: string): void {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}

function runTests(): void {
  console.log('Running matchupPreparer.test.ts');

  // Test basic matchup preparation
  const roster = {
    lineup: [
      {
        name: 'Batter 1',
        player_id: 'b1',
        PA: 100,
        stats: { H: 25, HR: 5, BB: 10, SO: 20, SF: 2, HBP: 1, singles: 15, doubles: 3, triples: 2 },
        rates: { kRate: 0.20, bbRate: 0.10, hrRate: 0.05, BABIP: 0.300 }
      },
      {
        name: 'Batter 2',
        player_id: 'b2',
        PA: 100,
        stats: { H: 30, HR: 8, BB: 12, SO: 15, SF: 1, HBP: 2, singles: 18, doubles: 4, triples: 1 },
        rates: { kRate: 0.15, bbRate: 0.12, hrRate: 0.08, BABIP: 0.320 }
      }
    ],
    pitcher: {
      name: 'Pitcher 1',
      player_id: 'p1',
      TBF: 200,
      stats: { IP: 50, H: 40, HR: 8, BB: 20, SO: 60, HBP: 2 },
      rates: { kRate: 0.30, bbRate: 0.10, hrRate: 0.04, BABIP: 0.280 }
    }
  };

  const matchups = prepareMatchups(roster);
  
  assertEqual(matchups.length, 2, 'Two matchups created');
  assertEqual(matchups[0].batter_id, 'b1', 'First matchup has correct batter');
  assertEqual(matchups[0].pitcher_id, 'p1', 'First matchup has correct pitcher');
  assertEqual(matchups[1].batter_id, 'b2', 'Second matchup has correct batter');
  assertEqual(matchups[1].pitcher_id, 'p1', 'Second matchup has correct pitcher');

  // Check that probabilities are present
  assertEqual(typeof matchups[0].probabilities.K, 'number', 'K probability is a number');
  assertEqual(typeof matchups[0].probabilities.BB, 'number', 'BB probability is a number');
  assertEqual(typeof matchups[0].probabilities.HR, 'number', 'HR probability is a number');

  console.log('✅ All matchupPreparer tests passed.');
}

runTests() 