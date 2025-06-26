import { normalizeBattingStats, normalizePitchingStats, normalizeFieldingStats } from '../src/utils/statNormalizer.js'

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

  // Test baserunning stats parsing
  const batterWithBaserunning = {
    name: 'Test Runner',
    player_id: 'test123',
    PA: '100',
    AB: '90',
    H: '30',
    HR: '5',
    BB: '8',
    SO: '20',
    SF: '1',
    HBP: '1',
    '2B': '8',
    '3B': '2',
    b_runs_baserunning: '2.5' // Positive baserunning runs = fast runner
  };
  
  const normalizedBatter = normalizeBattingStats([batterWithBaserunning])[0];
  assertEqual(normalizedBatter.baserunning.runsBaserunning, 2.5, 'baserunning runs parsed correctly');
  assertEqual(normalizedBatter.baserunning.speed, 75, 'speed calculated correctly (50 + 2.5 * 10)');

  // Test catcher fielding stats parsing
  const catcherWithStats = {
    name: 'Test Catcher',
    player_id: 'catcher123',
    Pos: 'C',
    G: '100',
    Inn: '900',
    PO: '800',
    A: '50',
    E: '5',
    DP: '10',
    FP: '0.994',
    RF: '8.5',
    TZ: '5',
    f_sb_catcher_only: '25',
    f_cs_catcher_only: '15',
    f_cs_perc_catcher_only: '37.5',
    f_pickoffs_catcher_only: '3'
  };
  
  const normalizedCatcher = normalizeFieldingStats([catcherWithStats])[0];
  assertEqual(normalizedCatcher.stats.sbAllowed, 25, 'stolen bases allowed parsed correctly');
  assertEqual(normalizedCatcher.stats.cs, 15, 'caught stealing parsed correctly');
  assertEqual(normalizedCatcher.stats.csPct, 37.5, 'caught stealing percentage parsed correctly');
  assertEqual(normalizedCatcher.stats.pickoffs, 3, 'pickoffs parsed correctly');
  assertEqual(normalizedCatcher.stats.armStrength, 75, 'arm strength calculated correctly (50 + (37.5 - 25) * 2)');

  console.log('✅ All statNormalizer tests passed.');
}

runTests() 