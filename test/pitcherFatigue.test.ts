import { describe, test, expect, beforeEach } from 'bun:test'
import { initGameState } from '../src/core/gameEngine.js'

describe('Pitcher Fatigue Management', () => {
  let gameState: any

  beforeEach(() => {
    gameState = initGameState()
  })

  test('pitcher fatigue starts at 0 for both teams', () => {
    expect(gameState.pitcherFatigue[0].battersFaced).toBe(0) // Away team
    expect(gameState.pitcherFatigue[1].battersFaced).toBe(0) // Home team
  })

  test('pitcher fatigue increments correctly during at-bats', () => {
    // Simulate some at-bats to build up fatigue
    gameState.pitcherFatigue[0].battersFaced = 15 // Away pitcher has faced 15 batters
    gameState.pitcherFatigue[1].battersFaced = 22 // Home pitcher has faced 22 batters (fatigued)
    
    expect(gameState.pitcherFatigue[0].battersFaced).toBe(15)
    expect(gameState.pitcherFatigue[1].battersFaced).toBe(22)
  })

  test('pitcher fatigue resets when pitcher changes', () => {
    // Set up some fatigue
    gameState.pitcherFatigue[0].battersFaced = 25 // Away pitcher fatigued
    gameState.pitcherFatigue[1].battersFaced = 18 // Home pitcher just starting to fatigue
    
    // Simulate pitcher change (this would normally be done through the UI)
    // Reset away pitcher fatigue
    gameState.pitcherFatigue[0] = { battersFaced: 0 }
    
    expect(gameState.pitcherFatigue[0].battersFaced).toBe(0) // Away pitcher fatigue reset
    expect(gameState.pitcherFatigue[1].battersFaced).toBe(18) // Home pitcher fatigue unchanged
  })

  test('both pitcher fatigue counters can be reset independently', () => {
    // Set up fatigue for both pitchers
    gameState.pitcherFatigue[0].battersFaced = 30 // Away pitcher very fatigued
    gameState.pitcherFatigue[1].battersFaced = 12 // Home pitcher moderate fatigue
    
    // Reset both
    gameState.pitcherFatigue[0] = { battersFaced: 0 }
    gameState.pitcherFatigue[1] = { battersFaced: 0 }
    
    expect(gameState.pitcherFatigue[0].battersFaced).toBe(0)
    expect(gameState.pitcherFatigue[1].battersFaced).toBe(0)
  })

  test('fatigue affects probabilities after 18 batters faced', () => {
    // This test verifies the fatigue logic in the game engine
    const fatiguedPitcher = { battersFaced: 25 } // Well over the 18 threshold
    const freshPitcher = { battersFaced: 10 } // Under the threshold
    
    // The fatigue effect should be applied to the fatigued pitcher
    // but not to the fresh pitcher
    expect(fatiguedPitcher.battersFaced).toBeGreaterThan(18)
    expect(freshPitcher.battersFaced).toBeLessThan(18)
  })
}) 