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
  q: number; // outstanding LMSR shares for this outcome - used with
  // liquidityB to compute the exact shares/odds a specific bet size gets
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
  avgPrice: number;
  placedAt: number;
}

export interface PricePoint {
  t: number;
  prices: number[]; // aligned by index to PublicState.presentations
}

export interface PublicState {
  phase: Phase;
  presentations: Presentation[];
  odds: OddsEntry[];
  liquidityB: number;
  users: PublicUser[];
  priceHistory: PricePoint[];
  voteCounts?: Record<string, number>;
  leaderboard?: LeaderboardEntry[];
  results?: { presentationId: string; rank: number; votes: number }[];
}

export interface Ack {
  ok: boolean;
  error?: string;
  userId?: string;
  isHost?: boolean;
}
