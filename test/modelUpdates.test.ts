/**
 * Tests for model updates: log5, batter hit types, pitcher HBP, steal SB/CS/csPct, sacrifice fly
 */
import { describe, test, expect } from 'bun:test'
import { getAtBatProbabilities } from '../src/core/probabilityModel.js'
import { initGameState, simulateAtBat, attemptSteal } from '../src/core/gameEngine.js'

const makeBatter = (overrides: Record<string, any> = {}) => ({
  name: 'Test Batter',
  player_id: 'b1',
  PA: 500,
  stats: {
    H: 100,
    HR: 15,
    BB: 50,
    SO: 100,
    SF: 5,
    HBP: 5,
    singles: 60,
    doubles: 20,
    triples: 5
  },
  rates: { kRate: 0.20, bbRate: 0.10, hrRate: 0.03, BABIP: 0.30 },
  baserunning: { runsBaserunning: 0, speed: 50 },
  ...overrides
})

const makePitcher = (overrides: Record<string, any> = {}) => ({
  name: 'Test Pitcher',
  player_id: 'p1',
  TBF: 500,
  stats: { IP: 120, H: 100, HR: 15, BB: 50, SO: 120, HBP: 5 },
  rates: { kRate: 0.24, bbRate: 0.10, hrRate: 0.03, BABIP: 0.29 },
  ...overrides
})

describe('Log5 formula', () => {
  test('league-average batter vs league-average pitcher produces scaled K rate (minOutRate 65%)', () => {
    const batter = makeBatter({ rates: { kRate: 0.22, bbRate: 0.08, hrRate: 0.03, BABIP: 0.29 } })
    const pitcher = makePitcher({ rates: { kRate: 0.22, bbRate: 0.08, hrRate: 0.03, BABIP: 0.29 } })
    const probs = getAtBatProbabilities(batter, pitcher)
    // minOutRate scales non-out events; K should be ~10-16% after scaling
    expect(probs.K).toBeGreaterThan(0.08)
    expect(probs.K).toBeLessThan(0.20)
  })

  test('high-K batter vs high-K pitcher produces higher K than league average', () => {
    const batter = makeBatter({ rates: { kRate: 0.30, bbRate: 0.08, hrRate: 0.03, BABIP: 0.29 } })
    const pitcher = makePitcher({ rates: { kRate: 0.30, bbRate: 0.08, hrRate: 0.03, BABIP: 0.29 } })
    const probs = getAtBatProbabilities(batter, pitcher)
    expect(probs.K).toBeGreaterThan(0.14) // Scaled, but still higher than league-avg matchup
  })

  test('low-K batter vs low-K pitcher produces lower K than league average', () => {
    const batter = makeBatter({ rates: { kRate: 0.15, bbRate: 0.08, hrRate: 0.03, BABIP: 0.29 } })
    const pitcher = makePitcher({ rates: { kRate: 0.15, bbRate: 0.08, hrRate: 0.03, BABIP: 0.29 } })
    const probs = getAtBatProbabilities(batter, pitcher)
    expect(probs.K).toBeLessThan(0.18)
  })
})

describe('Batter-specific hit types', () => {
  test('batter with high doubles rate produces higher 2B probability', () => {
    const highDoublesBatter = makeBatter({
      stats: { H: 100, HR: 10, BB: 50, SO: 100, SF: 5, HBP: 5, singles: 50, doubles: 30, triples: 0 }
    })
    const lowDoublesBatter = makeBatter({
      stats: { H: 100, HR: 10, BB: 50, SO: 100, SF: 5, HBP: 5, singles: 75, doubles: 10, triples: 5 }
    })
    const pitcher = makePitcher()

    const probsHigh = getAtBatProbabilities(highDoublesBatter, pitcher)
    const probsLow = getAtBatProbabilities(lowDoublesBatter, pitcher)

    expect(probsHigh['2B']).toBeGreaterThan(probsLow['2B'])
  })

  test('batter with high triples rate produces higher 3B probability', () => {
    const highTriplesBatter = makeBatter({
      stats: { H: 100, HR: 5, BB: 50, SO: 100, SF: 5, HBP: 5, singles: 70, doubles: 15, triples: 10 }
    })
    const noTriplesBatter = makeBatter({
      stats: { H: 100, HR: 15, BB: 50, SO: 100, SF: 5, HBP: 5, singles: 70, doubles: 15, triples: 0 }
    })
    const pitcher = makePitcher()

    const probsHigh = getAtBatProbabilities(highTriplesBatter, pitcher)
    const probsLow = getAtBatProbabilities(noTriplesBatter, pitcher)

    expect(probsHigh['3B']).toBeGreaterThan(probsLow['3B'])
  })
})

describe('Pitcher HBP rate', () => {
  test('high-HBP pitcher produces higher HBP probability than low-HBP pitcher', () => {
    const batter = makeBatter({ stats: { ...makeBatter().stats, HBP: 5 } }) // ~1% HBP
    const highHbpPitcher = makePitcher({
      TBF: 500,
      stats: { IP: 120, H: 100, HR: 15, BB: 50, SO: 120, HBP: 15 } // 3% HBP
    })
    const lowHbpPitcher = makePitcher({
      TBF: 500,
      stats: { IP: 120, H: 100, HR: 15, BB: 50, SO: 120, HBP: 2 } // 0.4% HBP
    })

    const probsHigh = getAtBatProbabilities(batter, highHbpPitcher)
    const probsLow = getAtBatProbabilities(batter, lowHbpPitcher)

    expect(probsHigh.HBP).toBeGreaterThan(probsLow.HBP)
  })
})

describe('Steal model with SB/CS and catcher csPct', () => {
  const makeRunner = (overrides: Record<string, any> = {}) => ({
    name: 'Runner',
    player_id: 'r1',
    PA: 100,
    stats: { H: 30, HR: 5, BB: 10, SO: 20, SF: 1, HBP: 1, singles: 20, doubles: 5, triples: 1 },
    rates: {},
    baserunning: { runsBaserunning: 0, speed: 50 },
    ...overrides
  })

  test('runner with high SB rate has higher steal success than runner with low SB rate', () => {
    const baseStats = makeRunner().stats as Record<string, number>
    const highSbRunner = makeRunner({ stats: { ...baseStats, sb: 25, cs: 5 } }) // 83% success
    const lowSbRunner = makeRunner({ stats: { ...baseStats, sb: 5, cs: 25 } }) // 17% success

    const catcher = { stats: { csPct: 0.25, armStrength: 50 } }
    const pitcher = { stats: {} }

    // With random=0.5, high-SB runner (success prob ~0.83*0.75/0.75=0.83) should succeed
    const state1 = initGameState()
    state1.bases = [highSbRunner, null, null]
    const resultHigh = attemptSteal(2, state1, highSbRunner, pitcher, catcher, 1, () => 0.5)

    // Low-SB runner (success prob ~0.17*0.75/0.75=0.17) should fail with random=0.5
    const state2 = initGameState()
    state2.bases = [lowSbRunner, null, null]
    const resultLow = attemptSteal(2, state2, lowSbRunner, pitcher, catcher, 1, () => 0.5)

    expect(resultHigh.success).toBe(true)
    expect(resultLow.success).toBe(false)
  })

  test('catcher with high csPct produces lower steal success than catcher with low csPct', () => {
    const baseStats = makeRunner().stats as Record<string, number>
    const runner = makeRunner({ stats: { ...baseStats, sb: 20, cs: 10 } }) // 67% success
    const pitcher = { stats: {} }

    // With random=0.6: vs weak catcher (15% CS) success prob ~0.76, vs strong (40% CS) ~0.53
    const state1 = initGameState()
    state1.bases = [runner, null, null]
    const weakCatcher = { stats: { csPct: 0.15, armStrength: 40 } }
    const result1 = attemptSteal(2, state1, runner, pitcher, weakCatcher, 1, () => 0.6)

    const state2 = initGameState()
    state2.bases = [runner, null, null]
    const strongCatcher = { stats: { csPct: 0.40, armStrength: 80 } }
    const result2 = attemptSteal(2, state2, runner, pitcher, strongCatcher, 1, () => 0.6)

    // 0.6 is above success threshold for strong catcher, below for weak
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(false)
  })
})

describe('Sacrifice fly logic', () => {
  test('flyout with runner on 3B and <2 outs scores the runner and shows sacrifice fly', () => {
    const state = initGameState()
    state.top = true
    state.bases = [
      null,
      null,
      {
        name: 'Runner',
        player_id: 'r3',
        PA: 100,
        stats: {},
        rates: {},
        baserunning: { speed: 50, runsBaserunning: 0 }
      }
    ]
    state.outs = 1
    state.score = [0, 0]

    const matchup = [{
      batter_id: 'b1',
      pitcher_id: 'p1',
      probabilities: { K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, Out: 1 }
    }]
    const roster = {
      lineup: [{
        name: 'Batter',
        player_id: 'b1',
        PA: 100,
        stats: {},
        rates: {},
        baserunning: { speed: 50, runsBaserunning: 0 }
      }],
      pitcher: { name: 'P', player_id: 'p1', TBF: 100, stats: {}, rates: {} }
    }

    const result = simulateAtBat(
      matchup,
      matchup,
      state,
      [],
      [],
      roster,
      roster,
      () => 'Out',
      () => 'Flyout to CF'
    )

    expect(result.outcome).toBe('Sacrifice fly to CF')
    expect(state.bases[2]).toBe(null)
    expect(state.score[0]).toBe(1)
    expect(state.outs).toBe(2)
  })

  test('flyout with no runner on 3B does not score', () => {
    const state = initGameState()
    state.bases = [null, null, null]
    state.outs = 0

    const matchup = [{
      batter_id: 'b1',
      pitcher_id: 'p1',
      probabilities: { K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, Out: 1 }
    }]
    const roster = {
      lineup: [{ name: 'Batter', player_id: 'b1', PA: 100, stats: {}, rates: {}, baserunning: { speed: 50, runsBaserunning: 0 } }],
      pitcher: { name: 'P', player_id: 'p1', TBF: 100, stats: {}, rates: {} }
    }

    const result = simulateAtBat(
      matchup,
      matchup,
      state,
      [],
      [],
      roster,
      roster,
      () => 'Out',
      () => 'Flyout to CF'
    )

    expect(result.outcome).toBe('Flyout to CF')
    expect(state.score[0]).toBe(0)
  })

  test('groundout with runner on 3B does not trigger sacrifice fly', () => {
    const state = initGameState()
    state.bases = [null, null, {
      name: 'Runner',
      player_id: 'r3',
      PA: 100,
      stats: {},
      rates: {},
      baserunning: { speed: 50, runsBaserunning: 0 }
    }]
    state.outs = 1

    const matchup = [{
      batter_id: 'b1',
      pitcher_id: 'p1',
      probabilities: { K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, Out: 1 }
    }]
    const roster = {
      lineup: [{ name: 'Batter', player_id: 'b1', PA: 100, stats: {}, rates: {}, baserunning: { speed: 50, runsBaserunning: 0 } }],
      pitcher: { name: 'P', player_id: 'p1', TBF: 100, stats: {}, rates: {} }
    }

    const result = simulateAtBat(
      matchup,
      matchup,
      state,
      [],
      [],
      roster,
      roster,
      () => 'Out',
      () => 'Groundout to SS'
    )

    expect(result.outcome).toBe('Groundout to SS')
    expect(state.bases[2]?.player_id).toBe('r3')
    expect(state.score[0]).toBe(0)
  })
})
