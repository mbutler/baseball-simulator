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

/**
 * Convert Baseball Reference position codes to proper baseball position abbreviations
 * @param positionCode - Raw position code from Baseball Reference (e.g., "3H/D", "4/6", "2/D7")
 * @returns Proper position abbreviation (e.g., "3B", "SS", "2B")
 */
export function convertPositionCode(positionCode: string): string {
  if (!positionCode || typeof positionCode !== 'string') return '';
  
  // Remove any asterisks and split by common delimiters
  const cleanCode = positionCode.replace(/\*/g, '').split(/[/,]/)[0];
  
  // Baseball Reference position codes:
  // 1 = Pitcher, 2 = Catcher, 3 = First Base, 4 = Second Base, 5 = Third Base
  // 6 = Shortstop, 7 = Left Field, 8 = Center Field, 9 = Right Field
  // D = Designated Hitter, H = Pinch Hitter
  
  const positionMap: Record<string, string> = {
    '1': 'P',
    '2': 'C', 
    '3': '1B',
    '4': '2B',
    '5': '3B',
    '6': 'SS',
    '7': 'LF',
    '8': 'CF',
    '9': 'RF',
    'D': 'DH',
    'H': 'PH'
  };
  
  // If it's a simple single position code, convert it
  if (positionMap[cleanCode]) {
    return positionMap[cleanCode];
  }
  
  // For complex codes like "3H/D", take the first position
  const firstChar = cleanCode.charAt(0);
  if (positionMap[firstChar]) {
    return positionMap[firstChar];
  }
  
  // Fallback: return the original code if we can't parse it
  return cleanCode;
} 