export type Phase =
  | "LOBBY"
  | "BETTING_OPEN"
  | "BETTING_LOCKED"
  | "VOTING_OPEN"
  | "RESOLVED";

export interface Presentation {
  id: string;
  name: string;
}

export interface PublicUser {
  id: string;
  nickname: string;
  balance: number;
  isHost: boolean;
  hasVoted: boolean;
}

export interface OddsEntry {
  id: string;
  name: string;
  price: number; // 0-1 implied probability
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  startBalance: number;
  finalBalance: number;
  netGain: number;
}

export interface PublicState {
  phase: Phase;
  presentations: Presentation[];
  odds: OddsEntry[];
  users: PublicUser[];
  voteCounts?: Record<string, number>; // only included to host, or after RESOLVED
  leaderboard?: LeaderboardEntry[];
  results?: { presentationId: string; rank: number; votes: number }[];
}
