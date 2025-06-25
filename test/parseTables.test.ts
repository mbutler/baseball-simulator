import { parseTables } from '../src/utils/parseTables.js'
import { JSDOM } from 'jsdom'

function setupDom(): void {
  // JSDOM global document
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  global.document = dom.window.document
  global.DOMParser = dom.window.DOMParser
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg)
}

function runTests(): void {
  setupDom()

  // Well-formed HTML with all tables present
  const html1 = `
    <table id="players_standard_batting"><tr><td>bat</td></tr></table>
    <table id="players_standard_pitching"><tr><td>pit</td></tr></table>
    <!-- <table id="players_standard_fielding"><tr><td>fld</td></tr></table> -->
  `
  const result1 = parseTables(html1)
  assert(!!(result1.batting && result1.batting.id === 'players_standard_batting'), 'batting table found')
  assert(!!(result1.pitching && result1.pitching.id === 'players_standard_pitching'), 'pitching table found')
  assert(!!(result1.fielding && result1.fielding.id === 'players_standard_fielding'), 'fielding table from comment')

  // Only fielding table in comment
  const html2 = `
    <!-- <table id="players_standard_fielding"><tr><td>fld</td></tr></table> -->
  `
  const result2 = parseTables(html2)
  assert(!!(result2.fielding && result2.fielding.id === 'players_standard_fielding'), 'fielding table from comment only')
  assert(result2.batting === null, 'no batting table')
  assert(result2.pitching === null, 'no pitching table')

  // Missing tables
  const html3 = `<div>No tables here</div>`
  const result3 = parseTables(html3)
  assert(result3.batting === null, 'no batting table (missing)')
  assert(result3.pitching === null, 'no pitching table (missing)')
  assert(result3.fielding === null, 'no fielding table (missing)')

  // Malformed HTML
  const html4 = `<table id="players_standard_batting"><tr><td>bat` // no closing tags
  const result4 = parseTables(html4)
  assert(!!(result4.batting && result4.batting.id === 'players_standard_batting'), 'batting table found in malformed HTML')

  // Empty input
  const result5 = parseTables('')
  assert(result5.batting === null, 'no batting table (empty input)')
  assert(result5.pitching === null, 'no pitching table (empty input)')
  assert(result5.fielding === null, 'no fielding table (empty input)')

  // Table in comment with extra whitespace
  const html6 = `<!--   <table id="players_standard_fielding"> <tr><td>fld</td></tr> </table>   -->`
  const result6 = parseTables(html6)
  assert(!!(result6.fielding && result6.fielding.id === 'players_standard_fielding'), 'fielding table from comment with whitespace')

  console.log('✅ All parseTables tests passed.')
}

runTests() 