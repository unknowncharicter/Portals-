// Thin wrapper around the CrazyGames SDK v3. Everything is a no-op when the SDK is missing
// (local dev, other sites), so the game never breaks because of it.
let sdk = null;
let onAdStart = () => {}, onAdEnd = () => {};
export function setAdAudioHooks(start, end) { onAdStart = start; onAdEnd = end; }

export async function initSDK() {
  try {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      await window.CrazyGames.SDK.init();
      if (window.CrazyGames.SDK.environment !== 'disabled') sdk = window.CrazyGames.SDK;
    }
  } catch (e) { sdk = null; }
}

function call(fn, fallback) { try { if (sdk) return fn(sdk); } catch (e) { /* ignore */ } return fallback; }
// Real ads only exist on CrazyGames itself (locally the SDK shows a placeholder overlay).
const onCrazyGames = () => !!sdk && sdk.environment === 'crazygames';

export const SDK = {
  get active() { return !!sdk; },
  get onCrazyGames() { return onCrazyGames(); },
  loadingStart: () => call(s => s.game.loadingStart()),
  loadingStop: () => call(s => s.game.loadingStop()),
  gameplayStart: () => call(s => s.game.gameplayStart()),
  gameplayStop: () => call(s => s.game.gameplayStop()),
  happyTime: () => call(s => s.game.happytime()),

  // Midgame ad between matches. Resolves when the ad finished (or immediately without SDK).
  // Elsewhere (your own site) there is no real ad and the "finished" callback may never come,
  // which would freeze the CONTINUE button.
  midgameAd: () => new Promise(resolve => {
    if (!sdk || (sdk.environment !== 'crazygames' && sdk.environment !== 'local')) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; onAdEnd(); resolve(); } };
    setTimeout(finish, 45000); // never wait forever
    try {
      sdk.ad.requestAd('midgame', { adFinished: finish, adError: finish, adStarted: () => onAdStart() });
    } catch (e) { finish(); }
  }),
  // Rewarded ad. Resolves true only if the ad was watched to the end (then give the reward).
  rewardedAd: () => new Promise(resolve => {
    if (!sdk) return resolve(false);
    let done = false;
    const finish = (ok) => { if (!done) { done = true; onAdEnd(); resolve(ok); } };
    setTimeout(() => finish(false), 90000);
    try {
      sdk.ad.requestAd('rewarded', { adFinished: () => finish(true), adError: () => finish(false), adStarted: () => onAdStart() });
    } catch (e) { finish(false); }
  }),
  // Can we offer a rewarded ad at all? (not without the SDK, not with an ad blocker)
  canRewarded: async () => {
    if (!sdk) return false;
    try { return !(await sdk.ad.hasAdblock()); } catch (e) { return false; }
  },

  // ---------- Settings (mute) ----------
  get muteAudio() { return call(s => !!s.game.settings.muteAudio, false); },
  onSettings: (fn) => call(s => s.game.addSettingsChangeListener(fn)),

  // ---------- Device ----------
  get deviceType() { return call(s => s.user.systemInfo.device.type, null); },

  // ---------- User (CrazyGames account) ----------
  getUser: async () => { try { return sdk && sdk.user.isUserAccountAvailable ? await sdk.user.getUser() : null; } catch (e) { return null; } },
  onAuth: (fn) => call(s => s.user.addAuthListener(fn)),

  // ---------- Data (cloud save on the player's CrazyGames account) ----------
  // localStorage-like; null when the Data module isn't available.
  get data() { return call(s => (s.data ? s.data : null), null); },

  // ---------- Multiplayer rooms ----------
  // Tell CrazyGames about our room so its Invite / Join buttons work.
  updateRoom: (code, joinable) => call(s => s.game.updateRoom({ roomId: 'pd-' + code, isJoinable: !!joinable, inviteParams: { room: code } })),
  leftRoom: () => call(s => s.game.leftRoom()),
  inviteLink: (code) => call(s => s.game.inviteLink({ room: code }), null),
  // The room code we were invited to (game opened from an invite), if any.
  get inviteRoom() { return call(s => (s.game.inviteParams && s.game.inviteParams.room) || s.game.getInviteParam('room') || null, null); },
  onJoinRoom: (fn) => call(s => s.game.addJoinRoomListener((params) => { if (params && params.room) fn(String(params.room)); })),
  get instantMultiplayer() { return call(s => !!(s.game.isInstantMultiplayer ?? s.game.isInstantJoin), false); },
};
