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

runTests()
