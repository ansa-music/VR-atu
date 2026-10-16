# VR-ATU Multiplayer v0.1 — server foundation

This is an **experimental rooms-and-presence backend**, not a finished multiplayer game. The existing single-player client on GitHub Pages is unchanged.

## Local run

Requires Node.js 20+:

```bash
cd server
npm install
npm start
```

Check http://localhost:8080/health. Run `npm test` for room logic tests.

Client WebSocket endpoint: `ws://localhost:8080` (local only). Use `wss://` behind HTTPS in production.

Optional environment variables:
- `PORT`: listening port, defaults to 8080.
- `ALLOWED_ORIGINS`: comma-separated browser Origin allowlist (set this in production, e.g. `https://ansa-music.github.io`).

## Protocol v1

Client JSON messages:
- `{"type":"room:create","name":"Player"}`
- `{"type":"room:join","code":"ABC123","name":"Player"}`
- `{"type":"room:leave"}`
- `{"type":"round:start"}` (host only)
- `{"type":"player:pose","position":[0,1.6,0],"rotation":[0,0,0,1]}`

Server responses: `welcome`, `room:joined`, `room:update`, `room:left`, `player:pose`, `error`.

### Not yet implemented
- Rendering of remote avatars in Three.js.
- Synced targets, shots, score and authoritative hit validation.
- Proper per-controller VR hand pose and motion reconciliation.
- Persistent reconnect/resume and production authentication.
- Integrated multiplayer UI.

**Security warning:** pose updates are relayed with basic validation, not server physics checks. Do not use them to award scores. Multiplayer scoring must be authoritative on the server.

Do not merge into `main` until multiplayer client and server integration has been tested.
