/**
 * @fileoverview Downloads a Baseball Reference team page and saves it to /data for use in the browser.
 * Usage: bun src/scripts/downloadHtml.js CHC 2025
 */

import { mkdir, writeFile } from 'fs/promises'
import { fetchHtml } from '../utils/fetchHtml.js'

/**
 * Entry point for team page downloader.
 * @param {string[]} args - CLI arguments: team code (e.g. CHC), year (e.g. 2025)
 */
async function main(args) {
  const [teamCode, year] = args

  if (!teamCode || !year) {
    console.error('❌ Usage: bun src/scripts/downloadHtml.js <TEAM> <YEAR>')
    process.exit(1)
  }

  const url = `https://www.baseball-reference.com/teams/${teamCode}/${year}.shtml`
  const dirPath = `dist/data`
  const outPath = `${dirPath}/${teamCode}-${year}.html`

  try {
    console.log(`📁 Ensuring directory: ${dirPath}`)
    await mkdir(dirPath, { recursive: true })

    console.log(`🌐 Fetching: ${url}`)
    const html = await fetchHtml(url)

    console.log(`💾 Saving to: ${outPath}`)
    await writeFile(outPath, html)

    console.log(`✅ Done! HTML saved to ${outPath}`)
  } catch (err) {
    console.error('❌ Failed to fetch/save:', err.message)
  }
}

main(Bun.argv.slice(2))