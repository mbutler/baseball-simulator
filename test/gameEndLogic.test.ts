import { describe, test, expect, beforeEach } from 'bun:test'
import { checkWalkoff, checkGameEnd } from '../src/core/gameEndLogic.js'

let nextAtBatBtn: { disabled: boolean }
let statusDiv: { textContent: string }
let atbatResultContainer: { log: string[] }
let gameState: any

function resetMocks() {
  nextAtBatBtn = { disabled: false }
  statusDiv = { textContent: '' }
  atbatResultContainer = { log: [] }
  gameState = {}
}

function endGame(winner: 'Home' | 'Away', score: number[], inning: number, lastWasTop: boolean): void {
  nextAtBatBtn.disabled = true
  statusDiv.textContent = `Game Over: ${winner} wins! Final Score: Away ${score[0]} – Home ${score[1]} (${inning}${lastWasTop ? ' Top' : ' Bottom'})`
  atbatResultContainer.log.push(statusDiv.textContent)
}

beforeEach(() => {
  resetMocks()
})

describe('checkGameEnd logic — complete innings', () => {
  test('game continues before 9th inning regardless of score', () => {
    gameState = { inning: 8, top: false, score: [8, 0], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('home wins after top 9th without playing bottom', () => {
    gameState = { inning: 9, top: false, score: [1, 2], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
    expect(statusDiv.textContent.includes('9 Top')).toBe(true)
  })

  test('away wins after bottom 9th', () => {
    gameState = { inning: 9, top: true, score: [5, 4], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Away wins')).toBe(true)
    expect(statusDiv.textContent.includes('9 Bottom')).toBe(true)
  })

  test('game continues if tied after bottom 9th', () => {
    gameState = { inning: 9, top: true, score: [3, 3], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('away wins in extras after bottom half', () => {
    gameState = { inning: 10, top: true, score: [6, 5], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Away wins')).toBe(true)
    expect(statusDiv.textContent.includes('10 Bottom')).toBe(true)
  })

  test('home wins after top 10th (no bottom needed)', () => {
    gameState = { inning: 10, top: false, score: [4, 5], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
    expect(statusDiv.textContent.includes('10 Top')).toBe(true)
  })

  test('game continues in extras if tied', () => {
    gameState = { inning: 12, top: true, score: [8, 8], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('redundant walk-off handling — home is ahead after bottom (should still trigger win)', () => {
    gameState = { inning: 11, top: true, score: [4, 5], isHalfInningOver: true }
    checkGameEnd(gameState, endGame)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })
})

describe('checkWalkoff logic — immediate win during bottom 9th or later', () => {
  test('walk-off win in bottom 9th with single run', () => {
    gameState = {
      inning: 9,
      top: false,
      score: [3, 4],
      runsScoredThisHalf: 1,
      isHalfInningOver: false
    }

    let called = false
    const walkoff = checkWalkoff(gameState, () => {
      called = true
      nextAtBatBtn.disabled = true
      statusDiv.textContent = 'Game Over: Home wins (walk-off)'
    })

    expect(called).toBe(true)
    expect(walkoff).toBe(true)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })

  test('walk-off win with multiple runs, home was trailing', () => {
    gameState = {
      inning: 10,
      top: false,
      score: [5, 7],
      runsScoredThisHalf: 3,
      isHalfInningOver: false
    }

    let called = false
    const walkoff = checkWalkoff(gameState, () => {
      called = true
      nextAtBatBtn.disabled = true
    })

    expect(walkoff).toBe(true)
    expect(called).toBe(true)
    expect(nextAtBatBtn.disabled).toBe(true)
  })

  test('not a walk-off: home was already ahead before bottom half', () => {
    gameState = {
      inning: 10,
      top: false,
      score: [2, 5],
      runsScoredThisHalf: 1,
      isHalfInningOver: false
    }

    const called = checkWalkoff(gameState, () => {
      throw new Error('Should not call endGame for non-walk-off')
    })

    expect(called).toBe(false)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('not a walk-off: game is in top half', () => {
    gameState = {
      inning: 10,
      top: true,
      score: [2, 3],
      runsScoredThisHalf: 1,
      isHalfInningOver: false
    }

    const called = checkWalkoff(gameState, () => {
      throw new Error('Should not trigger walk-off in top half')
    })

    expect(called).toBe(false)
  })

  test('not a walk-off: inning before 9th', () => {
    gameState = {
      inning: 8,
      top: false,
      score: [1, 2],
      runsScoredThisHalf: 1,
      isHalfInningOver: false
    }

    const called = checkWalkoff(gameState, () => {
      throw new Error('Should not trigger walk-off before 9th inning')
    })

    expect(called).toBe(false)
  })
})
