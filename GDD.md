# HEXABLOW — Game Design Document (v0.2, 2026-11-14)

Hexablow is a casual logic puzzle for phones in portrait (the web build shows a fixed 9:16 frame). It runs on the web with Vite and Three.js and is deployed on Vercel.
This document describes the game **as it is built now**. Ideas that are not built yet are listed in §12.
Mechanics research on the reference game: [RESEARCH.md](RESEARCH.md). Level rules and tooling: [level-tool/](level-tool/README.md). Editing every tunable value: [config-tool/](config-tool/README.md). Balancing with bots: [sim/](sim/README.md).

---
## 1. Vision
A calm, tactile number-path puzzle on a hex grid, set in a cozy garden. The player completes a chain 1 → N by placing the missing numbers so that every number touches the next one. Each level has one solution and can be solved by deduction alone.

**Pillars**
1. **Pure logic.** Every level can be solved by deduction, with no guessing. This is checked by the solver in the level tool.
2. **Tactile and calm.** Snappy drops, soft synth sounds, a garden that grows when you win, and no timer.
3. **Short sessions.** A level takes 1–5 minutes. One-handed portrait play.
4. **Fair monetization.** Coins are earned by playing. Boosters and revives cost coins. Real money is optional (packs and cosmetics).

**Audience:** 18–60, fans of Sudoku, Nonogram and Hidato, casual commuters. Rated 3+ / Everyone.

## 2. Core rules
- **Board:** pointy-top hex cells in axial coordinates. Some cells are **water** (blocked, drawn as a pond with lily pads, lotus flowers and jumping fish). Some numbers are **givens** (fixed). The last number N is always a given; number 1 can be in the tray.
- **Tray:** the remaining numbers come as **tiles of 1–3 cells**. A tile is cut by *position* from the solution, so it keeps the exact shape it has there and can hold non-consecutive numbers (e.g. `4+25`). Tiles never rotate.
- **Goal:** fill every playable cell so that cell(n) is next to cell(n+1) for every n.
- **Placing:** you can drag a tile onto the board, or tap the tile and then tap a cell. The tile's first number lands on the target cell.
  - If the tile matches the solution, it locks in.
  - Wrong spot: the tile stays on the board for a moment while the neighbours it should have touched pulse red. Then you lose a heart and the tile returns to the tray.
  - Occupied or water cell, or off the board: the tile bounces back with no penalty.
- **Tap-to-jump:** when the tray is longer than the screen, tapping a number on the board scrolls the tray to the tile holding n−1 or n+1. Tapping again switches between the two. This is how players find tiles in long trays. A "?" (mystery number, §6.1) has no number yet, so tapping it does nothing (the pad wobbles).
- **Obstacles:** besides the pond, three mechanics change the board from level 7 on: mystery numbers, twin portals and locked cells. See §6.1.
- **Tile looks:** honey-orange tiles; the finishing number N is pink; chains of consecutive, adjacent numbers that include a placed tile turn green.
- **Tray order:** level 1 uses a fixed shuffle, level 2 is ascending (for the jump lesson), and from level 3 the tray is shuffled on every play.

## 3. Hearts, stars, fail and revive
| Topic | Rule |
|---|---|
| Hearts | 3 per attempt (`tuning.hearts.max`). At 1 heart the screen shows a calm warning (heartbeat sound and a soft glow at the edge). |
| Free runs | The first play of levels 1–2: mistakes cost nothing and the result is always 3★. There is no top bar and no boosters. |
| Stars | Stars = hearts left at the win (minimum 1). Best stars are kept per level; you can replay to improve them. |
| Fail | At 0 hearts the "Out of hearts" screen offers **Keep growing** (revive with 1 heart), **Try again** (restart with a new tray order) or **Home**. |
| Revive | Paid in coins. The price rises within the attempt: 20 → 40 → 60, then no more revives (`economy.costs.revive`). |

## 4. Boosters
Boosters are consumables kept in an inventory (`economy.json → boosters`). Each one unlocks at a level, and on that level the game teaches it: it tops your stock up to 2 and has you use one.

| Booster | Unlock | Price (1 / pack of 3) | Effect |
|---|---|---|---|
| **Reveal** | Lv 4 | 20 / 50 | Shows the number of one random empty cell as a ghost number |
| **Find** | Lv 6 | 35 / 85 | Tap an empty cell; the tile that belongs there flies in |
| **Picker** | Lv 8 | 45 / 110 | Opens the whole tray as a sorted list; the tile you tap flies to its cell |

Boosters never cost a heart. When you tap a booster you have none of, a buy popup offers 1 or a pack for coins, or 1 for a rewarded ad (currently a fake ad).

## 5. Player experience
### 5.1 Core loop
- **Micro (5–30 s):** read the board → tap a number to jump the tray → drag a tile → it snaps in with a sound and combo praise.
- **Session (1–5 min per level):** win → garden grows, stars and coins, maybe a new album species → back to the map or home → next level.
- **Meta:** level map, stars, Garden Album sets, daily gift streak, Garden Sets (themes), avatars.

### 5.2 Feedback
- **Combo praise** (`praise.js`): each correct drop without a mistake raises a streak: Nice! → Good! → Great! → Awesome! → Amazing! → Fantastic! → Unstoppable! The particles and sound grow with it. Multi-number tiles add "Double link!" / "Triple link!".
  - A mistake breaks the streak.
  - Waiting too long also breaks it. The time allowed shrinks from 10 s for the first step to 3 s near the top tier.
- **Win:** a pixel-art garden grows across the board, then the result screen shows the art, the solved map, stars, the coin reward and any newly found species.
- **Audio** (`audio.js`, synthesised, no files):
  - Placement pops rise in pitch with each placement.
  - Mistake thud, win and lose jingles, heartbeat at 1 heart.
  - A quiet pentatonic music loop.

### 5.3 Onboarding
| When | Lesson |
|---|---|
| First launch | Goes straight into level 1, without the home screen |
| Level 1 | The gardener and a hand guide each placement in order. Input is locked to the step being taught. |
| Level 2 | Tap-to-jump lesson: tap a number, the tray jumps (right / left / right), then drag the tile in |
| Levels 1–2 | On the first clear, the game continues straight into the next level (the menus appear only after level 3) |
| Level 3 | Hearts lesson: a spotlight on the three hearts. On the first clear, a "Stars!" popup explains that each lost heart costs a star. |
| Levels 4 / 6 / 8 | Booster lesson for Reveal / Find / Picker (gift up to 2, use 1) |
| Levels 3 / 7 / 9 / 11 | Intro screen before the level for Pond / Mystery numbers / Twin portals / Locked cells (once per save, §6.1). On level 3 the hearts lesson starts after it is dismissed. |
| Any level | **Auto hint** (`hint.js`, Settings → Hints, on by default): after 5 s without progress (`tuning.hint.idleSeconds`), a hand points at a number on the board next to the *easiest* tile (fewest valid spots, see the difficulty rule). Tapping that number jumps the tray to the tile. |

## 6. Levels
- **15 levels** in `src/levels.json`, in 3 chapters of 5 that match the album sets: Meadow 1–5, Pond 6–10, Orchard 11–15.
- **Size:** 7 → 19 → 18 → 26 → 28 → 29 → 30 → 31 → 33 → 34 → 37 → 41 → 45 → 49 → 53 cells.
- **Milestone levels 5, 10 and 15 are tagged `hard`.** They have fewer givens and more tiles that have nothing to hook onto. The HARD tag shows on the map and the HUD.
- **Authoring rules:**
  - Every level must be solvable by deduction.
  - From level 5 on, the solution path must not spiral.
  - Only the last number N must be a given.
  - Tile difficulty is Easy (1 spot), Medium (2–3) or Hard (more than 3), counted against the numbers on the board ([DIFFICULTY_RULES.md](level-tool/DIFFICULTY_RULES.md)).
- **Format:**
  ```json
  { "id": 1, "name": "Level 1", "difficulty": "normal",
    "cells": [[q,r]], "blocked": [[q,r]], "givens": {"7": [q,r]},
    "pieces": [[2],[4,25]], "solution": {"1": [q,r]} }
  ```
  Optional mechanic fields: `mystery`, `portals`, `locks` (§6.1).
- Levels are made in the **level tool** (draw the map and path, place givens, cut the tiles, check the rules and the solver, playtest) and checked with `node level-tool/analyze.mjs` and the **bot simulator** (`npm run sim`). See [level-tool/ANALYSIS_15_LEVELS.md](level-tool/ANALYSIS_15_LEVELS.md) for the current status.

### 6.1 Level mechanics
The pond (level 3) is the first obstacle. Three more unlock in order. Each has an **intro screen** before the level that introduces it (shown once per save, `mech-<id>` in the seen-tips list), and the win screen shows a **progress bar (in %)** toward the next unlock (the pond counts as the first step; hidden once everything is unlocked). Data lives in `src/mechanics.json`; helpers in `src/mechanics.js`.

| Mechanic | Unlocks | Level data | Rule |
|---|---|---|---|
| **Pond** (water) | Lv 3 | `blocked` | Cell cannot hold a tile (bounce, no penalty). |
| **Mystery numbers** | Lv 7 | `mystery: [n…]` | A given shows a violet "?". Its number is found by elimination (it is the number missing from the board and the tray). A tile placed next to it opens it (the pad turns into the real number, with a pop). It never counts as a neighbour for the green runs, the red wrong-drop pulse, the auto hint or tap-to-jump until opened. All pads open on the win. Never the last number N. |
| **Twin portals** | Lv 9 | `portals: [[[q,r],[q,r]]…]` | The two cells count as neighbours: n and n+1 may sit on opposite ends. Drawn as a swirl ring in a pair colour (teal, pink, blue); a covered portal keeps a small badge. Tapping one end pulses both. The solution must cross every portal. |
| **Locked cells** | Lv 11 | `locks: [{cell:[q,r], need:K}…]` | A padlock shows how many more cells must be solved. When the player has placed K numbers (givens do not count) it bursts open. A tile cannot go on a locked cell (bounce, no penalty); Find and Picker skip tiles behind a padlock; the auto hint ignores them. Lock cells are never givens. |

Per level, **at most 2 mechanics** (the pond counts). Current plan: 7 pond + mystery · 8 mystery · 9 pond + portal · 10 pond + mystery · 11 lock · 12 pond + portal · 13 pond + lock · 14 pond + mystery · 15 pond + portal. Intro levels (7, 9, 11) keep the tile mix of their tier. Rules are checked by `node level-tool/check-mechanics.mjs`. The level tool has editor tools for all three (Số ẩn, Cổng, Khóa) and its playtest follows the same rules.

## 7. Economy (soft currency: coins)
All numbers are in `src/economy.json` / `src/shop.json`.

| Source | Amount |
|---|---|
| Start | 30 |
| Win, first clear | 10 + star bonus (1★ +0, 2★ +5, 3★ +10) |
| Win, replay | 30% of that (minimum 1) |
| Album set complete (claimed in the Album) | Meadow 30, Pond 40, Orchard 50 |
| Daily gift (§8.2) | 20–40 coins or 1 booster per day; streak chests 100–500 coins plus boosters |
| Shop free gift | 30 coins every 24 h |
| Real money (§8.1) | packs and bundles |

| Sink | Price |
|---|---|
| Boosters | Reveal 20, Find 35, Picker 45 (packs of 3: 50 / 85 / 110) |
| Revive | 20 / 40 / 60 within one attempt |
| Garden Sets | Ocean 600, Lilac 600, Sakura 900, Autumn 1200, Snow 1500 |
| Avatars | 3 free, 3 × 50, 3 × 100 |

Balancing notes from the bot simulator (see `sim/out/report.html` after `npm run sim`):
- Players who lean on boosters spend almost everything they earn.
- Careful players can afford their first Garden Set around day 4.
- Level 15 is the main coin and booster drain.

## 8. Meta systems
### 8.1 Shop (tab "Shop")
- **Boosters for coins:** 1 or a pack of 3.
- **Special:** Seedling Starter, a one-time offer ($0.99, 250 coins + 1 of each booster).
- **Bundles:** Sprout $4.99, Bloom $9.99, Harvest $19.99 (coins and boosters).
- **Gold:** coin packs from 100 coins for $0.99 to 3,800 for $19.99, plus a 10,000-coin jackpot for $49.99. A free 30-coin gift every 24 h.
- **Remove Ads:** configured but hidden (`removeAds.enabled = false`).
- **Garden Sets:** cosmetic themes bought with coins (§8.4).
- Every real-money purchase shows a fake OS confirm sheet. There is no billing SDK yet.

### 8.2 Daily gifts (home button, unlocks after clearing level 4)
- A 7-day table that loops:

  | Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|
  | Gift | 20 coins | 25 coins | 1 Reveal | 30 coins | 40 coins | 1 Find | 1 Picker |

- **Streak chests** at 7, 14, 21 and 28 days in a row, with 100 / 200 / 300 / 500 coins and boosters. Day 28 also gives the Snow set, or 300 coins if you already own it.
- Missing a day resets the streak. Turning the clock back counts as "already claimed".
- A badge on the home button shows when something is ready.

### 8.3 Garden Album (tab "Album")
- Every first clear finds one species. There are 15 species in 3 sets: Meadow (Daisy … Ladybug), Pond (Turtle … Snail) and Orchard (Apple … Fox).
- A completed set pays a coin bonus once the player claims it.
- Each species has a glossary card.

### 8.4 Garden Sets (themes)
- Honey (default), Ocean, Lilac, Sakura, Autumn and Snow.
- A set re-skins the tiles and the board sockets.
- It also recolours the whole UI: buttons, ribbons, nav, tray, level map, settings, speech bubble, tutorial hand and the Reveal ghost number.
- It switches the menu background and the level-map ground art.
- The green "connected" tiles stay the same in every set.

### 8.5 Profile
- Opened from the avatar on the home screen.
- Nickname (1–20 characters), a player ID you can copy, and 9 animal avatars (some cost coins).
- Stored separately from the game save.

### 8.6 Screens and navigation
- **Home:**
  - Play button with the current level.
  - Bottom nav: Shop / Home / Album.
  - Daily gift and settings buttons, avatar.
- **Level map:** a winding trail with level 1 at the bottom. Nodes show current, perfect (3★), partial and locked; a total-star counter sits at the top. A level unlocks when the previous one is cleared.
- **In level:**
  - HUD: back, level name, hearts, settings, coin pill.
  - Board, then tray, then booster bar. Locked boosters show "Lv N".
- **Result:** art, then the solved map, then actions. Win: *Continue* / *Claim* with the coin reward. Lose: revive / try again / home.
- **Settings:** Sound, Music, Vibration, Notifications, Hints, and **Delete account** (tap twice to erase every save and reload).

## 9. Save data (localStorage)
| Key | Contents |
|---|---|
| `hexablow.progress.v1` | Schema v2: stars per level, coins, boosters, owned / equipped cosmetics, album (found species, claimed sets), seen tips, one-time purchases, shop gift time, daily streak |
| `hexablow.settings.v1` | sound, music, vibration, notifications, hints |
| `hexablow.level.v1` | Index of the level "Play" continues from |
| `gardendoku.profile.v1` | Nickname, avatar, owned avatars, player ID |

Saves are versioned and validated on load. A corrupt save starts fresh. Old v1 saves are migrated.

## 10. Technical design
- **Stack:** Vite and Three.js (orthographic scene for the board and tray), with HTML/CSS for the UI. No framework.
- **Rendering:**
  - Hex tiles, sockets, water (caustic texture, shore, decor, fish) and the win garden are built in code (`game.js`, `garden.js`).
  - Numbers are drawn on canvas textures.
  - UI art is WebP in `src/assets/`.
- **Hex math:** axial, pointy-top: `x = size·√3·(q + r/2)`, `y = size·1.5·r`.
- **Config:** gameplay and economy tuning live in `src/*.json`. `economy.json`, `shop.json`, `cosmetics.json` and `collection.json` hold content and prices; `tuning.json` holds the constants that used to be hard-coded (max hearts, auto-hint delay, daily-gift unlock level, avatar prices, combo praise tiers and timing, board layout gaps, board colours). Booster unlock levels in `economy.json` also drive which levels show a tutorial.
- **Debug human bot:** press the backtick key in the game, then *Human bot → Start*. It plays through the real UI (clicks buttons, drags tiles with pointer events, follows every tutorial, dismisses intro and daily popups, presses Continue / Try again) and logs each level. Code: `src/debugBot.js`; `window.__hexablow.bot` holds the log and `summary()`.
- **Tools:** level tool (`level-tool/`), config tool (`config-tool/`), bot simulator (`sim/`). The level tool and the simulator reuse the same difficulty rule and solver.
- **Config tool:** an HTML inspector (like Unity's Serialize Field panel) for every config file above plus `sim/personas.json`. It builds its form from the JSON itself, so any value is editable; `config-tool/js/meta.js` only adds labels, tooltips and ranges. Run `npm run config` (port 5190) to save straight into the files. See [config-tool/README.md](config-tool/README.md).
- **Deploy:** Vercel project `hexablow`; pushing `master` deploys to production.

## 11. Art and audio direction
- Cozy garden: warm cream and green UI, honey-orange tiles, pond water.
- The gardener character guides the tutorial, and a gardener / seed-shop theme runs through the nav icons.
- Rounded heavy numerals. The last number N has its own pink tile.
- All sound is synthesised: soft pops, chimes and a calm pentatonic loop. Vibration is used for placing, mistakes and wins (it can be turned off).
- Rule from the team: **no visual redesign without a new request** from Tuan.

## 12. Not built yet / open questions
- Ad SDK (rewarded ads, possibly interstitials and a banner) and a billing SDK. Both are placeholders now.
- Analytics events (level start / win / fail, booster use, purchases).
- Daily Challenge puzzle mode (timed, separate from the daily gift).
- More content beyond 15 levels and 3 chapters. A live level pipeline.
- Native wrappers (store builds), cloud save, localisation (the UI is English only).
- Smoothing the difficulty: the bot data shows spikes at levels 5, 10 and 15 (L15 is a wall: about 29% win on the first try) and a flat stretch at levels 6–9, where the intro levels of the new mechanics (7, 9) stay easy by design (see the analysis).
- Bot simulator: it does not use elimination to guess a "?" number, so numbers for levels with mystery numbers are an upper bound of the difficulty.
