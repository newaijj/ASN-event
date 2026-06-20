import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { PublicState } from "./types";
import Join from "./screens/Join";
import Lobby from "./screens/Lobby";
import Betting from "./screens/Betting";
import Voting from "./screens/Voting";
import Leaderboard from "./screens/Leaderboard";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [state, setState] = useState<PublicState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

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
    function onForceReset() {
      // Host reset the room - everyone (including the host) is logged out
      // and sent back to the join screen for a fresh round.
      sessionStorage.removeItem("betting_userId");
      sessionStorage.removeItem("betting_nickname");
      setUserId(null);
      setIsHost(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("force_reset", onForceReset);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
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
        <p>Connecting...</p>
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

  let screen: React.ReactNode;
  switch (state.phase) {
    case "LOBBY":
      screen = <Lobby state={state} isHost={isHost} />;
      break;
    case "BETTING_OPEN":
    case "BETTING_LOCKED":
      screen = <Betting state={state} isHost={isHost} userId={userId} />;
      break;
    case "VOTING_OPEN":
      screen = <Voting state={state} isHost={isHost} userId={userId} />;
      break;
    case "RESOLVED":
      screen = <Leaderboard state={state} />;
      break;
    default:
      screen = null;
  }

  return (
    <>
      {isHost && (
        <div className="host-reset-bar">
          <button className="reset-btn" onClick={triggerReset}>
            Reset room
          </button>
        </div>
      )}
      {screen}
    </>
  );
}
