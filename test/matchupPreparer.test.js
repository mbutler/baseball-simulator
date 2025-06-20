import { prepareMatchups } from '../src/core/matchupPreparer.js'

/**
 * Asserts that a number is close to an expected value.
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance
 */
function assertClose(actual, expected, tolerance = 1e-3) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${expected}, got ${actual}`)
  }
}

function assertAllKeysPresent(obj, keys) {
  for (const key of keys) {
    if (!(key in obj)) throw new Error(`Missing key: ${key}`)
  }
}

function assertAllInRange(obj, min, max) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'number' || v < min || v > max) {
      throw new Error(`Probability for ${k} out of range: ${v}`)
    }
  }
}

function runTests() {
  const mockLineup = Array.from({ length: 9 }, (_, i) => ({
    player_id: `batter${i + 1}`,
    PA: 500,
    stats: {
      HBP: 5,
      singles: 80,
      doubles: 25,
      triples: 5
    },
    rates: {
      kRate: 0.2,
      bbRate: 0.09,
      hrRate: 0.03,
      BABIP: 0.3
    }
  }))

  const mockPitcher = {
    player_id: 'pitcher1',
    rates: {
      kRate: 0.25,
      bbRate: 0.08,
      hrRate: 0.04,
      BABIP: 0.28
    }
  }

  const roster = { lineup: mockLineup, pitcher: mockPitcher }
  const matchups = prepareMatchups(roster)

  if (matchups.length !== 9) {
    throw new Error(`Expected 9 matchups, got ${matchups.length}`)
  }

  for (const matchup of matchups) {
    if (!matchup.batter_id || !matchup.pitcher_id || !matchup.probabilities) {
      throw new Error(`Malformed matchup: ${JSON.stringify(matchup)}`)
    }

    const expectedKeys = ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out']
    for (const key of expectedKeys) {
      if (!(key in matchup.probabilities)) {
        throw new Error(`Missing key ${key} in matchup ${matchup.batter_id}`)
      }
    }

    const total = Object.values(matchup.probabilities).reduce((sum, p) => sum + p, 0)
    assertClose(total, 1.0)
  }

  console.log('✅ All matchupPreparer tests passed.')
}

function runEdgeCaseTests() {
  // Fewer than 9 batters
  const shortLineup = [
    { player_id: 'b1', PA: 100, stats: {}, rates: {} },
    { player_id: 'b2', PA: 100, stats: {}, rates: {} }
  ]
  const pitcher = { player_id: 'p1', rates: {} }
  let matchups = prepareMatchups({ lineup: shortLineup, pitcher })
  if (matchups.length !== 2) throw new Error('Short lineup: wrong matchup count')
  for (const m of matchups) {
    assertAllKeysPresent(m.probabilities, ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'])
    assertAllInRange(m.probabilities, 0, 1)
  }

  // More than 9 batters
  const longLineup = Array.from({ length: 12 }, (_, i) => ({ player_id: `b${i+1}`, PA: 100, stats: {}, rates: {} }))
  matchups = prepareMatchups({ lineup: longLineup, pitcher })
  if (matchups.length !== 12) throw new Error('Long lineup: wrong matchup count')

  // Empty lineup
  matchups = prepareMatchups({ lineup: [], pitcher })
  if (matchups.length !== 0) throw new Error('Empty lineup: should return empty array')

  // Malformed/empty roster
  try {
    prepareMatchups({})
  } catch (e) {
    // Acceptable if it throws
  }
  try {
    prepareMatchups()
  } catch (e) {
    // Acceptable if it throws
  }

  // Batters with missing stats/rates
  const weirdLineup = [
    { player_id: 'b1' },
    { player_id: 'b2', stats: { HBP: 1 } },
    { player_id: 'b3', rates: { kRate: 0.1 } }
  ]
  matchups = prepareMatchups({ lineup: weirdLineup, pitcher })
  for (const m of matchups) {
    assertAllKeysPresent(m.probabilities, ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'])
    assertAllInRange(m.probabilities, 0, 1)
  }

  // Pitcher with missing rates
  const batter = { player_id: 'b1', PA: 100, stats: {}, rates: {} }
  matchups = prepareMatchups({ lineup: [batter], pitcher: { player_id: 'p1' } })
  assertAllKeysPresent(matchups[0].probabilities, ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'])

  // Duplicate player IDs
  const dupLineup = [
    { player_id: 'dup', PA: 100, stats: {}, rates: {} },
    { player_id: 'dup', PA: 100, stats: {}, rates: {} }
  ]
  matchups = prepareMatchups({ lineup: dupLineup, pitcher })
  if (matchups.length !== 2) throw new Error('Duplicate IDs: wrong matchup count')

  console.log('✅ All matchupPreparer edge case tests passed.')
}

runTests()
runEdgeCaseTests()
