# Prompt: add Portal Duel to the Paper Comet Games website

Copy everything below the line into the AI that built papercometgames.pages.dev, and attach the 7 image files from this folder.

---

Please add our second game, **Portal Duel**, to the Paper Comet Games website (papercometgames.pages.dev). Sock Run stays exactly as it is: same look, same sections, same /play/ page. Portal Duel is an extra game next to it.

**About the game (use this text, you can shorten it):**
- Name: Portal Duel
- One line: Shoot through portals. Outsmart everyone.
- Short description: A fast first-person arena shooter where every player carries a portal gun. Open a portal behind your enemy, peek through it and take the shot from an angle they never saw coming. Play against smart bots or with friends online, free in your browser.
- Play link (opens the game): https://fps-portals.pages.dev/
- Platforms: any modern browser, computer or phone (touch controls).
- Features (pick 4–6 for a feature list):
  - Portals you can walk, look and shoot through
  - 7 modes: 1v1, 2v2, Free for all, King of the Hill, Capture the Flag, Gun Game, Portal Only
  - 9 maps, including a warehouse, a colosseum and floating sky islands
  - Online play with friends (room codes) or quick match, with bots filling empty spots
  - Gunsmith: 38 gun frames and attachments (scopes with zoom, silencers, grips)
  - 12 characters with hats, masks, back items and victory dances
  - Ranked mode, daily and weekly challenges

**What to change:**
1. Home page: add a "Our games" section near the top (right after the hero) with two cards side by side: Sock Run (links to its existing section / play page) and Portal Duel (links to the new page below). Each card: picture, name, one line, a "Play free" button. On phones the cards stack.
2. New page `/portal-duel/` (its own folder with an index.html), in the same style as the rest of the site (same fonts, colours, header, footer and buttons). It has:
   - A hero with `portal-duel-cover.png`, the name, the one line and a big "Play free in your browser" button to https://fps-portals.pages.dev/ (opens in a new tab).
   - The short description and the feature list.
   - A gallery with the 5 screenshots (`screenshot-*.png`), with alt text describing each picture.
   - A second play button at the bottom.
3. Header/navigation: add a "Portal Duel" link.
4. The `/portal-duel/` page's `<head>`: title "Portal Duel · Paper Comet Games", a meta description using the short description, and Open Graph / Twitter tags using `portal-duel-social.png` (1200×630) so links show a preview.
5. Add `/portal-duel/` to `sitemap.xml`.
6. Put the images in `assets/img/portal-duel/`. Convert them to WebP (keep the PNG for the social image), and use `loading="lazy"` on the gallery images.

Keep everything else working as it is now (Sock Run's scroll video, leaderboard, /play/, press kit, privacy page, the `_worker.js` and `build.sh`). Don't change the Sock Run text.

**Files attached:**
- `portal-duel-cover.png` (1920×1080): hero / card picture
- `portal-duel-social.png` (1200×630): social preview (og:image)
- `screenshot-portals.png`: looking through a portal at the arena
- `screenshot-warehouse.png`: a fight in the Warehouse map
- `screenshot-colosseum.png`: the Colosseum map
- `screenshot-lobby.png`: the lobby with a customised character
- `screenshot-gunsmith.png`: the Gunsmith (gun customisation)
