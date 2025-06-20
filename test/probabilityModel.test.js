import { getAtBatProbabilities } from '../src/core/probabilityModel.js'

/**
 * Asserts that two numbers are approximately equal.
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance
 */
function assertClose(actual, expected, tolerance = 1e-4) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${expected}, got ${actual}`)
  }
}

function runTests() {
  const mockBatter = {
    PA: 500,
    stats: {
      HBP: 5,
      singles: 80,
      doubles: 25,
      triples: 5
    },
    rates: {
      kRate: 0.22,
      bbRate: 0.09,
      hrRate: 0.04,
      BABIP: 0.31
    }
  }

  const mockPitcher = {
    rates: {
      kRate: 0.26,
      bbRate: 0.08,
      hrRate: 0.03,
      BABIP: 0.29
    }
  }

  const result = getAtBatProbabilities(mockBatter, mockPitcher)

  console.log('🎲 At-bat probabilities:')
  for (const [k, v] of Object.entries(result)) {
    console.log(`   ${k}: ${v.toFixed(4)}`)
  }

  // Check keys
  const expectedKeys = ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out']
  for (const key of expectedKeys) {
    if (!(key in result)) {
      throw new Error(`Missing outcome: ${key}`)
    }
  }

  // Sanity: each value is in [0, 1]
  for (const [k, v] of Object.entries(result)) {
    if (v < 0 || v > 1) {
      throw new Error(`Invalid probability for ${k}: ${v}`)
    }
  }

  // Sum to ~1.0
  const total = Object.values(result).reduce((sum, p) => sum + p, 0)
  assertClose(total, 1.0, 1e-3)

  console.log('✅ Passed all probability model tests.')
}

runTests()

// --- Additional Ironclad Tests ---

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

function testMinimalInput() {
  const result = getAtBatProbabilities({}, {})
  const keys = ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out']
  assertAllKeysPresent(result, keys)
  assertAllInRange(result, 0, 1)
  assertClose(Object.values(result).reduce((a, b) => a + b, 0), 1, 1e-3)
}

testMinimalInput()

function testMissingRatesAndStats() {
  const batter = { PA: 100 }
  const pitcher = {}
  const result = getAtBatProbabilities(batter, pitcher)
  assertAllKeysPresent(result, ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'])
  assertAllInRange(result, 0, 1)
}

testMissingRatesAndStats()

function testZeroPA() {
  const batter = { PA: 0, stats: { HBP: 0 }, rates: { kRate: 0.2 } }
  const pitcher = { rates: { kRate: 0.2 } }
  const result = getAtBatProbabilities(batter, pitcher)
  assertAllKeysPresent(result, ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'])
  assertAllInRange(result, 0, 1)
}

testZeroPA()

function testAllStrikeouts() {
  const batter = { PA: 100, stats: {}, rates: { kRate: 1 } }
  const pitcher = { rates: { kRate: 1 } }
  const result = getAtBatProbabilities(batter, pitcher)
  if (result.K < 0.99) throw new Error('All K test failed')
  assertClose(result.K + result.Out + result.BB + result.HBP + result.HR + result['1B'] + result['2B'] + result['3B'], 1, 1e-3)
}

testAllStrikeouts()

function testAllHomeRuns() {
  const batter = { PA: 100, stats: {}, rates: { hrRate: 1 } }
  const pitcher = { rates: { hrRate: 1 } }
  const result = getAtBatProbabilities(batter, pitcher)
  if (result.HR < 0.99) throw new Error('All HR test failed')
  assertClose(Object.values(result).reduce((a, b) => a + b, 0), 1, 1e-3)
}

testAllHomeRuns()

function testAllWalks() {
  const batter = { PA: 100, stats: {}, rates: { bbRate: 1 } }
  const pitcher = { rates: { bbRate: 1 } }
  const result = getAtBatProbabilities(batter, pitcher)
  if (result.BB < 0.99) throw new Error('All BB test failed')
  assertClose(Object.values(result).reduce((a, b) => a + b, 0), 1, 1e-3)
}

testAllWalks()

function testAllHBP() {
  const batter = { PA: 100, stats: { HBP: 100 }, rates: {} }
  const pitcher = { rates: {} }
  const result = getAtBatProbabilities(batter, pitcher)
  if (result.HBP < 0.99) throw new Error('All HBP test failed')
  assertClose(Object.values(result).reduce((a, b) => a + b, 0), 1, 1e-3)
}

testAllHBP()

function testNoHitsFallbackDistribution() {
  const batter = { PA: 100, stats: { singles: 0, doubles: 0, triples: 0 }, rates: { BABIP: 0.3 } }
  const pitcher = { rates: { BABIP: 0.3 } }
  const result = getAtBatProbabilities(batter, pitcher)
  // If no hits, fallback to 0.7/0.2/0.1 split
  const hitSum = result['1B'] + result['2B'] + result['3B']
  if (hitSum > 0) {
    assertClose(result['1B'] / hitSum, 0.7, 1e-2)
    assertClose(result['2B'] / hitSum, 0.2, 1e-2)
    assertClose(result['3B'] / hitSum, 0.1, 1e-2)
  }
}

testNoHitsFallbackDistribution()

function testNegativeStats() {
  const batter = { PA: 100, stats: { singles: -10, doubles: -5, triples: -1, HBP: -2 }, rates: { kRate: -0.1, bbRate: -0.1, hrRate: -0.1, BABIP: -0.1 } }
  const pitcher = { rates: { kRate: -0.1, bbRate: -0.1, hrRate: -0.1, BABIP: -0.1 } }
  const result = getAtBatProbabilities(batter, pitcher)
  assertAllKeysPresent(result, ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'])
  assertAllInRange(result, 0, 1)
  assertClose(Object.values(result).reduce((a, b) => a + b, 0), 1, 1e-3)
}

testNegativeStats()

console.log('✅ All expanded probability model tests passed.')
