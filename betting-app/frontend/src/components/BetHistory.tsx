import type { BetRecord, Presentation } from "../types";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function BetHistory({
  bets,
  presentations,
}: {
  bets: BetRecord[];
  presentations: Presentation[];
}) {
  const name = (id: string) => presentations.find((p) => p.id === id)?.name ?? id;

  if (bets.length === 0) {
    return <p className="muted">You haven't placed any bets yet.</p>;
  }

  const sorted = [...bets].sort((a, b) => b.placedAt - a.placedAt);
  const totalSpent = bets.reduce((acc, b) => acc + b.coins, 0);

  return (
    <>
      <p className="muted">{bets.length} bet{bets.length === 1 ? "" : "s"} placed - {totalSpent.toFixed(0)} coins total</p>
      <ul className="bet-history-list">
        {sorted.map((b) => (
          <li key={b.id} className="bet-history-row">
            <div className="bet-history-top">
              <span className="bet-history-name">{name(b.presentationId)}</span>
              <span className="bet-history-time">{formatTime(b.placedAt)}</span>
            </div>
            <div className="bet-history-detail muted">
              {b.coins} coins &rarr; {b.sharesReceived.toFixed(1)} shares @ {(b.avgPrice * 100).toFixed(1)}% avg price
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
