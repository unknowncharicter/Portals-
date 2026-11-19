import { Peer } from 'peerjs';

// Online rooms over WebRTC (PeerJS). The host's browser is the hub: every player connects to
// the host, and the host passes messages on. A room code is the host's PeerJS id.
//
// Messages are small JSON objects with a type `t`:
//   hello   (player -> host)  { me }            : a player joins
//   welcome (host -> player)  { id }            : your player id
//   lobby   (host -> all)     { players, mode, map }
//   start   (host -> all)     { mode, map, roster }
//   s       (both ways)       { list }          : character states (movement)
//   ev      (both ways)       { e, ... }        : game events (shots, kills, portals...)
//   kick / closed             : you were removed / the room closed

const PREFIX = 'portalduel-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

function peerOptions() {
  // ?peer=host:port uses a local PeerJS server (for testing); default is the free cloud server.
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: +port || 9000, path: '/', secure: false, debug: 0 };
}

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class Room {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.conns = new Map();      // host: player id -> connection
    this.hostConn = null;        // player: connection to the host
    this.players = [];           // [{ id, name, look, color, loadout, gunSkin }]
    this.mode = '2v2';
    this.map = 'arena';
    this.handlers = {};
    this.nextId = 1;
    this.closed = false;
  }

  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, ...args) { for (const fn of this.handlers[type] || []) fn(...args); }

  // ---------- Host ----------
  // code: a fixed code (public rooms); otherwise a random one.
  host(me, tries = 3, code = null, netTries = 2) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.code = code || makeCode();
      this.myId = 'h';
      this.players = [{ ...me, id: 'h' }];
      const peer = this.peer = new Peer(PREFIX + this.code, peerOptions());
      const fail = (e) => {
        peer.destroy();
        if (e && e.type === 'unavailable-id' && tries > 0 && !code) this.host(me, tries - 1, null, netTries).then(resolve, reject);
        // The free online server sometimes hiccups: try again before giving up.
        else if (isNetErr(e) && netTries > 0) setTimeout(() => this.host(me, tries, code, netTries - 1).then(resolve, reject), 1200);
        else reject(err(niceError(e), e && e.type === 'unavailable-id' ? 'taken' : 'network'));
      };
      peer.once('open', () => { peer.off('error', fail); peer.on('error', (e) => this.emit('error', niceError(e))); resolve(this.code); });
      peer.once('error', fail);
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('disconnected', () => { if (!this.closed) peer.reconnect(); });
    });
  }

  accept(conn) {
    let id = null;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        // Players can join any time (mid-match they take over a bot), up to 4.
        if (this.players.length >= 4) { conn.send({ t: 'kick', reason: 'The room is full (4 players).', code: 'full' }); setTimeout(() => conn.close(), 300); return; }
        id = 'p' + this.nextId++;
        this.conns.set(id, conn);
        this.players.push({ ...cleanMe(msg.me), id });
        conn.send({ t: 'welcome', id });
        this.sendLobby();
        this.emit('players', this.players);
        this.emit('joined', id);
        return;
      }
      if (!id) return;
      if (msg.t === 'bye') { gone(); return; }
      this.emit('message', msg, id);
    });
    const gone = () => {
      if (!id || !this.conns.has(id)) return;
      this.conns.delete(id);
      this.players = this.players.filter(p => p.id !== id);
      this.sendLobby();
      this.emit('players', this.players);
      this.emit('left', id);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  sendLobby() {
    if (!this.isHost) return;
    this.broadcast({ t: 'lobby', players: this.players, mode: this.mode, map: this.map });
  }

  setSettings(mode, map) {
    this.mode = mode; this.map = map;
    this.sendLobby();
  }

  // ---------- Player ----------
  join(code, me, timeoutMs = 12000, netTries = 2) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const peer = this.peer = new Peer(peerOptions());
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; peer.destroy(); reject(err('Could not reach that room. Check the code and try again.', 'timeout')); } }, timeoutMs);
      peer.once('error', (e) => {
        if (done) return; done = true; clearTimeout(timer); peer.destroy();
        if (isNetErr(e) && netTries > 0) { setTimeout(() => this.join(code, me, timeoutMs, netTries - 1).then(resolve, reject), 1200); return; }
        reject(err(niceError(e), e && e.type === 'peer-unavailable' ? 'not-found' : 'network'));
      });
      peer.once('open', () => {
        const conn = this.hostConn = peer.connect(PREFIX + this.code, { reliable: true });
        conn.on('open', () => conn.send({ t: 'hello', me: cleanMe(me) }));
        conn.on('data', (msg) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'welcome') { this.myId = msg.id; if (!done) { done = true; clearTimeout(timer); resolve(this.code); } return; }
          if (msg.t === 'kick') { done = true; clearTimeout(timer); reject(err(msg.reason, msg.code || 'kicked')); this.leave(); return; }
          if (msg.t === 'closed') { if (!this.closed) { this.closed = true; this.emit('closed', 'The host closed the room.'); } return; }
          if (msg.t === 'lobby') { this.players = msg.players; this.mode = msg.mode; this.map = msg.map; this.emit('players', this.players); return; }
          this.emit('message', msg, 'h');
        });
        conn.on('close', () => { if (!this.closed) { this.closed = true; this.emit('closed', 'The host left the room.'); } });
      });
    });
  }

  // ---------- Sending ----------
  // Player: to the host. Host: to every player (except `except`).
  broadcast(msg, except = null) {
    if (this.isHost) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg); }
    else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }
  sendTo(id, msg) {
    if (this.isHost) { const c = this.conns.get(id); if (c && c.open) c.send(msg); }
    else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  leave() {
    if (this.left) return;
    this.left = this.closed = true;
    // Say goodbye first (a dropped WebRTC connection can take a while to notice), then close.
    try { this.broadcast({ t: this.isHost ? 'closed' : 'bye' }); } catch (e) { /* ignore */ }
    const conns = [...this.conns.values(), this.hostConn].filter(Boolean), peer = this.peer;
    setTimeout(() => {
      try { for (const c of conns) c.close(); } catch (e) { /* ignore */ }
      try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
    }, 300);
    this.conns.clear();
    this.handlers = {};
  }
}

const isNetErr = (e) => !!e && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type);

function err(message, code) { const e = new Error(message); e.code = code; return e; }

function cleanMe(me = {}) {
  return {
    name: String(me.name || 'Player').slice(0, 14),
    look: me.look || {},
    color: me.color || '#36b5ff',
    loadout: me.loadout || { primary: 'ar', secondary: 'pistol' },
    gunSkin: me.gunSkin || null,
  };
}

function niceError(e) {
  const type = e && e.type;
  if (type === 'peer-unavailable') return 'Room not found. Check the code.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'Could not reach the online server. Your network may be blocking online play (common on school or work Wi-Fi), or an ad blocker may be. Try another network, a phone hotspot, or turning the ad blocker off for this site.';
  if (type === 'browser-incompatible') return 'Your browser does not support online play.';
  return (e && e.message) || 'Connection problem.';
}
