import { randomWeightedChoice } from './random.js'  
  
const outTypeWeights = {
    Groundout: 0.45,
    Flyout: 0.30,
    Lineout: 0.15,
    Popout: 0.10
  }
  
  const outFielderByType = {
    Groundout: {
      '1B': 0.20,
      '2B': 0.20,
      SS: 0.25,
      '3B': 0.20,
      P: 0.15
    },
    Flyout: {
      LF: 0.35,
      CF: 0.45,
      RF: 0.20
    },
    Lineout: {
      '1B': 0.25,
      '2B': 0.25,
      SS: 0.25,
      '3B': 0.25
    },
    Popout: {
      C: 0.30,
      '1B': 0.20,
      '2B': 0.15,
      SS: 0.20,
      '3B': 0.15
    }
  }
  
  /**
   * Enhance a high-level outcome with detail (fielder position).
   * @param {string} outcome
   * @returns {string}
   */
  export function describeOutcome(outcome) {
    if (outcome === 'Out') {
      const type = randomWeightedChoice(outTypeWeights)
      const fielder = randomWeightedChoice(outFielderByType[type])
      return `${type} to ${fielder}`
    }
    return outcome
  }