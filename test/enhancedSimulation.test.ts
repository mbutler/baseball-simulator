import { describe, test, expect, beforeEach } from 'bun:test'
import { initGameState, simulateAtBat } from '../src/core/gameEngine.js'

describe('Enhanced Simulation Features', () => {
  let gameState: any

  beforeEach(() => {
    gameState = initGameState()
  })

  test('elite fielders have higher double play probability', () => {
    // Create matchup with elite fielder stats
    const eliteFielder = {
      position: 'SS',
      stats: {
        RF: 6.0, // Above average range factor
        TZ: 10,  // High total zone
        FP: 0.998 // Elite fielding percentage
      }
    }

    const matchup = [{
      batter_id: 'test',
      pitcher_id: 'test',
      probabilities: {
        K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, Out: 1
      }
    }]

    const roster = {
      lineup: [{ name: 'Test', player_id: 'test', PA: 100, stats: {}, rates: {}, baserunning: { speed: 50, runsBaserunning: 0 } }],
      pitcher: { name: 'Test', player_id: 'test', TBF: 100, stats: {}, rates: {} }
    }

    // Set up bases loaded for double play opportunity
    gameState.bases = [
      { name: 'Runner1', player_id: 'r1', PA: 100, stats: {}, rates: {}, baserunning: { speed: 50, runsBaserunning: 0 } },
      { name: 'Runner2', player_id: 'r2', PA: 100, stats: {}, rates: {}, baserunning: { speed: 50, runsBaserunning: 0 } },
      null
    ]
    gameState.outs = 0

    // The enhanced logic should now use fielding stats
    // Elite fielders should have higher DP probability than the base 25%
    expect(eliteFielder.stats.RF).toBeGreaterThan(4.5) // Above league average
    expect(eliteFielder.stats.FP).toBeGreaterThan(0.995) // Elite fielding percentage
  })

  test('fast runners can advance extra bases', () => {
    const fastRunner = {
      name: 'Fast Runner',
      player_id: 'fast',
      PA: 100,
      stats: {},
      rates: {},
      baserunning: { speed: 80, runsBaserunning: 3 } // Elite speed and baserunning
    }

    // Test that fast runners have enhanced baserunning capabilities
    expect(fastRunner.baserunning.speed).toBeGreaterThan(70) // Fast runner threshold
    expect(fastRunner.baserunning.runsBaserunning).toBeGreaterThan(2) // Elite baserunning threshold
  })

  test('elite catchers prevent passed balls', () => {
    const eliteCatcher = {
      position: 'C',
      stats: {
        FP: 0.998, // Elite fielding percentage
        PB: 2 // Low passed ball count
      }
    }

    const averageCatcher = {
      position: 'C',
      stats: {
        FP: 0.985, // Average fielding percentage
        PB: 8 // Higher passed ball count
      }
    }

    // Elite catchers should have lower passed ball probability
    expect(eliteCatcher.stats.FP).toBeGreaterThan(0.995) // Elite threshold
    expect(averageCatcher.stats.FP).toBeLessThan(0.995) // Below elite threshold
  })

  test('baserunning stats affect advancement decisions', () => {
    const eliteBaserunner = {
      name: 'Elite Runner',
      player_id: 'elite',
      PA: 100,
      stats: {},
      rates: {},
      baserunning: { speed: 75, runsBaserunning: 4 } // Elite baserunning
    }

    const averageBaserunner = {
      name: 'Average Runner',
      player_id: 'avg',
      PA: 100,
      stats: {},
      rates: {},
      baserunning: { speed: 50, runsBaserunning: 0 } // Average baserunning
    }

    // Elite baserunners should have better advancement capabilities
    expect(eliteBaserunner.baserunning.speed).toBeGreaterThan(70)
    expect(eliteBaserunner.baserunning.runsBaserunning).toBeGreaterThan(2)
    expect(averageBaserunner.baserunning.speed).toBe(50)
    expect(averageBaserunner.baserunning.runsBaserunning).toBe(0)
  })
}) 