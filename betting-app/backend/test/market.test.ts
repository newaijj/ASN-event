import { describe, it, expect } from "vitest";
import * as market from "../src/market.js";
import { Session } from "../src/session.js";

describe("LMSR pricing", () => {
  it("prices sum to 1", () => {
    const q = [0, 0, 0, 0];
    const b = 80;
    const p = market.prices(q, b);
    expect(p.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 9);
  });

  it("buying shares of an outcome increases its price", () => {
    const b = 80;
    let q = [0, 0, 0];
    const before = market.prices(q, b)[0];
    const { newQ } = market.buyShares(q, b, 0, 30);
    const after = market.prices(newQ, b)[0];
    expect(after).toBeGreaterThan(before);
  });
});

describe("winner-take-all settlement conserves currency and stays solvent", () => {
  function randomScenario(seedNum: number) {
    let s = seedNum;
    const rand = () => {
      // simple deterministic PRNG so failures are reproducible
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    const n = 4 + Math.floor(rand() * 5); // 4-8 presentations
    const b = 50 + rand() * 100;
    const numUsers = 20;
    const startBalance = 100;

    let q = new Array(n).fill(0);
    const houseReserveStart = market.initialReserve(n, b);
    let houseReserve = houseReserveStart;
    const balances = new Array(numUsers).fill(startBalance);
    const shares: number[][] = Array.from({ length: numUsers }, () => new Array(n).fill(0));

    const initialTotal = numUsers * startBalance + houseReserveStart;

    for (let t = 0; t < 200; t++) {
      const u = Math.floor(rand() * numUsers);
      const i = Math.floor(rand() * n);
      if (balances[u] < 1) continue;
      const spend = Math.min(balances[u], 1 + rand() * 15);
      const { newQ, sharesReceived } = market.buyShares(q, b, i, spend);
      q = newQ;
      balances[u] -= spend;
      houseReserve += spend;
      shares[u][i] += sharesReceived;
    }

    const totalBeforeSettlement =
      balances.reduce((a, c) => a + c, 0) + houseReserve;

    // random winner - only rank 1 (one outcome) pays, weight 1.0
    const winner = Math.floor(rand() * n);
    const rankWeight = new Array(n).fill(0);
    rankWeight[winner] = 1.0;

    const totalPool = houseReserve;
    const payouts = market.settle(shares, rankWeight);
    const totalPaid = payouts.reduce((a, c) => a + c, 0);
    const houseReserveAfter = totalPool - totalPaid;

    const finalBalances = balances.map((bal, idx) => bal + payouts[idx]);
    const totalAfter = finalBalances.reduce((a, c) => a + c, 0) + houseReserveAfter;

    return { initialTotal, totalBeforeSettlement, totalAfter, totalPool, totalPaid, payouts };
  }

  it("conserves total currency (balances + house reserve) across many randomized scenarios", () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = randomScenario(seed + 1);
      expect(r.totalBeforeSettlement).toBeCloseTo(r.initialTotal, 6);
      expect(r.totalAfter).toBeCloseTo(r.initialTotal, 6);
      expect(r.payouts.every((p) => p >= -1e-9)).toBe(true); // no negative payouts
      // Solvency: the house never pays out more than the pool it collected.
      expect(r.totalPaid).toBeLessThanOrEqual(r.totalPool + 1e-9);
    }
  });

  it("a single user's payout is exactly their winning shares (1 coin each), no rescaling", () => {
    // 3 outcomes, only outcome 0 wins. Two users hold shares in outcome 0,
    // one in outcome 1 (loser).
    const shares = [
      [10, 0, 0], // wins 10 coins
      [4, 0, 0], // wins 4 coins
      [0, 7, 0], // wins 0 - bet on a non-winner
    ];
    const rankWeight = [1.0, 0, 0];
    const payouts = market.settle(shares, rankWeight);
    expect(payouts).toEqual([10, 4, 0]);
  });
});

describe("Session integration", () => {
  it("runs a full lifecycle and conserves currency end to end", () => {
    const session = new Session({ liquidityB: 80, hostToken: "abc" });
    const host = session.join("Host", true);
    const users = [host, ...Array.from({ length: 19 }, (_, i) => session.join(`User${i}`, false))];

    session.setPresentations(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]);
    const initialTotal = session.totalCurrency();

    session.openBetting();

    let s = 42;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    for (let t = 0; t < 150; t++) {
      const u = users[Math.floor(rand() * users.length)];
      const p = session.presentations[Math.floor(rand() * session.presentations.length)];
      const liveUser = session.getUser(u.id)!;
      if (liveUser.balance < 1) continue;
      const coins = Math.min(liveUser.balance, 1 + rand() * 10);
      session.placeBet(u.id, p.id, coins);
    }

    expect(session.totalCurrency()).toBeCloseTo(initialTotal, 6);

    session.lockBetting();
    session.openVoting();

    for (const u of users) {
      const p = session.presentations[Math.floor(rand() * session.presentations.length)];
      session.castVote(u.id, p.id);
    }

    session.resolve();

    // Total currency (user balances + house reserve) is exactly conserved.
    expect(session.totalCurrency()).toBeCloseTo(initialTotal, 6);
    expect(session.leaderboard.length).toBe(20);
    // Winner-take-all only pays out to bettors on the winning presentation,
    // so the leaderboard sum alone is generally LESS than initialTotal - the
    // unclaimed remainder sits in the house reserve, not redistributed.
    const totalFinal = session.leaderboard.reduce((a, c) => a + c.finalBalance, 0);
    expect(totalFinal).toBeLessThanOrEqual(initialTotal + 1e-6);
    expect(totalFinal + session.houseReserve).toBeCloseTo(initialTotal, 6);
  });

  it("rejects a bet larger than balance", () => {
    const session = new Session({ liquidityB: 80, hostToken: "abc" });
    const u = session.join("Solo", false);
    session.setPresentations(["A", "B"]);
    session.openBetting();
    expect(() => session.placeBet(u.id, session.presentations[0].id, 1000)).toThrow();
  });
});
