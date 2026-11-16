// Thin wrapper around the CrazyGames SDK v3. Everything is a no-op when the SDK is missing
// (local dev, other sites), so the game never breaks because of it.
let sdk = null;
let onAdStart = () => {}, onAdEnd = () => {};
export function setAdAudioHooks(start, end) { onAdStart = start; onAdEnd = end; }

export async function initSDK() {
  try {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      await window.CrazyGames.SDK.init();
      sdk = window.CrazyGames.SDK;
    }
  } catch (e) { sdk = null; }
}

function call(fn) { try { if (sdk) fn(sdk); } catch (e) { /* ignore */ } }

export const SDK = {
  loadingStart: () => call(s => s.game.loadingStart()),
  loadingStop: () => call(s => s.game.loadingStop()),
  gameplayStart: () => call(s => s.game.gameplayStart()),
  gameplayStop: () => call(s => s.game.gameplayStop()),
  happyTime: () => call(s => s.game.happytime()),
  // Midgame ad between matches. Resolves when the ad finished (or immediately without SDK).
  // Only on CrazyGames itself: elsewhere (your own site, local testing) there is no real ad
  // and the "finished" callback may never come, which would freeze the CONTINUE button.
  midgameAd: () => new Promise(resolve => {
    if (!sdk || sdk.environment !== 'crazygames') return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; onAdEnd(); resolve(); } };
    setTimeout(finish, 45000); // never wait forever
    try {
      sdk.ad.requestAd('midgame', { adFinished: finish, adError: finish, adStarted: () => onAdStart() });
    } catch (e) { finish(); }
  }),
};
