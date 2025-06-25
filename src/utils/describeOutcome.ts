import { randomWeightedChoice } from './random.js';

const outTypeWeights: Record<string, number> = {
    Groundout: 0.48,
    Flyout: 0.32,
    Lineout: 0.12,
    Popout: 0.08
};

const outFielderByType: Record<string, Record<string, number>> = {
    Groundout: {
      '1B': 0.10,
      '2B': 0.27,
      SS: 0.32,
      '3B': 0.16,
      P: 0.15
    },
    Flyout: {
      LF: 0.28,
      CF: 0.48,
      RF: 0.24
    },
    Lineout: {
      '1B': 0.28,
      '2B': 0.18,
      SS: 0.18,
      '3B': 0.28,
      LF: 0.04,
      CF: 0.02,
      RF: 0.02
    },
    Popout: {
      C: 0.30,
      '1B': 0.18,
      '2B': 0.08,
      SS: 0.18,
      '3B': 0.18,
      LF: 0.04,
      RF: 0.04
    }
};

/**
 * Enhance a high-level outcome with detail (fielder position).
 * @param outcome - The basic outcome to enhance
 * @returns Detailed outcome description
 */
export function describeOutcome(outcome: string): string {
    if (outcome === 'Out') {
        const type = randomWeightedChoice(outTypeWeights);
        const fielder = randomWeightedChoice(outFielderByType[type]);
        return `${type} to ${fielder}`;
    }
    return outcome;
} 