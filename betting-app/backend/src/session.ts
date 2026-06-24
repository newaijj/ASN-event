import { randomUUID } from "crypto";
import * as market from "./market.js";
import type {
  Phase,
  Presentation,
  PublicState,
  PublicUser,
  OddsEntry,
  LeaderboardEntry,
  BetRecord,
  PricePoint,
} from "./types.js";

const STARTING_BALANCE = 100;
const MIN_BET = 1;
// Defensive cap so a very long-running room can't grow this array forever -
// 5000 points is far more than any single event needs (one point per bet).
const MAX_PRICE_HISTORY = 5000;
// Winner-take-all: a share is worth 1 coin if its presentation finishes
// 1st, and 0 coins for every other rank. (Index 0 = 1st place.)
const RANK_WEIGHTS = [1.0];

interface InternalUser {
  id: string;
  nickname: string;
  socketId: string | null;
  balance: number;
  shares: number[]; // parallel to presentations array
  hasVoted: boolean;
  voteFor: string | null;
  isHost: boolean;
  betHistory: BetRecord[];
}

export class Session {
  phase: Phase = "LOBBY";
  liquidityB: number;
  presentations: Presentation[] = [];
  q: number[] = []; // LMSR outstanding shares per presentation
  houseReserve = 0;
  // Live odds over time for the current round - one point per presentation
  // set + one per bet. Stays in PublicState (so it persists on every client
  // across BETTING_OPEN -> VOTING_OPEN -> RESOLVED) until the room resets.
  priceHistory: PricePoint[] = [];
  users = new Map<string, InternalUser>();
  hostToken: string;
  private startBalances = new Map<string, number>();
  results: { presentationId: string; rank: number; votes: number }[] = [];
  leaderboard: LeaderboardEntry[] = [];

  constructor(opts: { liquidityB: number; hostToken: string }) {
    this.liquidityB = opts.liquidityB;
    this.hostToken = opts.hostToken;
  }

  // ---- joining ----

  join(nickname: string, claimHost: boolean): InternalUser {
    const id = randomUUID();
    const user: InternalUser = {
      id,
      nickname,
      socketId: null,
      balance: STARTING_BALANCE,
      shares: this.presentations.map(() => 0),
      hasVoted: false,
      voteFor: null,
      isHost: claimHost,
      betHistory: [],
    };
    this.users.set(id, user);
    this.startBalances.set(id, STARTING_BALANCE);
    return user;
  }

  attachSocket(userId: string, socketId: string) {
    const u = this.users.get(userId);
    if (u) u.socketId = socketId;
  }

  // ---- host: presentation setup (LOBBY only) ----

  setPresentations(names: string[]) {
    if (this.phase !== "LOBBY") throw new Error("can only set presentations during LOBBY");
    this.presentations = names.map((name) => ({ id: randomUUID(), name }));
    this.q = this.presentations.map(() => 0);
    this.houseReserve = market.initialReserve(this.presentations.length, this.liquidityB);
    for (const u of this.users.values()) {
      u.shares = this.presentations.map(() => 0);
    }
    this.priceHistory = [];
    this.recordPricePoint(); // baseline point: equal odds before any bets
  }

  /** Append the current live odds as a timestamped point in priceHistory. */
  private recordPricePoint() {
    this.priceHistory.push({
      t: Date.now(),
      prices: market.prices(this.q, this.liquidityB),
    });
    if (this.priceHistory.length > MAX_PRICE_HISTORY) {
      this.priceHistory.splice(0, this.priceHistory.length - MAX_PRICE_HISTORY);
    }
  }

  // ---- phase transitions ----

  openBetting() {
    if (this.presentations.length < 2) throw new Error("need at least 2 presentations");
    if (this.phase !== "LOBBY") throw new Error("can only open betting from LOBBY");
    this.phase = "BETTING_OPEN";
  }

  lockBetting() {
    if (this.phase !== "BETTING_OPEN") throw new Error("betting is not open");
    this.phase = "BETTING_LOCKED";
  }

  openVoting() {
    if (this.phase !== "BETTING_LOCKED") throw new Error("must lock betting before voting");
    this.phase = "VOTING_OPEN";
  }

  // ---- betting ----

  placeBet(userId: string, presentationId: string, coins: number): BetRecord {
    if (this.phase !== "BETTING_OPEN") throw new Error("betting is not open");
    const user = this.users.get(userId);
    if (!user) throw new Error("unknown user");
    if (coins < MIN_BET) throw new Error(`minimum bet is ${MIN_BET}`);
    if (coins > user.balance) throw new Error("insufficient balance");

    const i = this.presentations.findIndex((p) => p.id === presentationId);
    if (i === -1) throw new Error("unknown presentation");

    const { newQ, sharesReceived } = market.buyShares(this.q, this.liquidityB, i, coins);
    this.q = newQ;
    user.balance -= coins;
    user.shares[i] += sharesReceived;
    this.houseReserve += coins;
    this.recordPricePoint();

    const record: BetRecord = {
      id: randomUUID(),
      presentationId,
      coins,
      sharesReceived,
      avgPrice: coins / sharesReceived,
      placedAt: Date.now(),
    };
    user.betHistory.push(record);
    return record;
  }

  /** A user's own bet history, oldest first. Not broadcast publicly - the
   * caller (server.ts) is expected to send this only to that user's own
   * socket, not via the shared state broadcast. */
  getBetHistory(userId: string): BetRecord[] {
    return this.users.get(userId)?.betHistory ?? [];
  }

  // ---- voting ----

  castVote(userId: string, presentationId: string) {
    if (this.phase !== "VOTING_OPEN") throw new Error("voting is not open");
    const user = this.users.get(userId);
    if (!user) throw new Error("unknown user");
    if (user.hasVoted) throw new Error("already voted");
    if (!this.presentations.some((p) => p.id === presentationId))
      throw new Error("unknown presentation");

    user.hasVoted = true;
    user.voteFor = presentationId;
  }

  voteCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of this.presentations) counts[p.id] = 0;
    for (const u of this.users.values()) {
      if (u.voteFor) counts[u.voteFor] = (counts[u.voteFor] ?? 0) + 1;
    }
    return counts;
  }

  // ---- resolution ----

  resolve() {
    if (this.phase !== "VOTING_OPEN") throw new Error("voting is not open");

    const counts = this.voteCounts();
    const ranked = [...this.presentations].sort((a, b) => counts[b.id] - counts[a.id]);

    this.results = ranked.map((p, idx) => ({
      presentationId: p.id,
      rank: idx + 1,
      votes: counts[p.id],
    }));

    const rankWeight = this.presentations.map((p) => {
      const idx = ranked.findIndex((r) => r.id === p.id);
      return RANK_WEIGHTS[idx] ?? 0;
    });

    const userList = [...this.users.values()];
    // houseReserve already equals every coin not currently in a user's
    // wallet (seed + everything spent buying shares) - that's the whole pool.
    const totalPool = this.houseReserve;

    const payouts = market.settle(
      userList.map((u) => u.shares),
      rankWeight
    );

    userList.forEach((u, idx) => {
      u.balance += payouts[idx];
    });
    // Winner-take-all payouts are deterministic, not rescaled - they won't
    // generally add up to the full pool (e.g. if few people bet on the
    // winner). Whatever's left over stays in the house reserve rather than
    // being force-redistributed; total system currency (balances + house
    // reserve) is still exactly conserved.
    const totalPaid = payouts.reduce((a, c) => a + c, 0);
    this.houseReserve = totalPool - totalPaid;

    this.leaderboard = userList
      .map((u) => ({
        userId: u.id,
        nickname: u.nickname,
        startBalance: this.startBalances.get(u.id) ?? STARTING_BALANCE,
        finalBalance: u.balance,
        netGain: u.balance - (this.startBalances.get(u.id) ?? STARTING_BALANCE),
      }))
      .sort((a, b) => b.finalBalance - a.finalBalance);

    this.phase = "RESOLVED";
  }

  // ---- reset ----

  /**
   * Wipe the session completely back to a fresh LOBBY: no presentations, no
   * users, no market state. Used by the host to start a brand new round
   * without restarting the container. Every connected client (including the
   * host) gets logged out and has to rejoin afterward - see server.ts, which
   * emits a "force_reset" event to all sockets before broadcasting the new
   * (empty) state.
   */
  reset() {
    this.phase = "LOBBY";
    this.presentations = [];
    this.q = [];
    this.houseReserve = 0;
    this.users.clear();
    this.startBalances.clear();
    this.results = [];
    this.leaderboard = [];
    this.priceHistory = [];
  }

  // ---- snapshot for broadcasting ----

  odds(): OddsEntry[] {
    const qOrZero = this.q.length ? this.q : this.presentations.map(() => 0);
    const p = market.prices(qOrZero, this.liquidityB);
    return this.presentations.map((pres, i) => ({
      id: pres.id,
      name: pres.name,
      price: p[i] ?? 0,
      q: qOrZero[i] ?? 0,
    }));
  }

  publicState(forUserId?: string): PublicState {
    const includeVotes = this.phase === "RESOLVED";
    const state: PublicState = {
      phase: this.phase,
      presentations: this.presentations,
      odds: this.odds(),
      liquidityB: this.liquidityB,
      priceHistory: this.priceHistory,
      users: [...this.users.values()].map((u) => this.toPublicUser(u)),
    };
    if (includeVotes) {
      state.voteCounts = this.voteCounts();
      state.leaderboard = this.leaderboard;
      state.results = this.results;
    }
    return state;
  }

  getUser(userId: string): InternalUser | undefined {
    return this.users.get(userId);
  }

  private toPublicUser(u: InternalUser): PublicUser {
    return {
      id: u.id,
      nickname: u.nickname,
      balance: u.balance,
      isHost: u.isHost,
      hasVoted: u.hasVoted,
    };
  }

  /** Total currency currently in the system: every user's balance + house reserve. */
  totalCurrency(): number {
    let total = this.houseReserve;
    for (const u of this.users.values()) total += u.balance;
    return total;
  }
}
