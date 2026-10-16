# VR-ATU multiplayer server

Node.js 20+; the browser client is static Three.js/WebXR (no build step).

## Local development

```sh
cd server
npm install --package-lock=false
npm test
npm start
```

In another terminal, from the repository root:

```sh
python3 serve.py 8000
```

The local HTTP client automatically uses the loopback WebSocket server on
port 8080. Hosted clients use `js/server-config.js`. Production HTTPS requires
WSS and a separate long-lived Node server; GitHub Pages only serves the client.
`GET /health` returns `{ "ok": true, "rooms": ..., "players": ... }`.

Optional environment variables:
- `PORT`: default 8080 (0 selects an available port for integration tests).
- `ALLOWED_ORIGINS`: comma-separated browser Origin allowlist; configure this
  in production, for example `https://ansa-music.github.io`.

## User flow

Create a room (optional three-digit code, title, capacity and duration), or
join by code. Only the host starts a match. Targets and hit scoring are shared
and owned by the server. The host role transfers when the host leaves.
Players can join between rounds, including after a match finishes.

During play, **Tab**, **Esc**, **Курсор мыши** or **← Меню** opens the menu and releases the mouse;
**Вернуться в матч** resumes controls. The shared round continues while a
player reads the menu. **Выйти в главное меню** disconnects and leaves the
room. A stalled connection can be cancelled and retried.

## Protocol v1

Client messages: `room:create` (`name`, `options`), `room:join` (`code`, `name`),
`room:leave`, `round:start`, `player:pose` (`position`, `rotation`),
`player:shot` (`origin`, `direction`), `player:skin` (`skin`).

Server messages: `welcome`, `room:joined`, `room:update`, `room:left`,
`targets:update`, `player:pose`, `shot:result`, `error`.

`npm test` includes room/scoring regressions, connection lifecycle tests,
UI tests and a real two-WebSocket-client integration test.

## Browser smoke test

Start both services above. Install optional Playwright outside the checkout:

```sh
npm install --prefix /tmp/vr-atu-browser --package-lock=false playwright
NODE_PATH=/tmp/vr-atu-browser/node_modules node server/smoke-browser.cjs
```

Run the second command from the repository root. The runner uses system
Chromium at `/usr/bin/chromium`; override with `CHROMIUM_PATH` if needed.
It exercises two browser clients, firing LMB while holding RMB aim,
Tab pointer release, menu/resume/Escape, leave/host transfer,
and cancellation/retry. It fails on page errors or missing expected behavior.

## Limits

Rooms are in memory and disappear on server restart. Lost connections do not
resume an identity or score automatically. Joining an ongoing round is rejected.
There are no accounts, voice chat or persistence. Aim/pose are client-reported;
server-scored targets do not make this cheat-proof. Real VR/Arduino hardware
and the production WSS deployment still need validation.
