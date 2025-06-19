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
