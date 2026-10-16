// Standalone multiplayer transport. Not wired to the single-player game yet.
// The WebSocket URL must point to a deployed VR-ATU server (wss:// on HTTPS).
export class MultiplayerClient extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.socket = null;
    this.playerId = null;
    this.room = null;
    this.state = 'disconnected';
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  connect() {
    if (this.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.socket.readyState)) {
      return Promise.resolve();
    }
    const socket = new WebSocket(this.url);
    this.socket = socket;
    this.state = 'connecting';
    this._emit('status', { state: this.state });
    return new Promise((resolve, reject) => {
      let settled = false;
      socket.addEventListener('open', () => {
        this.state = 'connected';
        this._emit('status', { state: this.state });
        settled = true;
        resolve();
      });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'welcome') this.playerId = message.playerId;
        if (message.type === 'room:joined' || message.type === 'room:update') this.room = message.room;
        if (message.type === 'room:left') this.room = null;
        this._emit(message.type, message);
      });
      socket.addEventListener('error', () => {
        if (!settled) { settled = true; reject(new Error('WebSocket connection failed')); }
        this._emit('error', { code: 'NETWORK_ERROR' });
      });
      socket.addEventListener('close', () => {
        if (!settled) { settled = true; reject(new Error('WebSocket closed before connecting')); }
        if (this.socket !== socket) return;
        this.state = 'disconnected';
        this.room = null;
        this._emit('status', { state: this.state });
      });
    });
  }

  send(type, data = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type, ...data }));
    return true;
  }

  createRoom(name, options = {}) { return this.send('room:create', { name, options }); }
  joinRoom(code, name) { return this.send('room:join', { code, name }); }
  leaveRoom() { return this.send('room:leave'); }
  startRound() { return this.send('round:start'); }
  sendPose(position, rotation) { return this.send('player:pose', { position, rotation }); }

  disconnect() {
    if (this.socket) this.socket.close(1000, 'Client disconnect');
  }
}
