import { describe, test, expect } from 'bun:test'
import { getAtBatProbabilities } from '../src/core/probabilityModel.js'

describe('Probability Model Debug', () => {
  test('check probability normalization and totals', () => {
    // Create a typical batter and pitcher
    const batter = {
      name: 'Test Batter',
      player_id: 'b1',
      PA: 500,
      stats: {
        H: 120,
        HR: 15,
        BB: 50,
        SO: 100,
        SF: 5,
        HBP: 5,
        singles: 80,
        doubles: 25,
        triples: 3
      },
      rates: {
        kRate: 0.20, // 20% K rate
        bbRate: 0.10, // 10% BB rate
        hrRate: 0.03, // 3% HR rate
        BABIP: 0.300 // 30% BABIP
      },
      baserunning: {
        runsBaserunning: 0,
        speed: 50
      }
    }

    const pitcher = {
      name: 'Test Pitcher',
      player_id: 'p1',
      TBF: 600,
      stats: {
        IP: 150,
        H: 140,
        HR: 18,
        BB: 60,
        SO: 120,
        HBP: 8
      },
      rates: {
        kRate: 0.20, // 20% K rate
        bbRate: 0.10, // 10% BB rate
        hrRate: 0.03, // 3% HR rate
        BABIP: 0.300 // 30% BABIP
      }
    }

    const probabilities = getAtBatProbabilities(batter, pitcher)
    
    console.log('📊 Probability Analysis:')
    console.log('Raw probabilities:', probabilities)
    
    // Check if probabilities sum to 1
    const total = Object.values(probabilities).reduce((sum, prob) => sum + prob, 0)
    console.log('Total probability:', total)
    
    // Check individual probabilities
    console.log('K rate:', probabilities.K)
    console.log('BB rate:', probabilities.BB)
    console.log('HBP rate:', probabilities.HBP)
    console.log('HR rate:', probabilities.HR)
    console.log('1B rate:', probabilities['1B'])
    console.log('2B rate:', probabilities['2B'])
    console.log('3B rate:', probabilities['3B'])
    console.log('Out rate:', probabilities.Out)
    
    // Updated realistic ranges
    expect(total).toBeCloseTo(1.0, 2) // Should sum to 1.0
    expect(probabilities.K).toBeGreaterThan(0.12) // Should be 12-22%
    expect(probabilities.K).toBeLessThan(0.22)
    expect(probabilities.BB).toBeGreaterThan(0.06) // Should be 6-12%
    expect(probabilities.BB).toBeLessThan(0.12)
    expect(probabilities.HR).toBeGreaterThan(0.01) // Should be around 2-4%
    expect(probabilities.HR).toBeLessThan(0.05)
    expect(probabilities.Out).toBeGreaterThan(0.55) // Should be 55-68%
    expect(probabilities.Out).toBeLessThan(0.70)
  })

  test('check extreme cases', () => {
    // Elite hitter vs poor pitcher
    const eliteBatter = {
      name: 'Elite Batter',
      player_id: 'b2',
      PA: 600,
      stats: {
        H: 180,
        HR: 30,
        BB: 80,
        SO: 80,
        SF: 8,
        HBP: 8,
        singles: 100,
        doubles: 35,
        triples: 5
      },
      rates: {
        kRate: 0.13, // Low K rate
        bbRate: 0.15, // High BB rate
        hrRate: 0.05, // High HR rate
        BABIP: 0.350 // High BABIP
      },
      baserunning: {
        runsBaserunning: 0,
        speed: 50
      }
    }

    const poorPitcher = {
      name: 'Poor Pitcher',
      player_id: 'p2',
      TBF: 500,
      stats: {
        IP: 100,
        H: 120,
        HR: 25,
        BB: 70,
        SO: 60,
        HBP: 10
      },
      rates: {
        kRate: 0.12, // Low K rate
        bbRate: 0.14, // High BB rate
        hrRate: 0.05, // High HR rate
        BABIP: 0.320 // High BABIP
      }
    }

    const probabilities = getAtBatProbabilities(eliteBatter, poorPitcher)
    
    console.log('📊 Elite vs Poor Matchup:')
    console.log('Probabilities:', probabilities)
    
    const total = Object.values(probabilities).reduce((sum, prob) => sum + prob, 0)
    console.log('Total probability:', total)
    
    // Even in extreme cases, should still sum to 1
    expect(total).toBeCloseTo(1.0, 2)
    
    // Should have higher offensive rates, but still within realistic bounds
    expect(probabilities.K).toBeGreaterThan(0.08) // Lower K rate
    expect(probabilities.K).toBeLessThan(0.20)
    expect(probabilities.BB).toBeGreaterThan(0.07) // Higher BB rate
    expect(probabilities.BB).toBeLessThan(0.13)
    expect(probabilities.HR).toBeGreaterThan(0.02) // Higher HR rate
    expect(probabilities.HR).toBeLessThan(0.06)
    expect(probabilities.Out).toBeGreaterThan(0.55) // Lower out rate
    expect(probabilities.Out).toBeLessThan(0.70)
  })
}) 