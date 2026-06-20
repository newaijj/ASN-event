import { useState } from "react";
import { socket } from "../socket";
import type { Ack, PublicState } from "../types";

export default function Lobby({
  state,
  isHost,
}: {
  state: PublicState;
  isHost: boolean;
}) {
  const [namesText, setNamesText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function setPresentations() {
    const names = namesText
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length < 2) {
      setError("enter at least 2 presentations, one per line");
      return;
    }
    socket.emit("host_set_presentations", { names }, (ack: Ack) => {
      if (!ack.ok) setError(ack.error ?? "failed");
      else setError(null);
    });
  }

  function openBetting() {
    socket.emit("host_open_betting", {}, (ack: Ack) => {
      if (!ack.ok) setError(ack.error ?? "failed");
    });
  }

  return (
    <div className="screen">
      <h1>Lobby</h1>
      <p className="muted">{state.users.length} joined</p>
      <ul className="user-list">
        {state.users.map((u) => (
          <li key={u.id}>
            {u.nickname} {u.isHost && <span className="badge">host</span>}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="card">
          <h2>Host setup</h2>
          {state.presentations.length === 0 ? (
            <>
              <p className="muted">Enter each presentation name on its own line.</p>
              <textarea
                rows={6}
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                placeholder={"Alice's Talk\nBob's Talk\nCarol's Talk"}
              />
              <button onClick={setPresentations}>Save presentations</button>
            </>
          ) : (
            <>
              <p>Presentations:</p>
              <ol>
                {state.presentations.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ol>
              <button onClick={openBetting}>Open betting</button>
            </>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {!isHost && state.presentations.length === 0 && (
        <p className="muted">Waiting for the host to set up the presentations...</p>
      )}
      {!isHost && state.presentations.length > 0 && (
        <p className="muted">Waiting for the host to open betting...</p>
      )}
    </div>
  );
}
