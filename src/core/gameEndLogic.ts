// Pure helpers for game end logic (no DOM/browser dependencies)

/**
 * Context for game end, used for UI/display purposes only.
 * @typedef {Object} GameEndContext
 * @property {boolean} [justEndedTopHalf] - True if the top half of the inning just ended.
 * @property {boolean} [justEndedBottomHalf] - True if the bottom half of the inning just ended.
 */
export interface GameEndContext {
  justEndedTopHalf?: boolean
  justEndedBottomHalf?: boolean
}

/**
 * Represents the minimal state needed to determine if a game should end.
 * @typedef {Object} GameStateLike
 * @property {number} inning - 1-based inning number (starts at 1)
 * @property {boolean} top - True if top half of inning, false if bottom half
 * @property {[number, number]} score - [Away, Home] score tuple
 * @property {number} outs - Number of outs (0 to 3)
 */
export interface GameStateLike {
  inning: number           // 1-based inning number (starts at 1)
  top: boolean             // true if top half of inning, false if bottom half
  score: [number, number]  // [Away, Home]
  outs: number             // 0 to 3
}

/**
 * Evaluates whether the game should end after a half-inning concludes or due to a walk-off.
 * Should be called after each at-bat and after the 3rd out when the half-inning has ended.
 *
 * @param {GameStateLike} gameState - The minimal game state to evaluate for game end.
 * @param {(winner: 'Home' | 'Away', score: [number, number], inning: number, lastWasTop: boolean) => void} endGameFn - Callback to execute if the game ends.
 * @returns {boolean} True if the game ended, false otherwise.
 */
export function checkGameEnd(
  gameState: GameStateLike,
  endGameFn: (winner: 'Home' | 'Away', score: [number, number], inning: number, lastWasTop: boolean) => void
): boolean {
  const { inning, top, outs, score } = gameState
  const [awayScore, homeScore] = score

  // No game-ending logic applies before the 9th inning
  if (inning < 9) return false

  // --- Case 1: Top half just ended (outs === 3 and top was true) ---
  if (top && outs === 3) {
    if (homeScore > awayScore) {
      endGameFn('Home', score, inning, true) // lastWasTop = true
      return true
    }
    return false // game continues to bottom half
  }

  // --- Case 2: Bottom half just ended (outs === 3 and top was false) ---
  if (!top && outs === 3) {
    if (awayScore > homeScore) {
      endGameFn('Away', score, inning, false)
      return true
    } else if (homeScore > awayScore) {
      endGameFn('Home', score, inning, false)
      return true
    } else {
      return false // tied, game continues to next inning
    }
  }

  // --- Case 3: Bottom half in progress and home team is ahead (walk-off) ---
  if (!top && outs < 3 && homeScore > awayScore) {
    endGameFn('Home', score, inning, false)
    return true
  }

  return false
}




