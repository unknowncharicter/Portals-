# Launch checklist

## 1. Turn on the global leaderboard (Cloudflare, about 3 minutes)

The game already has the leaderboard code (`functions/api/leaderboard.js`). It just needs storage:

1. Cloudflare dashboard → **Workers & Pages** → **KV** → **Create a namespace** → name it `portal-duel-leaderboard`.
2. **Workers & Pages** → your Pages project (**fps-portals**) → **Settings** → **Bindings** (or *Functions → KV namespace bindings*) → **Add** → **KV namespace**:
   - Variable name: `LEADERBOARD`
   - Namespace: `portal-duel-leaderboard`
3. **Deployments** → **Retry deployment** on the latest one (bindings only apply to new deployments).
4. Play one match, then open **Stats** in the lobby: your name should be on the leaderboard.

Until this is done the Stats tab just says "The global leaderboard is coming soon" — nothing breaks.

## 2. Play-test (you + a friend)

- [ ] Computer: play a 1v1, a 2v2, Capture the Flag and King of the Hill against bots.
- [ ] Phone (landscape): play one match with the touch controls.
- [ ] Online → Quick match on two devices at the same time, same mode: you should end up in the same match.
- [ ] Online → Create room on one device, Join with the code on the other.
- [ ] Note anything that feels wrong (too hard/easy, confusing, laggy) and send it to Claude.

## 3. Submit to CrazyGames

1. Make a developer account at **developer.crazygames.com**.
2. **Submit a game** → upload `release/portal-duel-crazygames.zip` (Claude builds it with
   `npm run build`, then zips the `dist` folder). It's about 4.6 MB.
3. Fill in:
   - **Title:** Portal Duel
   - **Category:** Shooting (tags: FPS, Multiplayer, Portal, 3D, Bots)
   - **Description** (suggestion): *Fast arena shooter where you place two portals anywhere — walls,
     floors, ceilings — and walk, look and shoot through them. Flank enemies, shoot yourself in the
     back by mistake, and climb the ranks. Play 1v1, 2v2, Free for all, King of the Hill, Capture the
     Flag, Gun Game and Portal Only against bots, or online with friends and strangers.*
   - **Controls:** WASD move · Mouse aim · Left click shoot · Right click aim · E portal (E again to
     place) · Space jump · Shift dash · C crouch/slide · R reload · F heal · G grenade
   - **Mobile:** yes (landscape)
   - **Multiplayer:** yes (online rooms + quick match; bots fill empty spots)
4. **Cover images:** upload the files in `marketing/`: `cover_1920x1080.png` (landscape),
   `cover_800x1200.png` (portrait), `cover_800x800.png` (square).
5. CrazyGames tests the game in their **QA tool** first. The game already uses their SDK
   (loading events, gameplay start/stop, midgame ads after matches, "happy time" on wins).
6. Their review usually takes a few days to a couple of weeks; they reply with feedback in the portal.

## Credits for the store page

Models and sounds are listed under **Credits** in `README.md` — some are CC-BY and need the
creator named. Paste that list into the game description or a credits section if CrazyGames asks.
