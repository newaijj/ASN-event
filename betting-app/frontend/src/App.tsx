import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { BetRecord, PublicState } from "./types";
import Join from "./screens/Join";
import Lobby from "./screens/Lobby";
import Betting from "./screens/Betting";
import Voting from "./screens/Voting";
import Leaderboard from "./screens/Leaderboard";
import PriceChart from "./components/PriceChart";

const PHASE_LABELS: Record<string, string> = {
  LOBBY: "Lobby",
  BETTING_OPEN: "Betting open",
  BETTING_LOCKED: "Betting locked",
  VOTING_OPEN: "Voting",
  RESOLVED: "Results",
};

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [state, setState] = useState<PublicState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [betHistory, setBetHistory] = useState<BetRecord[]>([]);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      // sessionStorage (not localStorage) so each browser TAB is its own
      // seat - lets you test locally with multiple tabs as different
      // users, while a refresh within the same tab still rejoins you.
      const savedId = sessionStorage.getItem("betting_userId");
      if (savedId) {
        socket.emit("rejoin", { userId: savedId }, (ack: any) => {
          if (ack.ok) {
            setUserId(ack.userId);
            setIsHost(!!ack.isHost);
          } else {
            sessionStorage.removeItem("betting_userId");
          }
        });
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(s: PublicState) {
      setState(s);
    }
    function onBetHistory(h: BetRecord[]) {
      setBetHistory(h);
    }
    function onForceReset() {
      // Host reset the room - everyone (including the host) is logged out
      // and sent back to the join screen for a fresh round.
      sessionStorage.removeItem("betting_userId");
      sessionStorage.removeItem("betting_nickname");
      setUserId(null);
      setIsHost(false);
      setBetHistory([]);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("bet_history", onBetHistory);
    socket.on("force_reset", onForceReset);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("bet_history", onBetHistory);
      socket.off("force_reset", onForceReset);
    };
  }, []);

  function triggerReset() {
    if (
      !window.confirm(
        "Reset the room? Everyone (including you) will be disconnected and need to rejoin with fresh balances."
      )
    )
      return;
    socket.emit("host_reset", {}, (ack: any) => {
      if (!ack.ok) alert(ack.error ?? "reset failed");
    });
  }

  if (!connected) {
    return (
      <div className="screen center">
        <p className="muted">Connecting...</p>
      </div>
    );
  }

  if (!userId || !state) {
    return (
      <Join
        onJoined={(id, host) => {
          setUserId(id);
          setIsHost(host);
        }}
      />
    );
  }

  const me = state.users.find((u) => u.id === userId);

  let screen: React.ReactNode;
  switch (state.phase) {
    case "LOBBY":
      screen = <Lobby state={state} isHost={isHost} />;
      break;
    case "BETTING_OPEN":
    case "BETTING_LOCKED":
      screen = <Betting state={state} isHost={isHost} userId={userId} betHistory={betHistory} />;
      break;
    case "VOTING_OPEN":
      screen = <Voting state={state} isHost={isHost} userId={userId} />;
      break;
    case "RESOLVED":
      screen = <Leaderboard state={state} betHistory={betHistory} />;
      break;
    default:
      screen = null;
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">A*market</span>
          <span className="topbar-phase">{PHASE_LABELS[state.phase] ?? state.phase}</span>
        </div>
        <div className="topbar-right">
          {me && <span className="balance-pill">{me.balance.toFixed(1)} coins</span>}
          {isHost && (
            <button className="reset-btn" onClick={triggerReset}>
              Reset room
            </button>
          )}
        </div>
      </header>
      <main className="app-main">
        {/* Rendered at the App level (not inside any one screen) so the same
            live chart keeps showing, unchanged, all the way through
            BETTING_OPEN -> VOTING_OPEN -> RESOLVED instead of disappearing
            once betting ends. */}
        {state.presentations.length > 0 && (
          <div className="price-chart-wrap">
            <PriceChart presentations={state.presentations} priceHistory={state.priceHistory} />
          </div>
        )}
        {screen}
      </main>
    </>
  );
}
