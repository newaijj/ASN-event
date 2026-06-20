import { useState } from "react";
import { socket } from "../socket";
import type { Ack } from "../types";

export default function Join({
  onJoined,
}: {
  onJoined: (userId: string, isHost: boolean, nickname: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [showHostField, setShowHostField] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    setBusy(true);
    setError(null);
    socket.emit(
      "join",
      { nickname: nickname.trim(), hostToken: hostToken.trim() || undefined },
      (ack: Ack) => {
        setBusy(false);
        if (!ack.ok) {
          setError(ack.error ?? "failed to join");
          return;
        }
        sessionStorage.setItem("betting_userId", ack.userId!);
        sessionStorage.setItem("betting_nickname", nickname.trim());
        onJoined(ack.userId!, !!ack.isHost, nickname.trim());
      }
    );
  }

  return (
    <div className="screen center">
      <div className="card center-card">
        <h1>Join the room</h1>
        <p className="muted">Everyone starts with 100 coins to bet with.</p>
        <form onSubmit={submit}>
          <input
            autoFocus
            placeholder="Your name"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="words"
          />
          {showHostField && (
            <input
              placeholder="Host token (optional)"
              value={hostToken}
              onChange={(e) => setHostToken(e.target.value)}
              autoComplete="off"
            />
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy || !nickname.trim()} style={{ width: "100%" }}>
            {busy ? "Joining..." : "Join"}
          </button>
        </form>
        {!showHostField && (
          <button className="link" onClick={() => setShowHostField(true)}>
            I'm the host
          </button>
        )}
      </div>
    </div>
  );
}
