import { normalizeBattingStats } from '../src/utils/statNormalizer.js'
import { normalizePitchingStats } from '../src/utils/statNormalizer.js'

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

function runPitchingTests() {
  const standard = {
    name: 'Standard Pitcher',
    player_id: 'p001',
    IP: 180,
    TBF: 750,
    H: 160,
    HR: 20,
    BB: 60,
    SO: 180,
    HBP: 5
  }

  const missingOptional = {
    name: 'No HBP',
    player_id: 'p002',
    IP: 100,
    TBF: 400,
    H: 90,
    HR: 10,
    BB: 30,
    SO: 100
    // HBP missing
  }

  const zeroTBF = {
    name: 'Zero TBF',
    player_id: 'p003',
    IP: 0,
    TBF: 0,
    H: 0,
    HR: 0,
    BB: 0,
    SO: 0,
    HBP: 0
  }

  const allHR = {
    name: 'All HR',
    player_id: 'p004',
    IP: 10,
    TBF: 10,
    H: 10,
    HR: 10,
    BB: 0,
    SO: 0,
    HBP: 0
  }

  const allSO = {
    name: 'All SO',
    player_id: 'p005',
    IP: 10,
    TBF: 10,
    H: 0,
    HR: 0,
    BB: 0,
    SO: 10,
    HBP: 0
  }

  const stringValues = {
    name: 'Strings',
    player_id: 'p006',
    IP: '50',
    TBF: '200',
    H: '40',
    HR: '5',
    BB: '10',
    SO: '50',
    HBP: '2'
  }

  const negativeStats = {
    name: 'Negative',
    player_id: 'p007',
    IP: -10,
    TBF: -100,
    H: -20,
    HR: -2,
    BB: -5,
    SO: -10,
    HBP: -1
  }

  const all = [standard, missingOptional, zeroTBF, allHR, allSO, stringValues, negativeStats]
  const results = normalizePitchingStats(all)

  console.log('✅ Total normalized pitchers:', results.length)
  if (results.length !== all.length) throw new Error('Wrong result length (pitchers)')

  // Standard
  const std = results[0]
  assertClose(std.rates.kRate, 180 / 750)
  assertClose(std.rates.bbRate, 60 / 750)
  assertClose(std.rates.hrRate, 20 / 750)
  const bip = 750 - 180 - 20 - 60 - 5
  const babipStd = bip > 0 ? (160 - 20) / bip : null
  assertClose(std.rates.BABIP, babipStd)

  // Missing optional
  const miss = results[1]
  assertClose(miss.rates.kRate, 100 / 400)
  assertClose(miss.rates.bbRate, 30 / 400)
  assertClose(miss.rates.hrRate, 10 / 400)
  const bipMiss = 400 - 100 - 10 - 30 - 0
  const babipMiss = bipMiss > 0 ? (90 - 10) / bipMiss : null
  assertClose(miss.rates.BABIP, babipMiss)

  // Zero TBF
  const zero = results[2]
  if (zero.rates.kRate !== null) throw new Error('Expected null kRate for zero TBF')
  if (zero.rates.BABIP !== null) throw new Error('Expected null BABIP for zero TBF')

  // All HR
  const hr = results[3]
  assertClose(hr.rates.hrRate, 1)
  // All SO
  const so = results[4]
  assertClose(so.rates.kRate, 1)
  // String input
  const str = results[5]
  assertClose(str.rates.kRate, 50 / 200)
  assertClose(str.stats.HBP, 2)
  // Negative input
  const neg = results[6]
  if (neg.rates.kRate !== null) throw new Error('Expected null kRate for negative TBF')
  if (neg.rates.BABIP !== null) throw new Error('Expected null BABIP for negative TBF')

  // Output structure
  for (const r of results) {
    if (!('player_id' in r) || !('stats' in r) || !('rates' in r)) {
      throw new Error('Missing output keys in pitcher normalization')
    }
  }

  console.log('✅ All pitching normalization test cases passed')
}

runTests()
runPitchingTests()
