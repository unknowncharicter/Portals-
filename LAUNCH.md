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

## 1b. Make room codes work between different networks (Cloudflare, about 5 minutes, free)

Without this, online play only works when both players' networks allow a direct connection (often not on phone data, school/work Wi-Fi or strict routers). This adds a free relay (Cloudflare gives 1000 GB a month free).

1. Cloudflare dashboard → search **TURN** (it's under **Realtime** → **TURN Server**) → **Create** a TURN key. Name it `portal-duel`.
2. Copy the **Turn Token ID** and the **API Token** it shows (the token is shown only once).
3. **Workers & Pages** → **fps-portals** → **Settings** → **Variables and Secrets** → **Add**:
   - `TURN_KEY_ID` = the Turn Token ID (type: Text)
   - `TURN_KEY_TOKEN` = the API Token (type: **Secret**)
4. **Deployments** → **⋯** → **Retry deployment** on the newest one.
5. Check: open https://fps-portals.pages.dev/api/turn . It should say `"relay":true`.

## 2. Play-test (you + a friend)

- [ ] Computer: play a 1v1, a 2v2, Capture the Flag and King of the Hill against bots.
- [ ] Phone (landscape): play one match with the touch controls.
- [ ] Online → Quick match on two devices at the same time, same mode: you should end up in the same match.
- [ ] Online → Create room on one device, Join with the code on the other.
- [ ] Note anything that feels wrong (too hard/easy, confusing, laggy) and send it to Claude.

## 3. Submit to CrazyGames (full version)

The game is built for CrazyGames' **Full Launch** requirements:

| Requirement | How Portal Duel does it |
|---|---|
| SDK v3: loading + gameplay events | `loadingStart/Stop`, `gameplayStart` on every match / resume, `gameplayStop` on pause / menus / match end |
| Happy time | Only when you win a match |
| Ads | Midgame video after single-player matches (never during play, never twice in one break). Optional rewarded video on the results screen: "+coins", reward only when watched to the end, hidden with an ad blocker. Sound off and input blocked while an ad plays |
| Mute setting | CrazyGames' mute always wins over the in-game volume (also when changed while playing) |
| Progress save | **Data module**: progress is saved on the player's CrazyGames account (this browser's old save is moved over the first time) |
| Account | Uses the CrazyGames username (unless the player typed their own name) and shows the profile picture. No own login. Logging in / out reloads with that account |
| Multiplayer | Private rooms are reported with `updateRoom` (Invite / Join buttons work; not joinable when full), `leftRoom` when leaving, invite links open straight into the room, "instant multiplayer" opens a room, Copy gives a CrazyGames invite link |
| Usernames | Shown above players and in the room list. Names with rude words are blocked (in the game, in rooms and on the leaderboard). No chat |
| One click to play | No title screen: the lobby opens straight away; new players get "Play tutorial / Start match". The Paper Comet intro plays only on the first visit (a click skips it) |
| Devices | Phone/tablet controls switch on from CrazyGames' device type. No own full-screen button on CrazyGames. Xbox / PlayStation controllers work |
| Size | About 11 MB, ~130 files (limits: 50 MB initial, 1500 files) |

### The form

1. **developer.crazygames.com** → **Submit a game** → upload `release/portal-duel-crazygames.zip`.
2. Fill in:
   - **Title:** Portal Duel
   - **Category:** Shooting · **Tags:** FPS, Multiplayer, Portal, 3D, Bots, PvP
   - **Description:**
     *Portal Duel is a fast arena shooter where everyone carries a portal gun. Open two portals anywhere (walls, floors, curved walls) and walk, look and shoot through them. Flank enemies from angles they never expect, or open a portal under your feet to escape.*
     *Play 1v1, 2v2, 3v3, Free for all, King of the Hill, Capture the Flag, Gun Game and Portal Only on 8 maps against smart bots, or online with friends (room codes, pick your teams) and other players (quick match). Customise 12 characters with hats, masks, back items and victory dances, build your guns in the Gunsmith (38 frames, scopes with zoom, silencers, grips) and climb the ranked ladder.*
   - **Controls:**
     *WASD move · Mouse aim · Left click shoot · Right click aim (scroll / Z: sight zoom) · E portal (E again to place) · Q cancel portal · Space jump · Shift dash · C crouch / slide · R reload · F heal · G grenade · 1/2 switch gun · B dance (hold to pick) · Esc pause. Controller: sticks move/look, RT shoot, LT aim, A jump, B slide, X reload, Y swap, LB portal, RB grenade. Mobile: on-screen buttons.*
   - **Orientation:** landscape · **Mobile:** yes · **Controller:** yes
   - **Multiplayer:** yes. Lobby size **6**. Tick **"Progress Save"** (needed for the Data module).
   - **Language:** English
3. **Covers** (in `marketing/`): `cover_1920x1080.png`, `cover_800x1200.png`, `cover_800x800.png`. They follow CrazyGames' cover rules: the title only (no "Play now" or other text), one clear focal point (your character by a glowing portal), no borders or logos.
   **Preview videos** (also required, in `marketing/`): `preview_landscape_1920x1080.mp4` and `preview_portrait_1080x1620.mp4`: 15 s, no sound, they start on the cover picture, real gameplay (a hero by a portal, a shot through a portal that takes out a bot, a 3v3 fight in the Warehouse, running through a portal).
4. Test it in the portal's **Preview** tool before sending: start a match, finish it (an ad should play after Continue), try the rewarded "+coins" button, open a room and use CrazyGames' Invite button from a second account.
5. Credits: paste the list from `README.md` (some models are CC-BY and need the creator named).

## Credits for the store page

Models and sounds are listed under **Credits** in `README.md` — some are CC-BY and need the
creator named. Paste that list into the game description or a credits section if CrazyGames asks.


## Basic Launch: the 4 numbers CrazyGames watches (7-21 days)

| Metric | Good | What helps Portal Duel |
|---|---|---|
| Conversion (plays 1+ min) | 80%+ | 6 MB build, intro only once, one click to a match, tutorial offered |
| Average play time | 10+ min | Rounds, 8 modes, ranked RP, unlocks, Gunsmith |
| Day 1 retention | 10-15% | Daily reward + daily / weekly challenges, cloud saves |
| Click-through rate (from 23 Nov 2026) | top 20% | New covers (one character + portal, bold title) and the hover video |

Tip: covers can be A/B tested later in the developer portal (see "A/B Testing Your Covers" in their docs).
