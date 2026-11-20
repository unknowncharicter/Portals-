import { Peer } from 'peerjs';
import { cleanName } from '../game/Look.js';

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

// Connection helpers (STUN finds your public address; TURN relays when a direct connection is
// impossible). Relay logins come from our own site (/api/turn), fetched once and kept a while.
const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const host = location.hostname;
const TURN_API = host.endsWith('.pages.dev') ? '/api/turn' : /crazygames|1001juegos/.test(host) ? 'https://fps-portals.pages.dev/api/turn' : null;
let ice = null, iceAt = 0;
export async function iceServers() {
  if (ice && Date.now() - iceAt < 6 * 3600e3) return ice;
  ice = STUN;
  if (TURN_API) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(TURN_API, { signal: ctl.signal }); clearTimeout(t);
      const d = await r.json();
      if (Array.isArray(d.iceServers) && d.iceServers.length) { ice = d.iceServers; iceAt = Date.now(); }
    } catch (e) { /* offline or not set up: STUN only */ }
  }
  return ice;
}

function peerOptions(servers = STUN) {
  const config = { iceServers: servers, iceCandidatePoolSize: 2 };
  // ?peer=host:port uses a local PeerJS server (for testing); default is the free cloud server.
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0, config };
  const [h, port] = q.split(':');
  return { host: h, port: +port || 9000, path: '/', secure: false, debug: 0, config };
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
  async host(me, tries = 3, code = null, netTries = 2) {
    const servers = await iceServers();
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.code = code || makeCode();
      this.myId = 'h';
      this.players = [{ ...me, id: 'h', team: 0 }];
      const peer = this.peer = new Peer(PREFIX + this.code, peerOptions(servers));
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
        // Players can join any time (mid-match they take over a bot), up to 6.
        if (this.players.length >= 6) { conn.send({ t: 'kick', reason: 'The room is full (6 players).', code: 'full' }); setTimeout(() => conn.close(), 300); return; }
        id = 'p' + this.nextId++;
        this.conns.set(id, conn);
        // A new player starts on the smaller team (they can switch in a private room).
        const n0 = this.players.filter(p => p.team === 0).length, n1 = this.players.filter(p => p.team === 1).length;
        this.players.push({ ...cleanMe(msg.me), id, team: n0 <= n1 ? 0 : 1 });
        conn.send({ t: 'welcome', id });
        this.sendLobby();
        this.emit('players', this.players);
        this.emit('joined', id);
        return;
      }
      if (!id) return;
      if (msg.t === 'bye') { gone(); return; }
      if (msg.t === 'team') { this.setTeam(id, msg.team); return; }
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

  // Private rooms: which team a player wants (0 blue, 1 red, null = any). Host only; players ask
  // the host with pickTeam().
  setTeam(id, team) {
    const p = this.players.find(q => q.id === id);
    if (!p) return;
    p.team = team === 0 || team === 1 ? team : null;
    this.sendLobby();
    this.emit('players', this.players);
  }
  pickTeam(team) {
    if (this.isHost) this.setTeam(this.myId, team);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'team', team });
  }

  setSettings(mode, map) {
    this.mode = mode; this.map = map;
    this.sendLobby();
  }

  // ---------- Player ----------
  async join(code, me, timeoutMs = 15000, netTries = 2) {
    const servers = await iceServers();
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const peer = this.peer = new Peer(peerOptions(servers));
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; peer.destroy(); reject(err('Found the room but could not connect to it. Your network (or theirs) may be blocking online play. Try again, or try another network.', 'timeout')); } }, timeoutMs);
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

  // Host: drop a player we stopped hearing from (closing their connection runs the normal
  // "player left" steps, so a bot takes over).
  drop(id) { const c = this.conns.get(id); if (c) { try { c.close(); } catch (e) { /* ignore */ } } }

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
    name: cleanName(String(me.name || 'Player')),
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
