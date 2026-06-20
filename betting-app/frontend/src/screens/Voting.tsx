import { useState } from "react";
import { socket } from "../socket";
import type { Ack, PublicState } from "../types";

export default function Voting({
  state,
  isHost,
  userId,
}: {
  state: PublicState;
  isHost: boolean;
  userId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const me = state.users.find((u) => u.id === userId);
  const votedCount = state.users.filter((u) => u.hasVoted).length;

  function vote(presentationId: string) {
    socket.emit("cast_vote", { presentationId }, (ack: Ack) => {
      if (!ack.ok) setError(ack.error ?? "vote failed");
      else setMyVote(presentationId);
    });
  }

  function resolve() {
    socket.emit("host_resolve", {}, (ack: Ack) => {
      if (!ack.ok) setError(ack.error ?? "failed");
    });
  }

  return (
    <div className="screen">
      <h1>Vote for the best presentation</h1>
      <p className="muted">
        {votedCount} / {state.users.length} have voted
      </p>

      <div className="presentation-list">
        {state.presentations.map((p) => (
          <button
            key={p.id}
            className={`vote-option ${myVote === p.id ? "selected" : ""}`}
            disabled={me?.hasVoted}
            onClick={() => vote(p.id)}
          >
            <span>{p.name}</span>
            {myVote === p.id && <span className="vote-check">✓</span>}
          </button>
        ))}
      </div>

      {me?.hasVoted && <p className="muted">Your vote is in. Waiting on everyone else...</p>}
      {error && <div className="error">{error}</div>}

      {isHost && (
        <div className="card">
          <button onClick={resolve} style={{ width: "100%" }}>
            Close voting & resolve
          </button>
        </div>
      )}
    </div>
  );
}
