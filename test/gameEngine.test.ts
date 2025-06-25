import { initGameState, simulateAtBat, attemptSteal, attemptPickoff, type GameState } from '../src/core/gameEngine.js'

function assertEqual(actual: any, expected: any, msg: string): void {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}

function assertArrayEqual(a: any[], b: any[], msg: string): void {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(msg + ` (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
  }
}

function runTests(): void {
  console.log('Running gameEngine.test.ts');
  // --- Test initGameState ---
  const state = initGameState()
  assertEqual(state.inning, 1, 'Initial inning')
  assertEqual(state.top, true, 'Initial top')
  assertEqual(state.outs, 0, 'Initial outs')
  assertArrayEqual(state.bases, [0, 0, 0], 'Initial bases')
  assertArrayEqual(state.lineupIndices, [0, 0], 'Initial lineupIndices')
  assertArrayEqual(state.score, [0, 0], 'Initial score')

  // --- Setup for simulateAtBat tests ---
  const makeMatchup = (outcome: string, batter_id = 'b1', pitcher_id = 'p1') => [{
    batter_id,
    pitcher_id,
    probabilities: {
      K: outcome === 'K' ? 1 : 0,
      BB: outcome === 'BB' ? 1 : 0,
      HBP: outcome === 'HBP' ? 1 : 0,
      HR: outcome === 'HR' ? 1 : 0,
      '1B': outcome === '1B' ? 1 : 0,
      '2B': outcome === '2B' ? 1 : 0,
      '3B': outcome === '3B' ? 1 : 0,
      Out: outcome === 'Out' ? 1 : 0
    }
  }]
  let testState: GameState = initGameState()

  // Helper to reset state
  function resetState(): void {
    testState = initGameState()
    testState.bases = [0, 0, 0]
    testState.outs = 0
    testState.score = [0, 0]
    testState.lineupIndices = [0, 0]
    testState.inning = 1
    testState.top = true
  }

  // --- Test all outcomes ---
  const outcomes = ['Out', 'K', 'BB', 'HBP', 'HR', '1B', '2B', '3B']
  for (const outcome of outcomes) {
    resetState()
    const forcedOutcome = outcome
    const forcedDescription = outcome
    const away = makeMatchup(outcome)
    const home = makeMatchup(outcome, 'h1', 'p2')
    const before = JSON.parse(JSON.stringify(testState))
    const result = simulateAtBat(
      away,
      home,
      testState,
      [],
      [],
      () => forcedOutcome, // mock randomWeightedChoice
      () => forcedDescription // mock describeOutcome
    )
    // Check batter_id and outcome
    assertEqual(result.batter_id, 'b1', `batter_id for outcome ${outcome}`)
    assertEqual(result.outcome, outcome, `outcome description for ${outcome}`)
    // Check state transitions
    if (outcome === 'Out' || outcome === 'K') {
      assertEqual(testState.outs, before.outs + 1, `outs increment for ${outcome}`)
      assertArrayEqual(testState.bases, before.bases, `bases unchanged for ${outcome}`)
      assertArrayEqual(testState.score, before.score, `score unchanged for ${outcome}`)
    } else if (outcome === 'BB' || outcome === 'HBP') {
      // Should advance runners as a single
      assertEqual(testState.outs, before.outs, `outs unchanged for ${outcome}`)
      // If bases empty, runner to first
      assertEqual(testState.bases[0], 1, `runner to first for ${outcome}`)
    } else if (outcome === 'HR') {
      // All runners score, bases empty
      assertEqual(testState.bases[0], 0, `bases empty after HR`)
      assertEqual(testState.bases[1], 0, `bases empty after HR`)
      assertEqual(testState.bases[2], 0, `bases empty after HR`)
      assertEqual(testState.score[0], before.score[0] + before.bases.reduce((a: number, b: number) => a + b, 0) + 1, `score increment for HR`)
    } else if (['1B', '2B', '3B'].includes(outcome)) {
      // Should advance runners accordingly
      // For simplicity, just check batter on correct base
      const baseMap: Record<string, number> = { '1B': 0, '2B': 1, '3B': 2 }
      const baseIdx = baseMap[outcome]
      assertEqual(testState.bases[baseIdx], 1, `batter to correct base for ${outcome}`)
    }
    // Lineup index should increment
    assertEqual(testState.lineupIndices[0], before.lineupIndices[0] + 1, `lineup index increment for ${outcome}`)
  }

  // --- Test bases loaded walk (forces in a run) ---
  resetState()
  testState.bases = [1, 1, 1]
  const away = makeMatchup('BB')
  const home = makeMatchup('BB', 'h1', 'p2')
  const beforeScore = testState.score[0]
  simulateAtBat(
    away,
    home,
    testState,
    [],
    [],
    () => 'BB',
    () => 'BB'
  )
  assertEqual(testState.score[0], beforeScore + 1, 'run forced in on bases loaded walk')

  // --- Test bases loaded single (should score one run, runners advance one base) ---
  resetState()
  testState.bases = [1, 1, 1]
  simulateAtBat(
    away,
    home,
    testState,
    [],
    [],
    () => '1B',
    () => '1B'
  )
  // Runner from third should score
  assertEqual(testState.score[0], 1, 'run scored on bases loaded single')
  // Runners should advance one base
  assertEqual(testState.bases[2], 1, 'runner to third after single')
  assertEqual(testState.bases[1], 1, 'runner to second after single')
  assertEqual(testState.bases[0], 1, 'batter to first after single')

  // --- Test lineup index wraps around ---
  resetState()
  testState.lineupIndices[0] = 8
  const nineBatters = Array.from({ length: 9 }, (_, i) => ({
    batter_id: `b${i+1}`,
    pitcher_id: 'p1',
    probabilities: {
      K: 0,
      BB: 0,
      HBP: 0,
      HR: 0,
      '1B': 0,
      '2B': 0,
      '3B': 0,
      Out: 1
    }
  }))
  simulateAtBat(
    nineBatters,
    home,
    testState,
    [],
    [],
    () => 'Out',
    () => 'Out'
  )
  assertEqual(testState.lineupIndices[0], 9, 'lineup index increments to 9')
  simulateAtBat(
    nineBatters,
    home,
    testState,
    [],
    [],
    () => 'Out',
    () => 'Out'
  )
  assertEqual(testState.lineupIndices[0], 10, 'lineup index increments to 10 (wraps with modulo in code)')

  // --- Tests for attemptSteal and attemptPickoff ---
  function makePlayer(stats: any = {}): any {
    return { stats }
  }

  function always(val: any): () => any {
    return () => val
  }

  // Steal: success (force random < prob)
  resetState()
  testState.bases = [1, 0, 0] // runner on 1B
  let stealResult = attemptSteal(2, testState, makePlayer({ SPD: 80 }), makePlayer(), makePlayer({ ARM: 40 }), 1, always(0.1))
  assertEqual(stealResult.success, true, 'Steal 2B success')
  assertEqual(testState.bases[0], 0, '1B empty after steal')
  assertEqual(testState.bases[1], 1, '2B occupied after steal')

  // Steal: failure (force random > prob)
  resetState()
  testState.bases = [1, 0, 0]
  stealResult = attemptSteal(2, testState, makePlayer({ SPD: 40 }), makePlayer(), makePlayer({ ARM: 80 }), 1, always(0.99))
  assertEqual(stealResult.success, false, 'Steal 2B fail')
  assertEqual(testState.bases[0], 0, '1B empty after caught stealing')
  assertEqual(testState.bases[1], 0, '2B empty after caught stealing')
  assertEqual(testState.outs, 1, 'Out incremented on caught stealing')

  // Steal: no runner on base
  resetState()
  testState.bases = [0, 0, 0]
  stealResult = attemptSteal(2, testState, makePlayer(), makePlayer(), makePlayer(), 1, always(0.1))
  assertEqual(stealResult.success, false, 'No runner to steal')

  // Steal: stealing home
  resetState()
  testState.bases = [0, 0, 1]
  let beforeScoreStealHome = testState.score[0]
  stealResult = attemptSteal(4, testState, makePlayer({ SPD: 80 }), makePlayer(), makePlayer({ ARM: 40 }), 3, always(0.1))
  assertEqual(stealResult.success, true, 'Steal home success')
  assertEqual(testState.bases[2], 0, '3B empty after steal home')
  assertEqual(testState.score[0], beforeScoreStealHome + 1, 'Score incremented on steal home')

  // Pickoff: success
  resetState()
  testState.bases = [1, 0, 0]
  let pickoffResult = attemptPickoff(1, testState, makePlayer({ SPD: 40 }), makePlayer({ PK: 90 }), makePlayer({ E: 0 }), always(0.01))
  assertEqual(pickoffResult.success, true, 'Pickoff success')
  assertEqual(testState.bases[0], 0, '1B empty after pickoff')
  assertEqual(testState.outs, 1, 'Out incremented on pickoff')

  // Pickoff: error (runner advances)
  resetState()
  testState.bases = [0, 1, 0]
  pickoffResult = attemptPickoff(2, testState, makePlayer({ SPD: 60 }), makePlayer({ PK: 50 }), makePlayer({ E: 100 }), always(0.11))
  assertEqual(pickoffResult.error, true, 'Pickoff error')
  assertEqual(testState.bases[1], 0, '2B empty after error')
  assertEqual(testState.bases[2], 1, '3B occupied after error')
  assertEqual(testState.outs, 0, 'Out unchanged on error')

  // Pickoff: failure (runner stays)
  resetState()
  testState.bases = [1, 0, 0]
  pickoffResult = attemptPickoff(1, testState, makePlayer({ SPD: 80 }), makePlayer({ PK: 40 }), makePlayer({ E: 0 }), always(0.99))
  assertEqual(pickoffResult.success, false, 'Pickoff failure')
  assertEqual(testState.bases[0], 1, '1B still occupied after failed pickoff')
  assertEqual(testState.outs, 0, 'Out unchanged on failed pickoff')

  // Pickoff: no runner on base
  resetState()
  testState.bases = [0, 0, 0]
  pickoffResult = attemptPickoff(1, testState, makePlayer(), makePlayer(), makePlayer(), always(0.1))
  assertEqual(pickoffResult.success, false, 'No runner to pickoff')

  console.log('All gameEngine tests passed!')
}

// Run tests if this file is executed directly
runTests() 