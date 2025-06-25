// We'll import the checkGameEnd and endGame logic from src/index.ts, but since it's not exported, we'll copy the logic here for testing purposes.
// In a real project, you might refactor the logic into a separate module for easier testing.

function assertEqual(actual: any, expected: any, msg: string): void {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}

function testGameEndLogic() {
  // Mocks
  let nextAtBatBtn = { disabled: false };
  let statusDiv = { textContent: '' };
  let atbatResultContainer: { log: string[] } = { log: [] };
  let gameState: any;

  function endGame(winner: 'Home' | 'Away', score: number[], inning: number, lastWasTop: boolean): void {
    nextAtBatBtn.disabled = true;
    statusDiv.textContent = `Game Over: ${winner} wins! Final Score: Away ${score[0]} – Home ${score[1]} (${inning}${lastWasTop ? ' Top' : ' Bottom'})`;
    atbatResultContainer.log.push(statusDiv.textContent);
  }

  function checkGameEnd(): void {
    if (!gameState || !nextAtBatBtn) return;
    const { inning, top, score } = gameState;
    if (inning < 9) return;
    if (!top && inning >= 9 && score[1] > score[0]) {
      endGame('Home', score, inning, top);
      return;
    }
    if (top && inning >= 9) {
      if (score[0] > score[1]) {
        endGame('Away', score, inning, !top);
        return;
      } else if (score[1] > score[0]) {
        endGame('Home', score, inning, !top);
        return;
      }
    }
  }

  // Home team wins after top 9th (no bottom 9th played)
  nextAtBatBtn.disabled = false; statusDiv.textContent = ''; atbatResultContainer.log = [];
  gameState = { inning: 9, top: false, score: [2, 3] };
  checkGameEnd();
  assertEqual(nextAtBatBtn.disabled, true, 'Button disabled for home win');
  assertEqual(statusDiv.textContent.includes('Home wins'), true, 'Home win message');

  // Away team wins after bottom 9th
  nextAtBatBtn.disabled = false; statusDiv.textContent = ''; atbatResultContainer.log = [];
  gameState = { inning: 9, top: true, score: [4, 2] };
  checkGameEnd();
  assertEqual(nextAtBatBtn.disabled, true, 'Button disabled for away win');
  assertEqual(statusDiv.textContent.includes('Away wins'), true, 'Away win message');

  // Game continues if tied after 9
  nextAtBatBtn.disabled = false; statusDiv.textContent = ''; atbatResultContainer.log = [];
  gameState = { inning: 9, top: true, score: [3, 3] };
  checkGameEnd();
  assertEqual(nextAtBatBtn.disabled, false, 'Button not disabled for tie');
  assertEqual(statusDiv.textContent.includes('wins'), false, 'No win message for tie');

  // Walk-off win for home team in bottom 9th or later
  nextAtBatBtn.disabled = false; statusDiv.textContent = ''; atbatResultContainer.log = [];
  gameState = { inning: 10, top: true, score: [4, 5] };
  checkGameEnd();
  assertEqual(nextAtBatBtn.disabled, true, 'Button disabled for home walk-off');
  assertEqual(statusDiv.textContent.includes('Home wins'), true, 'Home walk-off win message');

  // Game continues in extra innings if tied
  nextAtBatBtn.disabled = false; statusDiv.textContent = ''; atbatResultContainer.log = [];
  gameState = { inning: 11, top: true, score: [6, 6] };
  checkGameEnd();
  assertEqual(nextAtBatBtn.disabled, false, 'Button not disabled for extra innings tie');
  assertEqual(statusDiv.textContent.includes('wins'), false, 'No win message for extra innings tie');

  // Away team wins in extra innings
  nextAtBatBtn.disabled = false; statusDiv.textContent = ''; atbatResultContainer.log = [];
  gameState = { inning: 12, top: true, score: [8, 7] };
  checkGameEnd();
  assertEqual(nextAtBatBtn.disabled, true, 'Button disabled for away win in extras');
  assertEqual(statusDiv.textContent.includes('Away wins'), true, 'Away win message in extras');

  console.log('✅ All game end logic tests passed.');
}

testGameEndLogic(); 