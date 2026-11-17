# Portal Duel

A fast browser FPS where you shoot, walk and throw grenades through portals. It's built with Three.js and Vite, for CrazyGames. Live test site: https://fps-portals.pages.dev/

## Play locally
```bash
npm install
npm run dev      # open the URL it prints
```

## Build for CrazyGames
```bash
npm run build    # output goes to dist/
```
Zip the **contents** of `dist/` and upload the zip in the CrazyGames developer portal. The CrazyGames SDK v3 is loaded in `index.html`, with wrappers in `src/sdk.js`: gameplay start/stop, happy time, and a midgame ad between matches (only on CrazyGames itself; the sound is muted during the ad).

Cover images for the store page are in `marketing/`: `cover_1920x1080.png`, `cover_800x1200.png` and `cover_800x800.png`. To regenerate them, edit `marketing/cover.html`.

## Put it online with Cloudflare Pages (free)
1. Sign in at dash.cloudflare.com, then open **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the repo `Portals-` and the branch `claude/fervent-pascal-3wapmb`.
3. Build settings: **Build command** `npm run build`, **Build output directory** `dist`.
4. Click **Save and Deploy**. Every push to the branch updates the site.

## How it plays
- **Lobby tabs:** Play, Character, Shop, Upgrades, Daily, Stats, Settings.
- **Modes:**
  - **1v1, 2v2, Free for all:** last one standing wins the round; first to 3 rounds.
  - **King of the Hill:** 2v2 with respawns. Hold the zone; first team to 100 points wins.
  - **Gun Game:** free for all with respawns. Every kill gives you the next gun.
  - **Portal Only:** damage only counts if the shot went through a portal.
  - **Tutorial:** an 11-step "How to play" lesson.
- **Maps:** Arena, Sky Islands, Warehouse, Village, Sunset Spires, Canyon, or Random.
- **Weapons:**
  - Primary: Assault Rifle, SMG, Shotgun, Sniper (scope), Burst Rifle, Crossbow, Rocket Launcher (rocket jumps!).
  - Secondary: Pistol, Revolver.
  - Grenades: 2 per round.
- **Portals:** E shows the outline and E again places it. You keep your 2 newest portals, and they close after 60 s. Bullets, bolts, rockets, grenades and players all go through them. You can see portals inside portals.
- **Movement:** you're always running. Shift dashes, C slides (or crouches when slow), and you can bunny hop and air strafe.
- **Progression:**
  - XP and levels.
  - A daily login reward streak and 3 daily challenges.
  - Lifetime stats.
  - Coins for upgrades, hats, gun skins and kill effects.
- **Extras:** portal-kill bonus, kill-cam, hit-direction arrows, bots on 3 difficulties, touch controls, and music and sound made entirely in code.
- **Debug:**
  - `?debug` shows graphics info.
  - `?logdepth=1` forces the precise depth mode.
  - `?touch=1` forces touch controls.

## Code map
| File | What it does |
|---|---|
| `src/game/Portals.js` | Portal placement, portal views (plus one level of portals inside portals), teleporting, ray tracing through portals |
| `src/game/Match.js` | Modes, rounds, respawns, shooting, damage, kill-cam, player input |
| `src/game/Projectiles.js` | Grenades, rockets, crossbow bolts, explosions |
| `src/game/Character.js` | Movement (run, slide, dash, crouch, bunny hop), collision, health |
| `src/game/Bot.js` | Bot AI: vision, aiming, hunting, portal flanking, objectives, portal shots |
| `src/game/Tutorial.js` | The step-by-step tutorial |
| `src/game/maps.js` / `World.js` | Map layouts / loading and raycasts |
| `src/game/CharacterModel.js` | Animated character: SWAT and Punk (`public/models/chars/`) or the Mixamo robot (`public/models/character.glb`, also the source of all animation clips); picks run/back/crouch clips from movement |
| `src/game/Retarget.js` | Copies the Mixamo clips onto the SWAT/Punk skeleton at load time |
| `src/game/Look.js`, `Models.js`, `Viewmodel.js`, `Effects.js` | Characters and hats, gun models and skins, first-person gun, effects and kill effects |
| `src/progress.js` | XP, levels, daily reward, challenges, stats, cosmetics catalogue |
| `src/audio.js` | Synthesized sound effects and music |
| `src/main.js` | Menus, lobby tabs, settings, game loop |

## Credits

- SWAT and Punk characters by Quaternius (CC0).
- Animations from Mixamo.
