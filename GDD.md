# HEXABLOW — Game Design Document (v0.1)

Working title: **Hexablow** (placeholder; check trademark/store name availability).
Platform: iOS + Android (portrait, phones first, tablet-scaled). Genre: casual logic puzzle. Based on research in [RESEARCH.md](RESEARCH.md).

---
## 1. Vision
A calm, tactile number-path puzzle on a hex grid. The player completes a continuous chain 1 → N by placing missing numbers so every number touches the next. One unique solution per level, no guessing required, no time pressure.

**Pillars**
1. **Pure logic** — every level solvable by deduction; zero luck.
2. **Tactile & calm** — satisfying snaps, soft sounds, gentle visuals, no stress.
3. **Short sessions** — a level takes 1–5 min; one-handed portrait play.
4. **Fair monetization** — ads are optional (rewarded) plus one light banner/interstitial cadence; never block a solve.

**Target audience:** 18–60, Sudoku/Nonogram/Hidato fans, casual commuters. Rated 3+/Everyone.

## 2. Core mechanic (kept from reference — MVP-locked)
- Board: set of hex cells (pointy-top, axial coords). Some cells are **blocked** (decor/obstacle). Some numbers are **givens** (locked).
- Tray: remaining numbers grouped into **chains of 1–3 consecutive numbers (max 3)**. A chain keeps the exact shape it has in the solution and may bend in **any direction** (straight, 60°/120° turns), as long as the tiles stay adjacent. Givens are spread along the path; N is always given. Chains are stored per level in `levels.json` (`pieces`); the generator checks every level is solvable by pure logic, using chain shapes as clues.
- Goal: place every tray piece so that for all n, cell(n) is adjacent (6-neighbourhood) to cell(n+1), every playable cell is filled, and the result equals the unique solution.
- Adjacent consecutive numbers show a **connector bar**.
- Lose condition (normal mode): 3 mistakes (hearts) → level fails (retry / revive by rewarded ad).
- Win: all cells filled correctly.

### 2.1 Rules detail
| Topic | Rule |
|---|---|
| Neighbours | (±1,0), (0,±1), (+1,−1), (−1,+1) axial |
| Given | Fixed, cannot move, drawn with bold/darker style |
| Chain piece | Pre-solved run of ≥2 consecutive numbers. Orientation **fixed** in MVP (no rotation), so it fits only where solution places it |
| Mistake | Dropping a piece on a cell that differs from the solution (or breaks adjacency to already placed neighbours) → piece bounces back, −1 heart, red shake |
| Placement validation | Compare with stored solution (O(1)); levels are validated offline by the solver |
| Undo | Remove a placed piece by tapping/dragging it back to tray (free, no heart refund) |
| Hints | Reveal one correct placement (piece highlights & auto-places) |
| Daily | Large board, count-up timer, no hearts, one attempt/day streak counted by completion |

## 3. Player experience / core loop
- **Micro (10–60 s):** pick piece → drag/tap → snap → connector appears → chain grows.
- **Session (1–5 min):** finish a level → reward → next level (auto-continue button).
- **Meta:** world-map progress by "gardens" (chapters of 20–25 levels), daily streak, collectible decor (optional, post-MVP).

## 4. Controls (mobile)
- **Drag & drop** piece from tray to cell; ghost preview snaps to nearest valid cell; green outline = target.
- **Tap-tap alternative** (accessibility): tap piece (selected, blue outline), tap cell to place.
- Tray scrolls horizontally (swipe); long-press piece to enlarge preview.
- Pinch-zoom + pan on boards > 60 cells; double-tap re-centers.
- Buttons: Back, Settings, Hint, Find (highlights where the piece with the lowest missing number belongs, i.e. a cheaper, vaguer hint), Undo.
- Haptics: light tick on snap, soft buzz on mistake, success pattern on win (toggle in settings).

## 5. Level design
### 5.1 Structure
- Chapters ("Gardens"): Meadow, Pond, Orchard, Night Garden, Winter Garden… 20–25 levels each; MVP: 3 chapters / 60 levels.
- Difficulty ramp: size 7 → 19 → 37 → 61 → 91+ cells; givens density falls from ~35% to ~12%; more obstacles/pond cells; longer chains hidden in tray.
- Labels: Normal / Hard (red) / Expert. Levels 1–5 are guided tutorials (bee-like mascot speech bubbles, orange highlighted tutorial pieces).
- Daily Challenge: date-seeded from level pool or generator; calendar with past days.

### 5.2 Level data (JSON)
```json
{
  "id": 15, "chapter": "pond", "difficulty": "hard",
  "cells":   [[0,0],[1,0]],
  "blocked": [[2,1]],
  "givens":  {"1": [0,0], "7": [3,-1]},
  "solution":{"1":[0,0], "2":[1,0]},
  "tutorial": null
}
```
Tray chains and their shuffle order are **derived at load** (seeded by level id) from `solution` minus `givens`.

### 5.3 Authoring / generation pipeline
1. Choose region shape (templates + random cell removal for ponds).
2. Generate Hamiltonian path over region (randomised DFS with Warnsdorff heuristic, backtracking budget).
3. Pick givens: start with 1 and N; add givens until the **solver** reports exactly one solution; then try removing givens greedily while uniqueness holds.
4. Rate difficulty from solver stats (forced-move depth, branching), assign to curve.
5. Human playtest top ~20% hardest; export JSON → `Levels/` folder. Built as a Unity Editor tool / CLI script.

**Solver:** DFS over number sequence from lowest given outward with constraint propagation (distance between givens ≤ |n−m|, parity of hex colouring, dead-end pruning); counts solutions up to 2.

## 6. Systems
| System | Spec |
|---|---|
| Hearts | 3 per normal level; refilled each level; revive = watch rewarded ad (+1 heart, once per level) |
| Hints | Start 3; +1 per 3 levels completed; extra via rewarded ad. Hint auto-places the piece containing the smallest missing number |
| Find | Free, unlimited, 5 s cooldown; pulses the target cell area (not exact) |
| Daily Challenge | 1 puzzle/day, timer, streak counter, monthly calendar badges |
| Progress/Save | Local save (JSON) with cloud-sync optional later; mid-level state autosaved |
| Settings | Sound, music, haptics, colour-blind mode, left-handed tray, language, privacy/consent, restore purchases |
| Languages | EN at launch; VI + ES/PT/ID/TR/RU next (text is minimal — mostly numerals) |

## 7. Monetization
- **Rewarded ads:** revive, extra hints, skip level (once per 10 levels).
- **Interstitial:** after every 3rd completed level from level 8 onward, never mid-level, 90 s minimum gap; none in first 5 levels.
- **Banner:** bottom of gameplay screen (small, adaptive). Removed by IAP.
- **IAP:** Remove Ads (one-time, ~$3.99), Hint packs (small), optional "Garden Pass" cosmetic bundle later.
- Consent: Google UMP/ATT prompts, COPPA-safe config if kids audience is targeted (rated 3+ → use child-directed treatment or restrict targeting; decide before launch).
- Mediation: AdMob / LevelPlay.
- KPIs: D1 ≥ 40%, D7 ≥ 15%, avg session ≥ 6 min, ads/DAU 4–6, level-completion funnel per level.

## 8. Art direction (free to diverge from reference)
**Concept:** keep tactile "tile" feel but with a **distinct identity**. Recommended: *Honey-comb workshop / garden dusk* — warm cream UI, **teal & coral** tiles (not the reference's lime green), a small original mascot (e.g. a **firefly or snail**, not a bee).
- Tiles: soft 3D hex, 4 px visible thickness, inner number badge, subtle bevel; given tiles darker with tiny pin icon.
- Empty cells: recessed hexes with inner shadow.
- Obstacles: chapter-themed (pond with lilies, rock, mushroom, snow patch).
- Connectors: rounded bars that "grow" in with a squash animation.
- Palette (draft): bg `#F7F1E6`, panel `#FFFDF8`, tile `#2FB8A8`, tile-dark `#147D72`, given `#F2994A`, accent coral `#EF6F6C`, water `#7ED3E8`, text `#3C3226`.
- Typeface: rounded geometric sans (Fredoka / Baloo 2), numerals tabular and ≥ 20 px on-device.
- Colour-blind mode: number-parity tint + pattern on givens; high contrast option.
- Chapters change palette/background (day meadow, dusk pond, night garden, snow).

## 9. Audio
- Music: 2–3 low-key acoustic/ambient loops, ducking on win.
- SFX: soft "pop" snap with pitch rising along the chain (n-th consecutive placement), muted "thud" on mistake, chime on chain link, flourish on level complete, UI taps.
- Volume sliders, silent-mode respected.

## 10. UX flows & screens
1. **Splash → Home** (Play / Daily / Settings / chapter map).
2. **Level map** (vertical scrolling garden path with level nodes, locked/unlocked, stars optional).
3. **Gameplay** (top bar, hearts or timer, board, tray, tool buttons, banner).
4. **Win panel**: mini board art, "Next", optional reward x2 ad, daily streak update.
5. **Fail panel**: Retry / Revive (ad).
6. **Daily calendar**, **Settings**, **Shop/Remove Ads**, **Tutorial overlays**, **Consent**.
Layout is thumb-friendly: tray and tools in bottom 40% of screen; safe-area aware; 9:16 → 9:21 supported.

## 11. Onboarding
- Level 1 (7 cells): tap number → place; mascot text "Every number connects to the next".
- Level 2: introduces chains in tray. Level 3: blocked cells. Level 4: hearts & mistakes. Level 5: hint/Find. Skippable after first completion.

## 12. Technical design
- **Engine:** Unity 6 (2D URP, C#), portrait. Alternatives: Godot 4 or web/Phaser if you prefer faster iteration — design is engine-agnostic.
- **Rendering:** hex cells as sprites in a pooled grid; UI via UI Toolkit or uGUI; chain pieces assembled from hex sprites + connector sprites.
- **Architecture:** `LevelData` (ScriptableObject/JSON) → `BoardModel` (pure C#, axial coordinates, validation) → `BoardView` (render) → `InputController` (drag/tap) → `GameStateMachine` (Playing/Won/Failed). Model is unit-testable without Unity.
- **Hex math:** axial coordinates, pointy-top, `x = size*√3*(q + r/2)`, `y = size*1.5*r`; hit-test by cube-round.
- **Save:** `PlayerProgress` JSON in persistent path; autosave on pause/quit.
- **Analytics:** Firebase/Unity Analytics — level_start/win/fail, hint_used, ad_shown, drop-off by level.
- **Performance:** target 60 fps on low-end Android (2 GB RAM), build size < 80 MB, cold start < 3 s; boards up to ~150 cells.
- **Testing:** solver unit tests (uniqueness), model tests (adjacency, chain derivation), device matrix for notches/aspect ratios.

## 13. Production plan
| Milestone | Scope | Duration* |
|---|---|---|
| M0 Prototype | Board, tray, drag/drop, 10 hand-made levels, validation | 2 wks |
| M1 Vertical slice | Art pass, tutorial, hearts, hints, win/fail flow, solver tool | 4 wks |
| M2 Alpha | Level generator, 60 levels, map, daily, save, settings, audio | 6 wks |
| M3 Beta | Ads/IAP, analytics, localization, perf, soft launch (2–3 countries) | 4 wks |
| M4 Launch | Polish, store listing, 100+ levels, live-ops cadence (new levels every 2 wks) | 3 wks |
*Solo/2-person team estimate.

## 14. Post-launch ideas
Rotation-allowed chains (hard mode), multi-path variants (two sequences), colour sectors, weekly events, collectible garden decor, leaderboards for daily speed, level editor + community sharing.

## 15. Risks
| Risk | Mitigation |
|---|---|
| Too close to the reference game | Own name, art, mascot, UI layout details, levels; document in `RESEARCH.md` is mechanics-only |
| Level quality / uniqueness bugs | Automated solver gate in the pipeline; CI test |
| Content volume | Generator + human curation; remote level delivery |
| Ad fatigue → churn | Frequency caps, rewarded-first design, A/B test cadence |
| Small-screen readability | Min tile size 44 dp; zoom for large boards |

## 16. Open questions (decide before M1)
1. Engine: Unity vs Godot vs Web?
2. Kids-directed (rated 3+, stricter ads) or general audience?
3. Rotation of chain pieces — MVP says fixed; confirm after playing the reference.
4. Hearts-based fail vs. unlimited mistakes with a score?
5. Offline-only at launch or add cloud save?
