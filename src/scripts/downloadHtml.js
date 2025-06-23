import { mkdir, writeFile } from 'fs/promises'
import { fetchHtml } from '../utils/fetchHtml.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..') // from /src/scripts/ to root
const dirPath = path.resolve(projectRoot, 'dist/data') // ✅ now saving to dist/data

/**
 * Entry point for team page downloader.
 * @param {string[]} args - CLI arguments: team code (e.g. CHC), year (e.g. 2025)
 */
async function main(args) {
  const [teamCode, year] = args

  if (!teamCode || !year) {
    console.error('❌ Usage: bun run scripts/downloadHtml.js <TEAM> <YEAR>')
    process.exit(1)
  }

  const url = `https://www.baseball-reference.com/teams/${teamCode}/${year}.shtml`
  const outPath = path.resolve(dirPath, `${teamCode}-${year}.html`)

  try {
    console.log(`📁 Ensuring directory: ${dirPath}`)
    await mkdir(dirPath, { recursive: true })

    console.log(`🌐 Fetching: ${url}`)
    const html = await fetchHtml(url)

    console.log(`💾 Saving to: ${outPath}`)
    await writeFile(outPath, html)

    console.log(`✅ Done! HTML saved to ${outPath}`)
  } catch (err) {
    console.error('❌ Failed to fetch/save:', (err instanceof Error ? err.message : String(err)))
  }
}

// @ts-expect-error Bun is provided by the Bun runtime
main(Bun.argv.slice(2))
