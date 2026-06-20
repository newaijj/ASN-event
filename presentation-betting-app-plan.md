# Presentation Betting App — Build Plan

A single-session, Kahoot-style web app where up to 20 people each get 100 coins and bet on which presentation will be voted best. Odds move in real time via an automated market maker (AMM), like Polymarket. At the end, everyone votes, the market resolves, and a leaderboard shows who won and lost coins. Total coins in the system never changes — it only moves between people (and the house liquidity pool) over the course of the game.

## 1. Assumptions (confirm or adjust before building)

- One market for the whole session: "Which presentation gets voted best?" Bets on the eventual 2nd and 3rd place presentations still pay out partially — there's no need for separate 1st/2nd/3rd markets.
- Host sets up the list of presentations before the session starts (a simple admin screen). Number of presentations is flexible but the math below assumes something in the 4–10 range.
- Bets are final once placed — no selling back into the market mid-game. This keeps the AMM math simple and is consistent with a fast, live, one-shot event.
- Anyone can bet on any presentation (including their own) any number of times until the host locks betting.
- Voting is one person, one vote, for "best presentation," collected in-app after betting locks.
- No accounts: people join with a nickname, Kahoot-style. No login, no persistence across sessions.
- State lives in memory only. If the container restarts mid-session, the round restarts — acceptable for a live one-off event.

## 2. Session lifecycle

A single global session, host-controlled, moves through these phases:

1. **LOBBY** — host creates the list of presentations; people join with nicknames; everyone shows up in a waiting screen with balance = 100.
2. **BETTING_OPEN** — market is live, presentations are listed with real-time odds, people place bets. Host can leave this open as long as needed.
3. **BETTING_LOCKED** — host locks betting once all presentations are done. No more bets accepted; odds freeze.
4. **VOTING_OPEN** — each person casts one vote for best presentation. Live tally can be hidden from bettors until close (to avoid people copying the crowd at the last second) — recommend hiding it.
5. **RESOLVED** — host closes voting, server computes 1st/2nd/3rd from vote counts, settles the market, and broadcasts the leaderboard.

The host is just another participant in the room with an extra admin panel (phase controls + presentation list management) — no separate login system needed, just a host link/token only they get.

## 3. Market mechanics (the actual math)

This is the part worth getting right, since requirement #8 (total currency constant) has to hold exactly, not approximately.

**Pricing — LMSR (Logarithmic Market Scoring Rule), same family Polymarket/Augur use:**

For N presentations, each with an outstanding share count `q_i`, and a liquidity parameter `b` (tunable by the host):

```
Cost function:   C(q) = b * ln( Σ exp(q_i / b) )
Live price/odds: price_i = exp(q_i / b) / Σ exp(q_j / b)
```

`price_i` is what's displayed as the live "odds" for presentation i (its implied probability of winning) — it moves immediately as people bet, which is the real-time Polymarket feel you want.

**Buying shares** — a user spends `coins` on presentation i. Solve for the new share count directly (closed form, no iteration needed):

```
S        = Σ exp(q_j / b)                 (current sum, all presentations)
S_new    = S * exp(coins / b)
new_q_i  = b * ln( S_new - (S - exp(q_i/b)) )
shares_received = new_q_i - q_i
```

The user's balance drops by `coins`, their share holding in presentation i increases by `shares_received`, and the spent coins go into the house liquidity reserve.

**Seeding the market** — at session start, the house seeds an initial reserve of `b * ln(N)` coins (this is just the LMSR cost function evaluated at q=0). This is the "initial pool" mentioned in your spec — it's what makes the very first bets move the odds smoothly instead of jumping to 100%/0%. `b` is a host-tunable knob: smaller `b` = odds move more dramatically per bet (more "exciting," more volatile); larger `b` = odds move more gently. For 20 people with 100 coins each (2,000 coins total in play) and 5–8 presentations, `b` somewhere in the 50–150 range is a reasonable starting point — this can be exposed as a setup-screen setting rather than hardcoded.

**Settlement (this is the key piece for requirement #8):**

Once voting closes, ranks are known: 1st place gets weight 1.0, 2nd gets 0.66, 3rd gets 0.33, everyone else gets 0. For each user, compute their raw implied payout:

```
raw_payout[user] = Σ over presentations i of: weight(rank_i) * shares_held[user][i]
```

Then **normalize so total payout exactly equals the total pool** (house reserve + everything everyone spent — i.e., all coins currently not in anyone's wallet):

```
scale = total_pool / Σ raw_payout[user]   (over all users)
final_payout[user] = raw_payout[user] * scale
new_balance[user] = balance[user] + final_payout[user]
```

This is the guarantee, not a best-effort: I simulated this with random betting patterns and random outcomes — total coins in the system (sum of all balances + house reserve) before and after settlement matched exactly to floating-point precision every time. The reason it works is that normalizing by `scale` forces the books to balance by construction, regardless of how lopsided the betting or the actual result turns out to be. Practically, this also means the house's seed money doesn't just vanish — it gets redistributed to winners as part of settlement, which is consistent with "total currency is constant from the moment the session starts" (initial total = 2,000 user coins + seed; final total = same number, just redistributed among the 20 people).

One side effect worth knowing: because the seed money flows out as winnings, the sum of everyone's final balances will be slightly more than the 2,000 they started with (it absorbs the seed). That's expected and matches the spirit of "the pool starts seeded" — the leaderboard at the end will show total winnings across all 20 people exceeding 2,000 by exactly the seed amount used.

## 4. Data model (in-memory)

```
Session {
  phase: LOBBY | BETTING_OPEN | BETTING_LOCKED | VOTING_OPEN | RESOLVED
  liquidityB: number
  presentations: Presentation[]
  users: Map<userId, User>
  houseReserve: number
}

Presentation {
  id, name
  q: number            // outstanding shares (LMSR state)
}

User {
  id, nickname, socketId
  balance: number
  shares: Map<presentationId, number>
  hasVoted: boolean
  voteFor: presentationId | null
  isHost: boolean
}
```

No database. A single process holding this in memory is enough for 20 concurrent users.

## 5. Real-time + API design

WebSockets (Socket.IO) for everything that needs to be live; a couple of plain HTTP routes for joining.

**Client → server events:**
- `join { nickname }` → assigns userId, returns starting state
- `place_bet { presentationId, coins }` → server validates balance, runs the LMSR buy formula, broadcasts updated odds
- `cast_vote { presentationId }` → records vote (only once)
- Host-only: `host_set_presentations`, `host_open_betting`, `host_lock_betting`, `host_open_voting`, `host_resolve`

**Server → all clients (broadcast):**
- `odds_update { presentations: [{id, price}] }` — fired after every bet
- `balance_update { userId, balance, shares }` — sent to the individual user who just bet
- `phase_change { phase }`
- `leaderboard { results: [{nickname, startBalance, finalBalance, netGain}] }` — sent once on RESOLVED

20 concurrent WebSocket connections is trivial load — no scaling concerns here.

## 6. Frontend screens

- **Join** — nickname entry, big friendly "join room" button.
- **Lobby** — waiting room, shows who's joined, host sees a "start" button.
- **Betting** — list of presentations, each showing live odds (as a percentage and/or implied payout multiplier), a bet input, and the user's current balance + positions. Odds update live via the websocket without a page refresh.
- **Voting** — radio-button style "pick the best presentation," disabled after submission.
- **Results/Leaderboard** — sorted by final balance, shows starting balance → final balance → net gain/loss per person, and the 1st/2nd/3rd presentations with payout multipliers applied.
- **Host panel** — overlaid/extra controls visible only to the host: add/edit presentations, advance phases, force-resolve.

A plain React SPA (Vite build) is enough — no routing library needed since it's all one page with phase-based screens.

## 7. Tech stack

- **Backend:** Node.js + TypeScript, Express (HTTP) + Socket.IO (realtime). All state in plain JS objects/Maps as designed above.
- **Frontend:** React + Vite, built to static files and served by the same Express server (single container, single port).
- **No database**, per the in-memory decision.

## 8. Docker + EC2 deployment

- Single `Dockerfile`: multi-stage build — stage 1 builds the React frontend, stage 2 copies the built static files + backend into a slim `node:20-alpine` runtime image, exposes one port (e.g. 3000).
- `docker-compose.yml` is optional here (only one service), but still useful for documenting port mapping and env vars (`PORT`, `LIQUIDITY_B`, `HOST_TOKEN`).
- On EC2: any small instance works (t3.micro/t3.small is plenty for 20 users). Open the chosen port (or 80/443) in the security group. Run via `docker run -d -p 80:3000 --restart unless-stopped <image>`.
- TLS: optional for a short live event on a local network/projector; if people will join over the open internet, put Caddy or nginx in front for automatic HTTPS — otherwise plain HTTP over the security-group-restricted port is fine for a one-off internal event.
- `--restart unless-stopped` covers accidental container crashes; since state is in-memory, a restart mid-session does lose the round (flagged in assumptions — acceptable per your answer, but worth confirming again given it's a live event with real people watching).

## 9. Testing / verification plan

- Unit tests on the LMSR buy formula and the settlement normalization — assert total system currency is invariant across randomized bet sequences and randomized outcomes (the same kind of check already run informally above).
- Load test with ~20 simulated concurrent socket clients placing bets rapidly, to confirm no race conditions in updating shared market state (single Node process is single-threaded per event loop, so this is mostly about correct async handling, not real concurrency bugs).
- Manual run-through of the full phase lifecycle end-to-end before the real event (join → bet → lock → vote → resolve → leaderboard).

## 10. Build order

1. Backend: session state machine + LMSR math + unit tests for conservation.
2. Backend: Socket.IO event wiring (join/bet/vote/host controls).
3. Frontend: join, lobby, betting screen wired to live odds.
4. Frontend: voting + leaderboard screens.
5. Host panel.
6. Dockerfile + local docker run test.
7. Deploy to EC2, smoke test with a few real devices on the network before the actual event.

## 11. Open questions worth a final check before building

- Minimum/maximum bet size per transaction?
- Can a user bet on multiple presentations (yes, assumed) — any cap on total exposure beyond their balance?
- Tie-breaking rule if two presentations get the same vote count for 2nd/3rd place?
- Should live odds be visible to everyone during voting, or only during betting?
