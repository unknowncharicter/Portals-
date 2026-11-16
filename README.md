# Portal Duel

A browser FPS where you shoot (and walk) through portals. It's built with Three.js and Vite, for CrazyGames.

## Play locally
```bash
npm install
npm run dev      # open the URL it prints
```

## Build for CrazyGames
```bash
npm run build    # output goes to dist/
```
Zip the **contents** of `dist/` and upload the zip in the CrazyGames developer portal. The CrazyGames SDK v3 is already loaded in `index.html`. Wrappers for it are in `src/sdk.js` (gameplay start/stop, happy time, midgame ad between matches).

## How it plays
- **Play**, then the **Lobby**: customize your character (name, shirt, pants, skin, hats bought with coins), buy upgrades, pick your loadout, portal colour, mode (1v1, 2v2, Free for all) and bot difficulty (Hard gives 1.5× coins).
- Settings (mouse speed, field of view, volume) are in the lobby and the pause menu.
- Each match is first to 3 rounds. Each round starts with a 3-2-1 countdown, and the last team alive wins it.
- **E** shows the portal outline, and **E** again places it. **Q** cancels.
- You keep your 2 newest portals: placing a 3rd removes the oldest.
- Every portal closes after 60 s. There are 2 s between placements (upgradeable).
- Portals go on any surface, including the floor under you so you fall through. There is no range limit.
- You can walk, look and shoot through portals, both ways, and you can shoot yourself.
- Loadout: rifle (1), pistol (2), heal (F, 15 s cooldown).

## Code map
| File | What it does |
|---|---|
| `src/game/Portals.js` | Portal placement, view rendering (render-to-texture with an oblique near plane), teleporting, shots passing through portals |
| `src/game/World.js` | Box-only map, raycasts |
| `src/game/Character.js` | Movement, collision, step-up, body model, health |
| `src/game/Look.js` | Character customization: colours, hats, body model, name tags |
| `src/game/Models.js` | Loads the GLB gun models |
| `src/game/Bot.js` | Bot AI: chase, strafe, aim, heal, portal flanking |
| `src/game/Match.js` | Rounds, modes, shooting, player input |
| `src/main.js` | Menus, lobby, game loop |

## Put it online with Cloudflare Pages (free)
1. Sign in at dash.cloudflare.com, then open **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the repo `Portals-` and the branch `claude/fervent-pascal-3wapmb`.
3. Build settings: **Build command** `npm run build`, **Build output directory** `dist`.
4. Click **Save and Deploy**. You get a link like `https://portal-duel.pages.dev`. Every push to the branch updates it.

From a terminal instead: `npm run deploy` (it asks you to log in to Cloudflare the first time).
