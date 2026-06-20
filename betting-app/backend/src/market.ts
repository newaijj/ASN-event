/**
 * LMSR (Logarithmic Market Scoring Rule) market maker.
 *
 * Settlement is winner-take-all: each share is worth exactly 1 coin if its
 * presentation finishes 1st, and 0 coins otherwise. This is the standard,
 * deterministic prediction-market mechanic - the payout for every share is
 * known the instant it's bought, with no settlement-time rescaling.
 *
 * It's solvent by a standard LMSR bound: the cost function satisfies
 * C(q) >= q_i for every outcome i, so the total owed to holders of the
 * winning outcome's shares can never exceed C(q_final) - and C(q_final)
 * equals exactly the total pool (house reserve seed + everything anyone
 * spent buying shares). Any pool left over after paying winners (because
 * nobody bet on the winner, or because the bound isn't tight) simply stays
 * in the house reserve - total system currency (user balances + house
 * reserve) is still conserved, it's just not all claimed every round.
 */

/** Sum of exp(q_i / b) across all outcomes. */
function sumExp(q: number[], b: number): number {
  let s = 0;
  for (const qi of q) s += Math.exp(qi / b);
  return s;
}

/** LMSR cost function C(q) = b * ln( sum exp(q_i / b) ). */
export function costFunction(q: number[], b: number): number {
  return b * Math.log(sumExp(q, b));
}

/** Live implied price / odds for every outcome. Sums to 1. */
export function prices(q: number[], b: number): number[] {
  const exps = q.map((qi) => Math.exp(qi / b));
  const s = exps.reduce((a, c) => a + c, 0);
  return exps.map((e) => e / s);
}

/** Initial house liquidity reserve needed to seed a market with n outcomes. */
export function initialReserve(n: number, b: number): number {
  return b * Math.log(n);
}

export interface BuyResult {
  newQ: number[];
  sharesReceived: number;
}

/**
 * Spend `coins` buying shares of outcome `i`. Closed-form solution (no
 * iteration needed) for the new share count of outcome i.
 */
export function buyShares(q: number[], b: number, i: number, coins: number): BuyResult {
  if (coins <= 0) throw new Error("coins must be positive");
  if (i < 0 || i >= q.length) throw new Error("invalid outcome index");

  const s = sumExp(q, b);
  const sNew = s * Math.exp(coins / b);
  const otherSum = s - Math.exp(q[i] / b);
  const newQi = b * Math.log(sNew - otherSum);

  const newQ = [...q];
  const sharesReceived = newQi - q[i];
  newQ[i] = newQi;

  return { newQ, sharesReceived };
}

/**
 * Settle the market. `userShares[u][i]` = shares user u holds in outcome i.
 * `rankWeight[i]` = payout weight for outcome i - for winner-take-all this is
 * 1.0 for whichever outcome finished 1st and 0 for every other outcome.
 *
 * Each user's payout is simply the value of the shares they hold, deterministic
 * and known at bet time (a share bought at any point is worth exactly
 * `rankWeight[i]` coins once outcome i's final rank is known). No rescaling
 * or normalization step is needed or performed - see the file header for why
 * this stays solvent.
 */
export function settle(userShares: number[][], rankWeight: number[]): number[] {
  return userShares.map((shares) =>
    shares.reduce((acc, s, i) => acc + s * (rankWeight[i] ?? 0), 0)
  );
}
