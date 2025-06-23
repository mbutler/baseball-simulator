import { initGameState, simulateAtBat } from '../src/core/gameEngine.js'

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}
function assertArrayEqual(a, b, msg) {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(msg + ` (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
  }
}

// Helper: create a fielder object for a given position and error stats
function makeFielder(position, { E = 0, PO = 0, A = 0, Inn = 0 } = {}) {
  return {
    position,
    stats: { E, PO, A, Inn }
  }
}

// Helper: always return the same outcome and description
function makeDefensiveTestMatchup(outcome, batter_id = 'b1') {
  return [{ batter_id, probabilities: { [outcome]: 1 } }]
}

function runDefenseTests() {
  let testState
  function resetState() {
    testState = initGameState()
    testState.bases = [0, 0, 0]
    testState.outs = 0
    testState.score = [0, 0]
    testState.lineupIndices = [0, 0]
    testState.inning = 1
    testState.top = true
  }

  // 1. No error (fielder with E=0)
  resetState()
  const ssNoError = makeFielder('SS', { E: 0, PO: 10, A: 10 })
  let result = simulateAtBat(
    makeDefensiveTestMatchup('Out'),
    makeDefensiveTestMatchup('Out', 'h1'),
    testState,
    [ssNoError], // awayFielders
    [ssNoError], // homeFielders
    () => 'Out',
    () => 'Groundout to SS'
  )
  assertEqual(result.outcome, 'Groundout to SS', 'No error when E=0')
  assertEqual(testState.outs, 1, 'Outs increment on normal out')

  // 2. Always error (fielder with 100% error rate)
  resetState()
  const ssAlwaysError = makeFielder('SS', { E: 10, PO: 0, A: 0 })
  result = simulateAtBat(
    makeDefensiveTestMatchup('Out'),
    makeDefensiveTestMatchup('Out', 'h1'),
    testState,
    [ssAlwaysError],
    [ssAlwaysError],
    () => 'Out',
    () => 'Groundout to SS'
  )
  assertEqual(result.outcome, 'Error on SS', 'Error occurs when error rate is 100%')
  assertEqual(testState.outs, 0, 'No out recorded on error')
  assertEqual(testState.bases[0], 1, 'Batter reaches first on error')

  // 3. Fallback error rate (no stats)
  resetState()
  const ssNoStats = { position: 'SS', stats: {} }
  let errorCount = 0
  for (let i = 0; i < 1000; i++) {
    resetState()
    result = simulateAtBat(
      makeDefensiveTestMatchup('Out'),
      makeDefensiveTestMatchup('Out', 'h1'),
      testState,
      [ssNoStats],
      [ssNoStats],
      () => 'Out',
      () => 'Groundout to SS'
    )
    if (result.outcome === 'Error on SS') errorCount++
  }
  console.log('Fallback error rate (should be ~1%):', errorCount / 10, '%')

  // 4. Error advances runners
  resetState()
  testState.bases = [1, 1, 0] // runners on 1st and 2nd
  result = simulateAtBat(
    makeDefensiveTestMatchup('Out'),
    makeDefensiveTestMatchup('Out', 'h1'),
    testState,
    [ssAlwaysError],
    [ssAlwaysError],
    () => 'Out',
    () => 'Groundout to SS'
  )
  assertEqual(result.outcome, 'Error on SS', 'Error outcome with runners on')
  assertArrayEqual(testState.bases, [1, 1, 1], 'Runners advance as on single')
  assertEqual(testState.score[0], 0, 'No run scores if bases not loaded')

  // 5. Correct fielder identified
  resetState()
  const ss = makeFielder('SS', { E: 0, PO: 10, A: 10 })
  const cf = makeFielder('CF', { E: 0, PO: 10, A: 10 })
  result = simulateAtBat(
    makeDefensiveTestMatchup('Out'),
    makeDefensiveTestMatchup('Out', 'h1'),
    testState,
    [ss, cf],
    [ss, cf],
    () => 'Out',
    () => 'Flyout to CF'
  )
  assertEqual(result.fielderPosition, 'CF', 'Correct fielder position identified')
  assertEqual(result.fielder.position, 'CF', 'Correct fielder object returned')

  console.log('✅ Defensive error logic tests passed.')
}

runDefenseTests() 