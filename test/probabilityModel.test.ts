import { getAtBatProbabilities } from '../src/core/probabilityModel.js'

function assertEqual(actual: any, expected: any, msg: string): void {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}

function runTests(): void {
  console.log('Running probabilityModel.test.ts');

  // Test basic probability calculation
  const batter = {
    name: 'Test Batter',
    player_id: 'test1',
    PA: 100,
    stats: {
      H: 25,
      HR: 5,
      BB: 10,
      SO: 20,
      SF: 2,
      HBP: 1,
      singles: 15,
      doubles: 3,
      triples: 2
    },
    rates: {
      kRate: 0.20,
      bbRate: 0.10,
      hrRate: 0.05,
      BABIP: 0.300
    }
  };

  const pitcher = {
    name: 'Test Pitcher',
    player_id: 'test2',
    TBF: 200,
    stats: {
      IP: 50,
      H: 40,
      HR: 8,
      BB: 20,
      SO: 60,
      HBP: 2
    },
    rates: {
      kRate: 0.30,
      bbRate: 0.10,
      hrRate: 0.04,
      BABIP: 0.280
    }
  };

  const probabilities = getAtBatProbabilities(batter, pitcher);
  
  // Check that all required outcomes are present
  assertEqual(typeof probabilities.K, 'number', 'K probability is a number');
  assertEqual(typeof probabilities.BB, 'number', 'BB probability is a number');
  assertEqual(typeof probabilities.HR, 'number', 'HR probability is a number');
  assertEqual(typeof probabilities['1B'], 'number', '1B probability is a number');
  assertEqual(typeof probabilities['2B'], 'number', '2B probability is a number');
  assertEqual(typeof probabilities['3B'], 'number', '3B probability is a number');
  assertEqual(typeof probabilities.Out, 'number', 'Out probability is a number');

  // Check that probabilities sum to approximately 1
  const total = Object.values(probabilities).reduce((sum, prob) => sum + prob, 0);
  assertEqual(Math.abs(total - 1) < 0.01, true, 'Probabilities sum to approximately 1');

  console.log('✅ All probabilityModel tests passed.');
}

runTests() 