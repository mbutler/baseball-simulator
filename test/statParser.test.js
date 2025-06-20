import { parseStatTable } from '../src/utils/statParser.js'
import { JSDOM } from 'jsdom'

function makeTable(html) {
  const dom = new JSDOM(html)
  return dom.window.document.querySelector('table')
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg + ` (expected ${expected}, got ${actual})`)
}
function assertArrayEqual(a, b, msg) {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(msg + ` (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
  }
}

function runTests() {
  // Well-formed table with player link
  const html1 = `
    <table>
      <thead><tr><th>Name</th><th>PA</th><th>HR</th></tr></thead>
      <tbody>
        <tr><th><a href="/players/x/xplayer01.shtml">Player One</a></th><td>100</td><td>5</td></tr>
        <tr><th><a href="/players/y/yplayer02.shtml">Player Two</a></th><td>200</td><td>10</td></tr>
      </tbody>
    </table>
  `
  const table1 = makeTable(html1)
  const result1 = parseStatTable(table1)
  assertEqual(result1.length, 2, 'row count')
  assertEqual(result1[0].name, 'Player One', 'name parsed')
  assertEqual(result1[0].player_id, 'xplayer01', 'player_id from link')
  assertEqual(result1[0].PA, 100, 'PA parsed')
  assertEqual(result1[0].HR, 5, 'HR parsed')

  // Table with no player link (fallback ID)
  const html2 = `
    <table>
      <thead><tr><th>Name</th><th>PA</th></tr></thead>
      <tbody>
        <tr><th>John Doe</th><td>50</td></tr>
      </tbody>
    </table>
  `
  const table2 = makeTable(html2)
  const result2 = parseStatTable(table2)
  assertEqual(result2[0].player_id, 'johndoe', 'fallback ID from name')

  // Table with row number in <th>, name in first <td>
  const html3 = `
    <table>
      <thead><tr><th>#</th><th>Name</th><th>PA</th></tr></thead>
      <tbody>
        <tr><th>1</th><td><a href="/players/z/zplayer03.shtml">Z Player</a></td><td>77</td></tr>
      </tbody>
    </table>
  `
  const table3 = makeTable(html3)
  const result3 = parseStatTable(table3)
  assertEqual(result3[0].name, 'Z Player', 'name from <td>')
  assertEqual(result3[0].player_id, 'zplayer03', 'player_id from <td> link')

  // Table with extra/unexpected columns
  const html4 = `
    <table>
      <thead><tr><th>Name</th><th>PA</th><th>HR</th><th>Foo</th></tr></thead>
      <tbody>
        <tr><th>Jane</th><td>10</td><td>1</td><td>bar</td></tr>
      </tbody>
    </table>
  `
  const table4 = makeTable(html4)
  const result4 = parseStatTable(table4)
  assertEqual(result4[0].Foo, 'bar', 'extra column parsed as string')

  // Table with missing/empty cells
  const html5 = `
    <table>
      <thead><tr><th>Name</th><th>PA</th><th>HR</th></tr></thead>
      <tbody>
        <tr><th>Empty</th><td></td><td></td></tr>
      </tbody>
    </table>
  `
  const table5 = makeTable(html5)
  const result5 = parseStatTable(table5)
  assertEqual(result5[0].PA, 0, 'empty cell parsed as 0')
  assertEqual(result5[0].HR, 0, 'empty cell parsed as 0')

  // Table with non-numeric stat
  const html6 = `
    <table>
      <thead><tr><th>Name</th><th>Team</th></tr></thead>
      <tbody>
        <tr><th>Alpha</th><td>NYA</td></tr>
      </tbody>
    </table>
  `
  const table6 = makeTable(html6)
  const result6 = parseStatTable(table6)
  assertEqual(result6[0].Team, 'NYA', 'non-numeric stat parsed as string')

  // Malformed table (missing header/cells)
  const html7 = `
    <table>
      <thead><tr><th>Name</th><th>PA</th></tr></thead>
      <tbody>
        <tr><th>Bad</th></tr>
      </tbody>
    </table>
  `
  const table7 = makeTable(html7)
  const result7 = parseStatTable(table7)
  assertEqual(result7.length, 0, 'malformed row skipped')

  // Null/undefined/empty input
  assertArrayEqual(parseStatTable(null), [], 'null input returns []')
  assertArrayEqual(parseStatTable(undefined), [], 'undefined input returns []')

  console.log('✅ All statParser tests passed.')
}

runTests() 