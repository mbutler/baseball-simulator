/**
 * @fileoverview Entry point: loads and parses a Baseball Reference team page.
 */

import { parseTables } from './utils/parseTables.js'
import { parseStatTable } from './utils/statParser.js'
import { normalizeBattingStats, normalizePitchingStats } from './utils/statNormalizer.js'
import { buildRoster } from './core/rosterBuilder.js'

/**
 * Logs a preview of a given HTMLTableElement.
 * @param {HTMLTableElement|null} table
 * @param {string} label
 * @param {number} maxRows
 */
function logTablePreview(table, label, maxRows = 5) {
  if (!table) {
    console.log(`${label}: ❌ missing`)
    return
  }

  const rows = table.querySelectorAll('tbody tr')
  console.log(`📊 ${label} preview (${Math.min(rows.length, maxRows)} rows):`)

  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const row = rows[i]
    const nameCell = row.querySelector('th')
    const name = nameCell ? nameCell.textContent.trim() : '(no name)'
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim())
    console.log(`   - ${i + 1}: [${name}, ${cells.slice(0, 4).join(', ')} ...]`)
  }
}

/**
 * Loads the team HTML and extracts relevant tables and metadata.
 */
async function main() {
  try {
    const res = await fetch('./data/CHC-2025.html')
    const html = await res.text()

    console.log('🌐 Loaded team HTML')

    const { batting, pitching, fielding } = parseTables(html)

    console.log('🧪 Table detection:')
    console.log('   batting:', batting ? '✅ found' : '❌ missing')
    console.log('   pitching:', pitching ? '✅ found' : '❌ missing')
    console.log('   fielding:', fielding ? '✅ found' : '❌ missing')

    logTablePreview(batting, 'Batting')
    logTablePreview(pitching, 'Pitching')
    logTablePreview(fielding, 'Fielding')

    const battingRaw = parseStatTable(batting)
    const pitchingRaw = parseStatTable(pitching)

    const batters = normalizeBattingStats(battingRaw)
    const pitchers = normalizePitchingStats(pitchingRaw)

    console.log('🎯 Normalized batting example:', batters.slice(0, 2))
    console.log('🎯 Normalized pitching example:', pitchers.slice(0, 2))

    // Automatically select the first 9 unique batters and 1 pitcher
    const lineupIds = batters
      .map(b => b.player_id)
      .filter((id, i, arr) => id && arr.indexOf(id) === i)
      .slice(0, 9)

    const pitcherId = pitchers.find(p => p.player_id)?.player_id

    const roster = buildRoster(lineupIds, pitcherId, batters, pitchers)

    console.log('🏆 Built roster:', roster)

  } catch (err) {
    console.error('❌ Error loading team HTML:', err)
  }
}

main()
