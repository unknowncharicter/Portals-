// Thin wrapper around the CrazyGames SDK v3. Everything is a no-op when the SDK is missing
// (local dev, other sites), so the game never breaks because of it.
let sdk = null;

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
  midgameAd: () => new Promise(resolve => {
    if (!sdk) return resolve();
    try {
      sdk.ad.requestAd('midgame', { adFinished: resolve, adError: resolve, adStarted: () => {} });
    } catch (e) { resolve(); }
  }),
};
