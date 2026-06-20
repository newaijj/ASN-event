# Presentation Betting App

A Kahoot-style, single-session web app: up to 20 people join with a nickname, each starting with 100 coins, and bet on which presentation will be voted best. Odds move in real time via an LMSR automated market maker (Polymarket-style). After voting closes, the market settles: 1st place pays its bettors fully, 2nd place pays 66%, 3rd pays 33%. Total currency in the system is conserved exactly (verified by automated tests — see `backend/test/market.test.ts`).

See `../presentation-betting-app-plan.md` for the full design rationale and math derivation.

## Local development

```bash
# terminal 1
cd backend
npm install
npm run dev      # runs on :3000

# terminal 2
cd frontend
npm install
npm run dev      # runs on :5173, proxies /socket.io to :3000
```

Open `http://localhost:5173`. To act as host, click "I'm the host" on the join screen and enter the host token (default `host123`, override with the `HOST_TOKEN` env var on the backend).

## Running the tests

```bash
cd backend
npm test
```

This runs the LMSR pricing tests and the currency-conservation tests (randomized betting scenarios + a full 20-user lifecycle simulation), asserting the total coins in the system never drifts.

## Building & running with Docker

```bash
docker compose build
docker compose up
```

This builds the frontend, builds the backend, and bundles both into a single container exposing port 3000 (mapped to host port 80 by default — see `docker-compose.yml`). Set `HOST_TOKEN` to something only you know before running a real event, and tune `LIQUIDITY_B` if you want odds to move more or less dramatically (see comments in `docker-compose.yml`).

Or without compose:

```bash
docker build -t presentation-betting-app .
docker run -d -p 80:3000 -e HOST_TOKEN=mysecret --restart unless-stopped presentation-betting-app
```

## Deploying to EC2

1. Launch a small instance (t3.micro/t3.small is plenty for 20 users). Amazon Linux 2023 or Ubuntu both work.
2. In the instance's security group, open inbound port 80 (or whatever port you're using) to the IPs/network that need access.
3. Install Docker on the instance:
   ```bash
   sudo yum install -y docker   # Amazon Linux
   # or: sudo apt-get install -y docker.io   # Ubuntu
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER   # re-login after this
   ```
4. Copy this project to the instance (`scp -r betting-app ec2-user@<ip>:~/`) or `git clone` it there.
5. On the instance:
   ```bash
   cd betting-app
   docker build -t presentation-betting-app .
   docker run -d -p 80:3000 -e HOST_TOKEN=mysecret --restart unless-stopped presentation-betting-app
   ```
6. Share `http://<ec2-public-ip>/` with the 20 participants. Join as host first (with your token) to set up the presentation list before opening it to everyone else.

TLS is left out here deliberately — for a short, internal, one-off live event, plain HTTP over a security-group-restricted port is simplest. If people will join over the open internet and you want HTTPS, put Caddy or nginx in front of this container (Caddy in particular makes automatic HTTPS nearly zero-config) — ask me to add that if you need it.

## Important operational note

State is in-memory only — there is no database. If the container restarts mid-session, everyone's balances/bets are lost and the round has to restart from the lobby. This was a deliberate simplification for a short, live, one-off event; let me know if you'd rather have a persistent (SQLite-backed) version instead.

## Known assumptions (confirm before a real event)

- Bets are final once placed — no selling back into the market.
- Minimum bet is 1 coin; maximum is your current balance.
- Anyone (including the host) can bet on any presentation, including their own.
- Ties in vote count are broken by insertion order (whichever presentation was added first to the list wins the tie). Flag if you want different tie-breaking.
- Live odds remain visible during voting (not hidden) — also flag if you'd rather hide them to avoid late-vote herding.
