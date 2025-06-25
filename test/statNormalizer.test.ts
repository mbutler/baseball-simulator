import { normalizeBattingStats, normalizePitchingStats } from '../src/utils/statNormalizer.js'

function assertEqual(actual: any, expected: any, msg: string): void {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}

function runTests(): void {
  console.log('Running statNormalizer.test.ts');

  // Test batting stats normalization
  const battingStats = [
    { 
      name: 'John Doe', 
      player_id: 'johndoe',
      PA: 100, 
      AB: 85,
      H: 25,
      HR: 10, 
      BB: 15, 
      SO: 20, 
      '1B': 20, 
      '2B': 5, 
      '3B': 1, 
      HBP: 2 
    },
    { 
      name: 'Jane Smith', 
      player_id: 'janesmith',
      PA: 150, 
      AB: 130,
      H: 40,
      HR: 15, 
      BB: 20, 
      SO: 25, 
      '1B': 30, 
      '2B': 8, 
      '3B': 2, 
      HBP: 3 
    }
  ];
  const normalizedBatting = normalizeBattingStats(battingStats);
  assertEqual(normalizedBatting.length, 2, 'Two batters normalized');
  assertEqual(normalizedBatting[0].player_id, 'johndoe', 'Player ID preserved');
  assertEqual(normalizedBatting[0].PA, 100, 'PA preserved');
  assertEqual(normalizedBatting[0].stats.HR, 10, 'HR preserved');

  // Test pitching stats normalization
  const pitchingStats = [
    { 
      name: 'Bob Johnson', 
      player_id: 'bobjohnson',
      IP: 150, 
      TBF: 600,
      H: 120,
      K: 120, 
      BB: 45, 
      HR: 15,
      SO: 120
    },
    { 
      name: 'Alice Brown', 
      player_id: 'alicebrown',
      IP: 180, 
      TBF: 720,
      H: 140,
      K: 140, 
      BB: 50, 
      HR: 18,
      SO: 140
    }
  ];
  const normalizedPitching = normalizePitchingStats(pitchingStats);
  assertEqual(normalizedPitching.length, 2, 'Two pitchers normalized');
  assertEqual(normalizedPitching[0].player_id, 'bobjohnson', 'Player ID preserved');
  assertEqual(normalizedPitching[0].stats.IP, 150, 'IP preserved');
  assertEqual(normalizedPitching[0].TBF, 600, 'TBF preserved');

  console.log('✅ All statNormalizer tests passed.');
}

runTests() 