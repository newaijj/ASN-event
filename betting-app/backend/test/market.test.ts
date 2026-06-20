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

describe("settlement normalization conserves currency exactly", () => {
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

    // random placement
    const order = [...Array(n).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const rankWeight = new Array(n).fill(0);
    rankWeight[order[0]] = 1.0;
    if (n > 1) rankWeight[order[1]] = 0.66;
    if (n > 2) rankWeight[order[2]] = 0.33;

    const totalPool = houseReserve;
    const payouts = market.settle(shares, rankWeight, totalPool);

    const finalBalances = balances.map((bal, idx) => bal + payouts[idx]);
    const totalAfter = finalBalances.reduce((a, c) => a + c, 0);

    return { initialTotal, totalBeforeSettlement, totalAfter, totalPool, payouts };
  }

  it("conserves total currency across many randomized scenarios", () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = randomScenario(seed + 1);
      expect(r.totalBeforeSettlement).toBeCloseTo(r.initialTotal, 6);
      expect(r.totalAfter).toBeCloseTo(r.initialTotal, 6);
      expect(r.payouts.every((p) => p >= -1e-9)).toBe(true); // no negative payouts
    }
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

    expect(session.totalCurrency()).toBeCloseTo(initialTotal, 6);
    expect(session.leaderboard.length).toBe(20);
    const totalFinal = session.leaderboard.reduce((a, c) => a + c.finalBalance, 0);
    expect(totalFinal).toBeCloseTo(initialTotal, 6);
  });

  it("rejects a bet larger than balance", () => {
    const session = new Session({ liquidityB: 80, hostToken: "abc" });
    const u = session.join("Solo", false);
    session.setPresentations(["A", "B"]);
    session.openBetting();
    expect(() => session.placeBet(u.id, session.presentations[0].id, 1000)).toThrow();
  });
});
