// WebSocket room transport shared by the desktop and WebXR clients.
export class MultiplayerClient extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.socket = null;
    this.playerId = null;
    this.room = null;
    this.state = 'disconnected';
    this.pendingConnection = null;
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  connect() {
    if (this.pendingConnection) return this.pendingConnection;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    let socket;
    try { socket = new WebSocket(this.url); }
    catch (error) { return Promise.reject(error); }
    this.socket = socket;
    this.state = 'connecting';
    this._emit('status', { state: this.state });
    const attempt = new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        finish(new Error('WebSocket connection timed out'));
        socket.close();
      }, 15000);
      socket.addEventListener('open', () => {
        if (this.socket !== socket) return;
        this.state = 'connected';
        this._emit('status', { state: this.state });
        finish();
      });
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'welcome') this.playerId = message.playerId;
        if (message.type === 'room:joined' || message.type === 'room:update') this.room = message.room;
        if (message.type === 'room:left') this.room = null;
        this._emit(message.type, message);
      });
      socket.addEventListener('error', () => {
        finish(new Error('WebSocket connection failed'));
        if (this.socket === socket) this._emit('error', { code: 'NETWORK_ERROR' });
      });
      socket.addEventListener('close', () => {
        finish(new Error('WebSocket closed before connecting'));
        if (this.socket !== socket) return;
        this.socket = null;
        this.state = 'disconnected';
        this.room = null;
        this.playerId = null;
        this._emit('status', { state: this.state });
      });
    });
    const pending = attempt.finally(() => {
      if (this.pendingConnection === pending) this.pendingConnection = null;
    });
    this.pendingConnection = pending;
    return pending;
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
