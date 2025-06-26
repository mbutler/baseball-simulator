// Baseball-related types used across the application

export interface NormalizedBatter {
  name: string;
  player_id: string;
  PA: number;
  stats: {
    H: number;
    HR: number;
    BB: number;
    SO: number;
    SF: number;
    HBP: number;
    singles: number;
    doubles: number;
    triples: number;
  };
  rates: {
    kRate: number | null;
    bbRate: number | null;
    hrRate: number | null;
    BABIP: number | null;
  };
  baserunning: {
    runsBaserunning: number | null;
    speed: number | null;
  };
}

export interface NormalizedPitcher {
  name: string;
  player_id: string;
  TBF: number;
  stats: {
    IP: number;
    H: number;
    HR: number;
    BB: number;
    SO: number;
    HBP: number;
  };
  rates: {
    kRate: number | null;
    bbRate: number | null;
    hrRate: number | null;
    BABIP: number | null;
  };
} 