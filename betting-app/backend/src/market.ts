/**
 * LMSR (Logarithmic Market Scoring Rule) market maker, plus a settlement
 * normalization step that guarantees exact conservation of total currency
 * even though payouts are graduated (1st = 100%, 2nd = 66%, 3rd = 33%)
 * rather than a single binary winner-takes-all outcome.
 *
 * See /docs in the project root (or the original plan doc) for the derivation.
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
 * `rankWeight[i]` = payout weight for outcome i (1.0 / 0.66 / 0.33 / 0 typically).
 * `totalPool` = every coin currently not in a user's wallet (house reserve +
 * everything everyone spent buying shares) - i.e. the entire amount available
 * to redistribute.
 *
 * Returns a payout per user that is guaranteed to sum to exactly `totalPool`,
 * by normalizing the raw LMSR-implied payouts. This is what makes the total
 * currency invariant hold regardless of betting pattern or outcome.
 */
export function settle(
  userShares: number[][],
  rankWeight: number[],
  totalPool: number
): number[] {
  const raw = userShares.map((shares) =>
    shares.reduce((acc, s, i) => acc + s * (rankWeight[i] ?? 0), 0)
  );
  const totalRaw = raw.reduce((a, c) => a + c, 0);

  // If nobody holds any shares in a paying outcome (e.g. nobody bet on the
  // top 3), there's nothing to redistribute - the pool simply stays
  // unclaimed in the house reserve. Total system currency is still
  // conserved; it's just not handed out. Returning all zeros is correct.
  if (totalRaw === 0) return raw.map(() => 0);

  const scale = totalPool / totalRaw;
  return raw.map((r) => r * scale);
}
