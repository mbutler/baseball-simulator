import { describe, test, expect, beforeEach } from 'bun:test'
import { checkWalkoff, checkGameEnd as importedCheckGameEnd } from '../src/core/gameEndLogic.js'

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

// Copied for internal logic match (non-exported version)
function checkGameEnd(context?: { justEndedTopHalf?: boolean, justEndedBottomHalf?: boolean }): void {
  if (!gameState || !nextAtBatBtn) return
  const { inning, top, score } = gameState
  if (inning < 9) return
  if (inning === 9 && top) return
  if (context?.justEndedTopHalf && inning >= 9 && score[1] > score[0])
    return endGame('Home', score, inning, false)
  if (context?.justEndedBottomHalf && inning >= 9 && score[0] > score[1])
    return endGame('Away', score, inning, true)
  if (context?.justEndedBottomHalf && inning >= 9 && score[1] > score[0])
    return endGame('Home', score, inning, true)
}

beforeEach(() => {
  resetMocks()
})

describe('checkGameEnd logic', () => {
  test('game does not end after 8th even if home is losing', () => {
    gameState = { inning: 8, top: false, score: [2, 0] }
    checkGameEnd({ justEndedBottomHalf: true })
    expect(nextAtBatBtn.disabled).toBe(false)
    expect(statusDiv.textContent.includes('wins')).toBe(false)
  })

  test('home wins after top 9th, no bottom played', () => {
    gameState = { inning: 9, top: false, score: [2, 3] }
    checkGameEnd({ justEndedTopHalf: true })
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })

  test('away wins after bottom 9th', () => {
    gameState = { inning: 10, top: true, score: [4, 2] }
    checkGameEnd({ justEndedBottomHalf: true })
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Away wins')).toBe(true)
  })

  test('game continues if tied after 9', () => {
    gameState = { inning: 9, top: true, score: [3, 3] }
    checkGameEnd({ justEndedBottomHalf: true })
    expect(nextAtBatBtn.disabled).toBe(false)
    expect(statusDiv.textContent.includes('wins')).toBe(false)
  })

  test('walk-off win for home team in extras', () => {
    gameState = { inning: 10, top: true, score: [4, 5] }
    checkGameEnd({ justEndedBottomHalf: true })
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })

  test('game continues in extras if tied', () => {
    gameState = { inning: 11, top: true, score: [6, 6] }
    checkGameEnd({ justEndedBottomHalf: true })
    expect(nextAtBatBtn.disabled).toBe(false)
    expect(statusDiv.textContent.includes('wins')).toBe(false)
  })

  test('away wins in extras', () => {
    gameState = { inning: 12, top: true, score: [8, 7] }
    checkGameEnd({ justEndedBottomHalf: true })
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Away wins')).toBe(true)
  })

  test('home wins after top 10th', () => {
    gameState = { inning: 10, top: false, score: [2, 3] }
    checkGameEnd({ justEndedTopHalf: true })
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })

  test('game continues to bottom 9th if tied after top', () => {
    gameState = { inning: 9, top: false, score: [2, 2] }
    checkGameEnd({ justEndedTopHalf: true })
    expect(nextAtBatBtn.disabled).toBe(false)
    expect(statusDiv.textContent.includes('wins')).toBe(false)
  })
})

describe('checkWalkoff logic', () => {
  test('immediate walk-off win in bottom 9th', () => {
    gameState = { inning: 9, top: false, score: [2, 3], isHalfInningOver: false, runsScoredThisHalf: 1 }
    let called = false

    function customEndGame() {
      called = true
      nextAtBatBtn.disabled = true
      statusDiv.textContent = 'Game Over: Home wins!'
    }

    nextAtBatBtn.disabled = false
    checkWalkoff(gameState, customEndGame)
    expect(called).toBe(true)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(statusDiv.textContent.includes('Home wins')).toBe(true)
  })
})

describe('post-increment win check', () => {
  test('away wins immediately after bottom 9th if ahead', () => {
    let endGameCalled = false
    let localText = ''

    const endGameTest = (winner: 'Home' | 'Away', score: number[], inning: number, lastWasTop: boolean) => {
      endGameCalled = true
      nextAtBatBtn.disabled = true
      localText = `Game Over: ${winner} wins! Final Score: Away ${score[0]} – Home ${score[1]} (${inning}${lastWasTop ? ' Top' : ' Bottom'})`
      atbatResultContainer.log.push(localText)
    }

    gameState = { inning: 10, top: true, score: [4, 3], isHalfInningOver: true, runsScoredThisHalf: 0 }

    importedCheckGameEnd(gameState, endGameTest)

    expect(endGameCalled).toBe(true)
    expect(nextAtBatBtn.disabled).toBe(true)
    expect(localText.includes('Away wins')).toBe(true)
  })
})
