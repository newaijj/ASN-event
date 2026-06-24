import { useMemo, useState } from "react";
import { socket } from "../socket";
import { quoteBuy } from "../lmsr";
import BetHistory from "../components/BetHistory";
import type { Ack, BetRecord, PublicState } from "../types";

export default function Betting({
  state,
  isHost,
  userId,
  betHistory,
}: {
  state: PublicState;
  isHost: boolean;
  userId: string;
  betHistory: BetRecord[];
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastBet, setLastBet] = useState<string | null>(null);

  const me = state.users.find((u) => u.id === userId);
  const locked = state.phase !== "BETTING_OPEN";
  const myBalance = me?.balance ?? 0;

  // All outstanding shares across every outcome - needed (with liquidityB)
  // to compute an exact, slippage-aware quote for any bet size.
  const allQ = useMemo(() => state.odds.map((o) => o.q), [state.odds]);

  function setPreset(presentationId: string, coins: number) {
    setAmounts((a) => ({ ...a, [presentationId]: String(coins) }));
  }

  function placeBet(presentationId: string) {
    const raw = amounts[presentationId];
    const coins = Number(raw);
    if (!coins || coins <= 0) {
      setError("enter a positive amount");
      return;
    }
    socket.emit("place_bet", { presentationId, coins }, (ack: Ack) => {
      if (!ack.ok) {
        setError(ack.error ?? "bet failed");
      } else {
        setError(null);
        setLastBet(presentationId);
        setAmounts((a) => ({ ...a, [presentationId]: "" }));
      }
    });
  }

  function lockBetting() {
    socket.emit("host_lock_betting", {}, (ack: Ack) => {
      if (!ack.ok) setError(ack.error ?? "failed");
    });
  }

  function openVoting() {
    socket.emit("host_open_voting", {}, (ack: Ack) => {
      if (!ack.ok) setError(ack.error ?? "failed");
    });
  }

  const sortedOdds = [...state.odds].sort((a, b) => b.price - a.price);

  return (
    <div className="screen">
      <h1>{locked ? "Betting is closed" : "Place your bets"}</h1>
      <p className="muted">
        Winner-take-all: if a presentation finishes 1st, every coin you put on it pays back
        roughly 1 / current odds. Anything else pays back 0. Bigger bets move the odds against
        themselves as they fill, so the preview below reflects exactly what your typed amount
        would get.
      </p>

      <div className="presentation-list">
        {sortedOdds.map((o) => {
          const coins = Number(amounts[o.id]);
          const quote = quoteBuy(allQ, state.liquidityB, o.q, coins);

          return (
            <div className="presentation-row" key={o.id}>
              <div className="presentation-name">
                {o.name}
                {lastBet === o.id && <span className="badge">bet placed</span>}
              </div>
              <div className="odds-bar">
                <div className="odds-fill" style={{ width: `${o.price * 100}%` }} />
              </div>
              <div className="odds-pct">
                {(o.price * 100).toFixed(1)}% current odds
                {!quote && o.price > 0 && (
                  <span className="payout-hint"> — ~{(1 / o.price).toFixed(2)}x if this wins</span>
                )}
              </div>

              {quote && (
                <div className="bet-quote">
                  {coins} coins &rarr; <strong>{quote.sharesReceived.toFixed(1)} shares</strong>.
                  If this wins: payout {quote.sharesReceived.toFixed(1)} coins (
                  <span className={quote.sharesReceived - coins >= 0 ? "positive" : "negative"}>
                    {quote.sharesReceived - coins >= 0 ? "+" : ""}
                    {(quote.sharesReceived - coins).toFixed(1)}
                  </span>
                  ), ~{quote.multiplier.toFixed(2)}x at an average price of {(quote.avgPrice * 100).toFixed(1)}%.
                </div>
              )}

              {!locked && (
                <>
                  <div className="bet-controls">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="coins"
                      value={amounts[o.id] ?? ""}
                      onChange={(e) =>
                        setAmounts((a) => ({ ...a, [o.id]: e.target.value }))
                      }
                    />
                    <button onClick={() => placeBet(o.id)}>Bet</button>
                  </div>
                  <div className="bet-presets">
                    {[5, 10, 25].map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="chip"
                        disabled={myBalance < 1}
                        onClick={() => setPreset(o.id, Math.min(p, Math.floor(myBalance)))}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="chip"
                      disabled={myBalance < 1}
                      onClick={() => setPreset(o.id, Math.floor(myBalance))}
                    >
                      Max
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Your bets</h2>
        <BetHistory bets={betHistory} presentations={state.presentations} />
      </div>

      {isHost && (
        <div className="card">
          {state.phase === "BETTING_OPEN" && (
            <button onClick={lockBetting} style={{ width: "100%" }}>
              Lock betting
            </button>
          )}
          {state.phase === "BETTING_LOCKED" && (
            <button onClick={openVoting} style={{ width: "100%" }}>
              Open voting
            </button>
          )}
        </div>
      )}
      {!isHost && locked && (
        <p className="muted">Waiting for the host to open voting...</p>
      )}
    </div>
  );
}
