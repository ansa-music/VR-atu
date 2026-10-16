# VR-ATU Multiplayer — development status

## Implemented on feature/multiplayer-v0-1

- Node.js WebSocket rooms: create, join, leave, ownership transfer, eight-player cap.
- Experimental replicated head pose and simple remote avatars.
- Shared server-created stationary targets and unique target IDs.
- Server-scored shot ray intersection, combos, bombs, gold targets, per-player leaderboard.
- Network clock and personal score on the in-world scoreboard.
- Unit tests and a CI workflow.
- Dockerfile for the server.

## Remaining before production

**This branch is unverified experimental software.** No real two-device multiplayer session or VR headset test has been completed.

1. Start the server (Node.js 20+): `cd server && npm install && npm test && npm start`.
2. Start the website with `python -m http.server 8000`, browse to localhost:8000, enter `ws://localhost:8080`.
3. Open a second browser session or private window; create a room, join by code, start a round.
4. Verify shared targets, leaderboard, latency, cleanup and camera movement.
5. Deploy the Node server to a provider supporting long-lived WebSocket connections and TLS; configure `ALLOWED_ORIGINS=https://ansa-music.github.io` as appropriate.
6. Test WSS from GitHub Pages, VR controls, Arduino hardware, network jitter, reconnect and denial-of-service resistance.
7. Add reconnect tokens, server-side movement/aim reconciliation, anti-cheat, rate limits per room/IP, operational monitoring and production hardening.

## Important limitations

- GitHub Pages hosts the static client only; it cannot execute Node.js or accept WebSocket connections.
- The room server is in memory; deployment restarts remove rooms.
- The authoritative server owns target creation and points, but client-reported aim/pose is only lightly checked, so **this is not cheat-proof**.
- Shared targets are stationary; the older single-player mode still uses animated local targets.
- Players joining an already-running round are rejected; rejoin next round.
- No voice chat, user accounts, persistence or reliable reconnect yet.
- Never put secrets in front-end JavaScript.

Do not merge to main without successful two-client and VR regression tests.
