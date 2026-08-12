import { describe, test, expect } from 'bun:test'
import { formatAverage } from '../src/utils/format.js'

describe('formatAverage', () => {
  test('drops the leading zero', () => {
    expect(formatAverage(0.313)).toBe('.313')
    expect(formatAverage(0)).toBe('.000')
  })

  test('rounds to three places by default', () => {
    expect(formatAverage(0.29876)).toBe('.299')
  })

  test('keeps the whole number when the rate reaches one', () => {
    expect(formatAverage(1)).toBe('1.000')
  })

  test('renders nothing when there is no rate', () => {
    expect(formatAverage(null)).toBe('')
    expect(formatAverage(undefined)).toBe('')
  })
})
