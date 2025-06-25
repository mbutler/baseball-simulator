import { describe, test, expect, beforeEach } from 'bun:test'
import { checkGameEnd } from '../src/core/gameEndLogic.js'

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

describe('checkGameEnd logic', () => {
  test('game continues before 9th inning regardless of score', () => {
    gameState = { inning: 8, top: false, outs: 3, score: [8, 0] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(false)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('home wins after top 9th without playing bottom', () => {
    gameState = { inning: 9, top: true, outs: 3, score: [1, 2] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
    expect(statusDiv.textContent.includes('9 Top')).toBe(true)
  })

  test('away wins after bottom 9th', () => {
    gameState = { inning: 9, top: false, outs: 3, score: [5, 4] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(statusDiv.textContent.includes('Away wins')).toBe(true)
    expect(statusDiv.textContent.includes('9 Bottom')).toBe(true)
  })

  test('home wins after bottom 9th', () => {
    gameState = { inning: 9, top: false, outs: 3, score: [4, 5] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
    expect(statusDiv.textContent.includes('9 Bottom')).toBe(true)
  })

  test('game continues if tied after bottom 9th', () => {
    gameState = { inning: 9, top: false, outs: 3, score: [3, 3] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(false)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('away wins in extras after bottom half', () => {
    gameState = { inning: 10, top: false, outs: 3, score: [6, 5] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(statusDiv.textContent.includes('Away wins')).toBe(true)
    expect(statusDiv.textContent.includes('10 Bottom')).toBe(true)
  })

  test('home wins after top 10th (no bottom needed)', () => {
    gameState = { inning: 10, top: true, outs: 3, score: [4, 5] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
    expect(statusDiv.textContent.includes('10 Top')).toBe(true)
  })

  test('game continues in extras if tied', () => {
    gameState = { inning: 12, top: false, outs: 3, score: [8, 8] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(false)
    expect(nextAtBatBtn.disabled).toBe(false)
  })

  test('walk-off: home leads during bottom 9th with <3 outs', () => {
    gameState = { inning: 9, top: false, outs: 1, score: [3, 4] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
    expect(statusDiv.textContent.includes('9 Bottom')).toBe(true)
  })

  test('walk-off: home leads during bottom 10th with 2 outs', () => {
    gameState = { inning: 10, top: false, outs: 2, score: [2, 3] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })

  test('no win: bottom 9th, tied, <3 outs', () => {
    gameState = { inning: 9, top: false, outs: 2, score: [4, 4] }
    const result = checkGameEnd(gameState, endGame)
    expect(result).toBe(false)
    expect(nextAtBatBtn.disabled).toBe(false)
  })
})
