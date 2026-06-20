import type { PublicState } from "../types";

export default function Leaderboard({ state }: { state: PublicState }) {
  const leaderboard = state.leaderboard ?? [];
  const results = state.results ?? [];
  const presentationName = (id: string) =>
    state.presentations.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="screen">
      <h1>Results</h1>

      <div className="card">
        <h2>Presentation ranking</h2>
        <ol>
          {results.map((r) => (
            <li key={r.presentationId}>
              {presentationName(r.presentationId)} — {r.votes} votes
              {r.rank === 1 && " (winner - shares pay 1 coin each)"}
              {r.rank !== 1 && " (shares pay 0)"}
            </li>
          ))}
        </ol>
      </div>

      <h2>Leaderboard</h2>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Start</th>
            <th>Final</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry, idx) => (
            <tr key={entry.userId}>
              <td>{idx + 1}</td>
              <td>{entry.nickname}</td>
              <td>{entry.startBalance.toFixed(0)}</td>
              <td>{entry.finalBalance.toFixed(1)}</td>
              <td className={entry.netGain >= 0 ? "positive" : "negative"}>
                {entry.netGain >= 0 ? "+" : ""}
                {entry.netGain.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
