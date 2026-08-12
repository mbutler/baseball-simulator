import { describe, test, expect } from 'bun:test'
import { formatTeamName } from '../src/utils/teamNames.js'

describe('formatTeamName', () => {
  test('resolves a dataset code with its year', () => {
    expect(formatTeamName('CHC-2026')).toBe('Chicago Cubs')
    expect(formatTeamName('WSN-2025')).toBe('Washington Nationals')
  })

  test('resolves a bare abbreviation', () => {
    expect(formatTeamName('STL')).toBe('St. Louis Cardinals')
  })

  test('falls back to the code when the club is unknown', () => {
    expect(formatTeamName('ZZZ-2026')).toBe('ZZZ-2026')
  })

  test('renders nothing without a code', () => {
    expect(formatTeamName(null)).toBe('')
    expect(formatTeamName(undefined)).toBe('')
  })
})
