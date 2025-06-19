import { normalizeBattingStats } from '../src/utils/statNormalizer.js'

function assertClose(actual, expected, tolerance = 1e-4) {
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    throw new Error(`Expected numeric values. Got ${typeof actual} and ${typeof expected}`)
  }
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${expected}, got ${actual}`)
  }
}

function runTests() {
  const standard = {
    name: 'Standard Hitter',
    player_id: 'std001',
    PA: 600,
    AB: 550,
    H: 160,
    HR: 25,
    BB: 50,
    SO: 120,
    SF: 5,
    HBP: 2,
    '2B': 30,
    '3B': 5
  }

  const missingOptional = {
    name: 'Fallback Guy',
    player_id: 'fallback001',
    PA: 300,
    AB: 280,
    H: 70,
    HR: 10,
    BB: 20,
    SO: 50
  }

  const zeroPA = {
    name: 'Zero PA',
    player_id: 'zero001',
    PA: 0,
    AB: 0,
    H: 0,
    HR: 0,
    BB: 0,
    SO: 0
  }

  const homerOnly = {
    name: 'HR Only',
    player_id: 'hr001',
    PA: 100,
    AB: 100,
    H: 10,
    HR: 10,
    BB: 0,
    SO: 0,
    SF: 0
  }

  const stringValues = {
    name: 'Strings',
    player_id: 'str001',
    PA: '400',
    AB: '360',
    H: '100',
    HR: '20',
    BB: '30',
    SO: '80',
    SF: '4',
    '2B': '25',
    '3B': '5'
  }

  const all = [standard, missingOptional, zeroPA, homerOnly, stringValues]
  const results = normalizeBattingStats(all)

  console.log('✅ Total normalized:', results.length)
  if (results.length !== all.length) throw new Error('Wrong result length')

  // Check standard
  const std = results[0]
  assertClose(std.rates.kRate, 120 / 600)
  assertClose(std.rates.bbRate, 50 / 600)
  assertClose(std.rates.hrRate, 25 / 600)
  const babipStd = (160 - 25) / (550 - 120 - 25 + 5)
  assertClose(std.rates.BABIP, babipStd)

  // Missing optional
  const fallback = results[1]
  const singles = 70 - 0 - 0 - 10
  if (fallback.stats.singles !== singles) throw new Error('Incorrect singles calc')

  // Zero PA
  const zero = results[2]
  if (zero.rates.kRate !== null) throw new Error('Expected null kRate for zero PA')

  // HR only
  const hr = results[3]
  assertClose(hr.stats.singles, 0)
  assertClose(hr.rates.hrRate, 10 / 100)
  if (hr.rates.BABIP !== 0) throw new Error('Expected 0 BABIP for HR-only hitter')

  // String input
  const str = results[4]
  assertClose(str.rates.kRate, 80 / 400)
  assertClose(str.stats.triples, 5)

  console.log('✅ All test cases passed')
}

runTests()
