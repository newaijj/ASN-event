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
  price: number; // 0-1 implied probability - instantaneous/marginal price only
  q: number; // outstanding LMSR shares for this outcome. Needed (along with
  // liquidityB) by clients that want to compute the *exact* shares/odds a
  // specific bet size would get - `price` alone is only accurate for an
  // infinitesimally small bet, since buying shares moves the price as you buy.
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  startBalance: number;
  finalBalance: number;
  netGain: number;
}

export interface BetRecord {
  id: string;
  presentationId: string;
  coins: number;
  sharesReceived: number;
  avgPrice: number; // coins / sharesReceived - the realized price for this bet
  placedAt: number; // epoch ms
}

export interface PricePoint {
  t: number; // epoch ms
  prices: number[]; // aligned by index to PublicState.presentations, 0-1 implied probability
}

export interface PublicState {
  phase: Phase;
  presentations: Presentation[];
  odds: OddsEntry[];
  liquidityB: number;
  users: PublicUser[];
  priceHistory: PricePoint[]; // full odds history for this round - persists across phases
  voteCounts?: Record<string, number>; // only included to host, or after RESOLVED
  leaderboard?: LeaderboardEntry[];
  results?: { presentationId: string; rank: number; votes: number }[];
}
