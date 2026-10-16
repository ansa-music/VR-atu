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

**Local automated validation passes**, including two Chromium clients. No real two-device session, production WSS or VR headset test has been completed.

1. Start the server (Node.js 20+): `cd server && npm install && npm test && npm start`.
2. Start the website with `python -m http.server 8000`, browse to localhost:8000 (the local backend is selected automatically).
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

## Cloud validation (2026-10-16)

Node.js 24 and Python 3.12: dependency installation, static asset serving,
backend health, and automated tests passed. A real two-WebSocket-client test
covers room creation/join, host-only start, shared targets and hit results,
host transfer and empty-room cleanup. This does not replace a two-browser or
VR/hardware test. Local HTTP loopback clients now use their local backend on
port 8080; hosted clients retain the configured production WSS endpoint.

Fixed: joining after a round ends, resetting combos on a new round, rejecting
expired target hits, normalizing accepted shot rays, stale connection status
on reconnect, and server shutdown with connected players. Reliable session
resume and production deployment validation remain outstanding.

### Multiplayer navigation validation

25 automated tests pass. `server/smoke-browser.cjs` also passed against two
headless Chromium pages: room create/join/start, persistent menu on score
updates, resume, Escape, leaving/host transfer, and connection cancel/retry.
No JavaScript page errors were reported. Menu access is now labeled explicitly;
opening it does not pause the shared round. No production deployment or real
VR/Arduino validation is implied by these checks.

### Mouse input regression

Reproduced and fixed the RMB-aim + LMB-fire failure: desktop mouse button
handlers now use mousedown/mouseup, which report each button in a chord.
Chromium smoke validation confirms one outgoing shot and one consumed round
while aiming, and verifies Tab releases pointer lock and opens the menu.
A visible cursor-release control documents the shortcut. Pointer-lock loss
clears held movement/aim state. All 25 automated tests still pass.

Aim-first follow-up: RMB now captures the mouse itself. The first LMB shot
while aiming is not consumed by the multiplayer capture-only click. The browser
regression starts with a free cursor, aims first, fires twice while RMB is held,
and checks two sent shots and two consumed rounds, plus ending ADS when RMB
is released before LMB. Changes remain local until explicitly published.
