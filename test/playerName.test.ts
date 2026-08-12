import { describe, test, expect } from 'bun:test'
import { formatPlayerName, surname, playerInitials, shortName } from '../src/utils/playerName.js'

describe('formatPlayerName', () => {
  test('leaves a plain name alone', () => {
    expect(formatPlayerName('Aaron Judge')).toBe('Aaron Judge')
  })

  test('strips Baseball Reference handedness markers', () => {
    expect(formatPlayerName('Matt Olson*')).toBe('Matt Olson')
    expect(formatPlayerName('Carlos Santana#')).toBe('Carlos Santana')
  })

  test('strips roster notes, with or without a trailing marker', () => {
    expect(formatPlayerName('Zach Eflin (15-day IL)')).toBe('Zach Eflin')
    expect(formatPlayerName('Pavin Smith (10-day IL)*')).toBe('Pavin Smith')
    expect(formatPlayerName('Deyvison De Los Santos (40-man)')).toBe('Deyvison De Los Santos')
  })

  test('handles missing names', () => {
    expect(formatPlayerName(undefined)).toBe('')
    expect(formatPlayerName('')).toBe('')
  })
})

describe('surname', () => {
  test('drops generational suffixes', () => {
    expect(surname('Ronald Acuña Jr.')).toBe('Acuña')
    expect(surname('Michael Harris II*')).toBe('Harris')
    expect(surname('Daniel Lynch IV*')).toBe('Lynch')
  })

  test('keeps multi-word surnames together', () => {
    expect(surname('Elly De La Cruz#')).toBe('De La Cruz')
    expect(surname('Deyvison De Los Santos')).toBe('De Los Santos')
  })

  test('handles a single-word name', () => {
    expect(surname('Ichiro')).toBe('Ichiro')
  })
})

describe('playerInitials', () => {
  test('uses the given name and surname, not the suffix', () => {
    expect(playerInitials('Aaron Judge')).toBe('AJ')
    expect(playerInitials('Ronald Acuña Jr.')).toBe('RA')
    expect(playerInitials('Elly De La Cruz#')).toBe('ED')
    expect(playerInitials('Pavin Smith (10-day IL)*')).toBe('PS')
  })

  test('falls back to two letters for a single-word name', () => {
    expect(playerInitials('Ichiro')).toBe('IC')
    expect(playerInitials('')).toBe('')
  })
})

describe('shortName', () => {
  test('truncates only what will not fit', () => {
    expect(shortName('Mike Yastrzemski*')).toBe('Yastrzemski')
    expect(shortName('Pete Crow-Armstrong*')).toBe('Crow-Armstr…')
    expect(shortName('Deyvison De Los Santos (40-man)')).toBe('De Los Sant…')
  })
})
