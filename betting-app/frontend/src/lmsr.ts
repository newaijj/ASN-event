/**
 * Client-side mirror of the LMSR math in backend/src/market.ts, used only to
 * give the user an exact, slippage-aware preview of a bet *before* they
 * place it - no network round trip needed while they're typing an amount.
 *
 * The backend remains the single source of truth for what a bet actually
 * costs/pays (this file must never be used to decide outcomes, only to
 * preview them) - see market.ts's buyShares() for the authoritative version.
 * Keep the formula here in sync with that function if it ever changes.
 */

export interface BetQuote {
  sharesReceived: number;
  avgPrice: number; // coins / sharesReceived - the realized price for this bet
  multiplier: number; // sharesReceived / coins - payout per coin if this wins
}

/**
 * Quote how many shares `coins` would buy of an outcome whose current
 * outstanding shares are `qi`, given the full set of outstanding shares
 * across all outcomes (`allQ`, any order - only the sum and `qi` matter) and
 * the market's liquidity parameter `b`.
 */
export function quoteBuy(allQ: number[], b: number, qi: number, coins: number): BetQuote | null {
  if (!(coins > 0) || !Number.isFinite(coins)) return null;

  const sumExp = allQ.reduce((s, q) => s + Math.exp(q / b), 0);
  const sNew = sumExp * Math.exp(coins / b);
  const otherSum = sumExp - Math.exp(qi / b);
  const newQi = b * Math.log(sNew - otherSum);
  const sharesReceived = newQi - qi;

  if (!Number.isFinite(sharesReceived) || sharesReceived <= 0) return null;

  return {
    sharesReceived,
    avgPrice: coins / sharesReceived,
    multiplier: sharesReceived / coins,
  };
}
