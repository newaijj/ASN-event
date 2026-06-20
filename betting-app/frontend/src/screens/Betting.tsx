import { useState } from "react";
import { socket } from "../socket";
import type { Ack, PublicState } from "../types";

export default function Betting({
  state,
  isHost,
  userId,
}: {
  state: PublicState;
  isHost: boolean;
  userId: string;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastBet, setLastBet] = useState<string | null>(null);

  const me = state.users.find((u) => u.id === userId);
  const locked = state.phase !== "BETTING_OPEN";

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
      <p className="balance">Your balance: {me ? me.balance.toFixed(1) : "..."} coins</p>

      <div className="presentation-list">
        {sortedOdds.map((o) => (
          <div className="presentation-row" key={o.id}>
            <div className="presentation-name">
              {o.name}
              {lastBet === o.id && <span className="badge">bet placed</span>}
            </div>
            <div className="odds-bar">
              <div className="odds-fill" style={{ width: `${o.price * 100}%` }} />
            </div>
            <div className="odds-pct">{(o.price * 100).toFixed(1)}%</div>
            {!locked && (
              <div className="bet-controls">
                <input
                  type="number"
                  min={1}
                  placeholder="coins"
                  value={amounts[o.id] ?? ""}
                  onChange={(e) =>
                    setAmounts((a) => ({ ...a, [o.id]: e.target.value }))
                  }
                />
                <button onClick={() => placeBet(o.id)}>Bet</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {isHost && (
        <div className="card">
          {state.phase === "BETTING_OPEN" && (
            <button onClick={lockBetting}>Lock betting</button>
          )}
          {state.phase === "BETTING_LOCKED" && (
            <button onClick={openVoting}>Open voting</button>
          )}
        </div>
      )}
      {!isHost && locked && (
        <p className="muted">Waiting for the host to open voting...</p>
      )}
    </div>
  );
}
