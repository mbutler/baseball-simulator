/**
 * @fileoverview Converts a Baseball Reference stats table into structured player objects.
 */

/**
 * Extracts Baseball Reference player ID from an anchor tag.
 * @param {HTMLAnchorElement|null} link
 * @returns {string|null}
 */
function extractPlayerId(link) {
  if (!link || !link.href) return null
  const match = link.href.match(/\/players\/.\/([^/.]+)\.shtml/)
  return match ? match[1] : null
}

/**
 * Generates a fallback ID from player name if link is missing.
 * @param {string} name
 * @returns {string}
 */
function fallbackIdFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // remove punctuation/spaces
    .slice(0, 12)
}

/**
 * Converts a Baseball Reference stats table to an array of player objects.
 * Handles cases where <th> contains row numbers, and name is in first <td>.
 * @param {HTMLTableElement} table
 * @returns {Object[]} Parsed player stat rows
 */
export function parseStatTable(table) {
  if (!table) return []

  const rows = Array.from(table.querySelectorAll('tbody > tr')).filter(
    tr => !tr.classList.contains('thead')
  )

  const headerCells = Array.from(table.querySelectorAll('thead tr th')).map(
    th => th.textContent.trim()
  )

  const result = []

  for (const row of rows) {
    const cells = [row.querySelector('th'), ...row.querySelectorAll('td')]
    if (cells.length !== headerCells.length) continue

    const stat = {}

    for (let i = 0; i < headerCells.length; i++) {
      const key = headerCells[i]
      const cell = cells[i]

      if (i === 0) {
        let name = cell.textContent.trim()
        let link = cell.querySelector('a')
        let id = extractPlayerId(link)

        // If cell is just a row number, get name/link from next <td>
        if (/^\d+$/.test(name)) {
          const altCell = row.querySelector('td')
          name = altCell?.textContent.trim() || '(unknown)'
          link = altCell?.querySelector('a')
          id = extractPlayerId(link) || id
        }

        stat.name = name
        stat.player_id = id || fallbackIdFromName(name)
      } else {
        const text = cell.textContent.trim()
        const num = Number(text.replace(/,/g, ''))
        stat[key] = isNaN(num) ? text : num
      }
    }

    result.push(stat)
  }

  return result
}
