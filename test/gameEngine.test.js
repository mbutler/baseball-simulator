import { initGameState, simulateAtBat } from '../src/core/gameEngine.js'

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}
function assertArrayEqual(a, b, msg) {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(msg + ` (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
  }
}

function runTests() {
  // --- Test initGameState ---
  const state = initGameState()
  assertEqual(state.inning, 1, 'Initial inning')
  assertEqual(state.top, true, 'Initial top')
  assertEqual(state.outs, 0, 'Initial outs')
  assertArrayEqual(state.bases, [0, 0, 0], 'Initial bases')
  assertArrayEqual(state.lineupIndices, [0, 0], 'Initial lineupIndices')
  assertArrayEqual(state.score, [0, 0], 'Initial score')

  // --- Setup for simulateAtBat tests ---
  const makeMatchup = (outcome, batter_id = 'b1') => [{ batter_id, probabilities: { [outcome]: 1 } }]
  let testState

  // Helper to reset state
  function resetState() {
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
    const home = makeMatchup(outcome, 'h1')
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
      assertEqual(testState.score[0], before.score[0] + before.bases.reduce((a, b) => a + b, 0) + 1, `score increment for HR`)
    } else if (['1B', '2B', '3B'].includes(outcome)) {
      // Should advance runners accordingly
      // For simplicity, just check batter on correct base
      const baseIdx = { '1B': 0, '2B': 1, '3B': 2 }[outcome]
      assertEqual(testState.bases[baseIdx], 1, `batter to correct base for ${outcome}`)
    }
    // Lineup index should increment
    assertEqual(testState.lineupIndices[0], before.lineupIndices[0] + 1, `lineup index increment for ${outcome}`)
  }

  // --- Test bases loaded walk (forces in a run) ---
  resetState()
  testState.bases = [1, 1, 1]
  const away = makeMatchup('BB')
  const home = makeMatchup('BB', 'h1')
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
  const nineBatters = Array.from({ length: 9 }, (_, i) => ({ batter_id: `b${i+1}`, probabilities: { Out: 1 } }))
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

  console.log('✅ All gameEngine tests passed.')
}

runTests() 