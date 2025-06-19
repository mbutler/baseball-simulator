/**
 * @fileoverview Entry point: loads and parses a Baseball Reference team page.
 */

import { parseTables } from './utils/parseTables.js'

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

    const { batting, pitching, fielding, team_defense_text } = parseTables(html)

    console.log('🧪 Table detection:')
    console.log('   batting:', batting ? '✅ found' : '❌ missing')
    console.log('   pitching:', pitching ? '✅ found' : '❌ missing')
    console.log('   fielding:', fielding ? '✅ found' : '❌ missing')

    logTablePreview(batting, 'Batting')
    logTablePreview(pitching, 'Pitching')
    logTablePreview(fielding, 'Fielding')

  } catch (err) {
    console.error('❌ Error loading team HTML:', err)
  }
}

main()
