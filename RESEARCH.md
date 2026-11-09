# HexaDoku (package `com.goodjobgames.hexnumbers`) — Research for a Clone

Sources: Google Play listing (text + 6 store images), YouTube "hexadoku level 1 to 10" (12:24, sampled at ~8 timestamps; no captions, no audio reviewed).
**Confidence key:** [S] = stated in store text, [V] = directly seen in image/video, [I] = my inference (verify before relying on it).

---
## 1. Overview
| Item | Value |
|---|---|
| Name | HexaDoku (listed as "Hexadoku") |
| Developer | Serkan Özyılmaz [S] |
| Genre | Puzzle — "Number Logic Puzzle" [S] |
| Installs | 100K+ [S] |
| Monetization | Contains ads [S]; banner ad at bottom of play screen [V]; Play data-safety says Device IDs shared w/ third parties (ad SDK) [S] |
| Rating | Rated for 3+ [S] |
| Last update | Oct 23, 2026 [S] |
| Theme | "Cozy garden": cream background, green leafy hex tiles, lily pond, cute bee mascot [S][V] |
| Players | Single-player, offline-capable ("Play anytime, anywhere") [S] |

Store pitch [S]: "Fill the board by placing missing numbers so every consecutive number connects to the next. Every puzzle has one unique solution." Features: hundreds of handcrafted levels, Daily Challenge (new puzzle each day), no time limit (in normal levels), smooth controls.

## 2. Core rules (what the game is)
A **Hidamari/Hidato-style** puzzle on a hex grid:
1. Board = a set of hexagonal cells (hex-shaped outline, sometimes with holes). Some cells are **pre-filled givens** (bold numbers, e.g. 1, 3, 6, 8, 15 on Level 2). [V]
2. Remaining numbers are supplied in a **tray** below the board. [V]
3. Player must place every tray number so the whole sequence 1…N forms a path where **each number n is on a cell adjacent (6-neighbour) to n+1**. Tutorial text: "Every number connects to the next." and "All cells in the grid must be filled." [V]
4. Exactly **one valid solution** per level [S]. Levels where every cell is a number: N = number of playable cells (Level 2: 19 cells, numbers 1–19). [V]
5. Playable cells vs. **blocked cells** (the turquoise pond with lily pad is an obstacle, no number goes there). [V]
6. When two consecutive numbers are adjacent, a **connector bar** is drawn between them (visible between 5–6, 17–18, 18–19, 27–28 etc.). [V]

## 3. UI / screens (from store images + video)
**Gameplay screen** (portrait):
- Top bar: back arrow (left), title centered ("Level 2", "Level 5", "Level 15 | Hard" in red, or date e.g. "September 23" for daily), settings gear (right). [V]
- Below title: **3 hearts** (lives) on normal levels from ~Level 5; **timer pill** (⏱ 3:33, counts up) on Daily Challenge instead of hearts. Level 2 shows neither (tutorial/early levels). [V]
- Board area: cream panel, empty cells = white rounded hexes with soft beige border; filled = green hex w/ darker inner ring and white number; givens bold/ slightly different. [V]
- Tray area (white panel under board): horizontally **scrollable** list of remaining numbers. Consecutive numbers that must stay together are shown **as pre-joined chunks** (e.g. 9-11 diagonal pair, 48-49-50 chain, 35-36, 13-14) — you drag a chain as one multi-hex piece. Singletons are single hexes. [V]
- Bottom-left: **hint (lightbulb)** button with count badge; bottom-right: **magnifier** button with badge (likely "find/highlight position" helper). [V][I]
- Bottom: banner ad. [V]
- Orange curved footer in store art is marketing only.

**Other screens (inferred from store art/tags):** level select/map or "Level N" progression, Daily Challenge calendar (dates like "September 15/23" suggest a calendar of past dailies), Settings (gear). Verify in the real app: sound/music/vibration toggles, remove-ads, privacy.

**Level 1–10 progression seen in video** [V]:
- Tutorial overlay with bee mascot in a speech bubble at the top ("Every number connects to the next", "All cells in the grid must be filled").
- Tutorial pieces in the tray are **orange** hexes before placing; once placed on the board they turn green. Selected/target cell shows a **blue outline**; a tapped number can show a grey/brown tint.
- Grids grow: 7 cells (≈L1) → 19 cells (L2) → hex shapes with lake obstacles (L5, L10) → 61+ cells at Level 15 "Hard" → 100+ cells in Daily puzzles (e.g. 111 numbers). Hard levels are labelled in red.
- Puzzle numbers bigger in size on early levels, small (tiny digits) on dense boards.

## 4. Interaction model [I — confirm by playing]
- Drag a tray piece onto an empty cell (or tap tray piece then tap cell). Multi-hex chain pieces drop as a unit with fixed relative orientation (may allow rotation? unknown).
- Wrong placement (violates a unique solution / adjacency) → lose a heart; 0 hearts = fail/retry. Hints cost a hint charge (probably earned via rewarded ads).
- Placing correctly snaps, draws connector bars, plays a sound/haptic. Level complete → win panel (stars? coins? unknown) → next level.

## 5. Visual style guide (sampled by eye)
- Background cream `#F3EAD8`-ish, panel lighter `#FBF6EC`, footer orange `#F5A623`-ish gradient with faint honeycomb pattern.
- Tiles: lime/leaf green `#6BB01F` face, darker `#3E7A0E` inner circle for digits, glossy rounded hexagon with slight thickness/shadow. Empty cells: white with soft shadow.
- Water: turquoise `#19C5D6` with light ripple lines; lily pad + pink lotus decor. Bee mascot (yellow/black, big brown eyes) for icon/tutorial.
- Icon: purple hexes with 1-2-3 plus the bee.
- Typography: rounded bold sans (looks like Lilita One / Fredoka style) for store captions; in-game numbers white bold.
- (Colours are estimates; sample the PNGs in your own copy to get exact values.)

## 6. Level / content structure
- "Hundreds" of handcrafted levels [S] — implies a fixed level list (not procedural), difficulty tags (Normal/Hard) [V].
- Daily Challenge [S]: date-seeded puzzle, large board, with a timer; past dates listed [V][I].
- New levels shipped via updates ("Fresh new levels have blossomed") [S] → clone should load levels from JSON so you can append.

## 7. Suggested clone design (my recommendation)
**Level data format (JSON):**
```json
{ "id": 2, "difficulty": "normal",
  "cells": [[q,r], ...],          // playable axial hex coords
  "blocked": [[q,r], ...],        // decorative water cells
  "givens": {"1":[q,r], "3":[q,r]},   // number -> cell
  "solution": {"1":[q,r], ... "19":[q,r]} }
```
- Use **axial coords**, neighbours `(±1,0),(0,±1),(+1,-1),(-1,+1)`. Render pointy-top hexes (as in screenshots the hexes have a vertical flat-side layout — verify; the images look flat-side-left/right i.e. pointy-top).
- **Tray chunks:** derive from solution — group consecutive numbers whose neighbours are not given into runs; shuffle chunks. A chunk's shape is the solution polyline, so only one placement fits.
- **Validation:** accept a placement iff it matches `solution` (cheap, guarantees uniqueness) or check adjacency rules + unique-solver for custom levels.
- **Level generator** (to scale content): random Hamiltonian path on a hex region via backtracking/Warnsdorff; pick givens so a solver finds exactly one solution (solver counts solutions, stop at 2); add pond obstacles by removing cell clusters before path generation.
- **Systems:** hearts (3), hints (consume charge; reward by ad), timer for daily, daily seed = date, progress saved locally (localStorage / PlayerPrefs), settings (sound, haptics), banner + rewarded ads, optional remove-ads IAP.
- **Tech options:** Unity (2D, UI), Godot, or web (Canvas/Phaser/React + SVG). For a quick MVP: web + SVG hexes, drag & drop via pointer events.

## 8. Gaps / what I could not verify
- Video has no captions; I sampled frames (at 296×640 source res) — I did **not** hear audio or watch all 12 minutes frame-by-frame, so exact win animations, win screen, hint behaviour, and sound design are unknown.
- The Play page gave no star rating, review text, or IAP list (not rendered), and I could not see the Play-store promo video.
- Exact chain-piece rotation rules, what the magnifier does, heart-loss rules, ad cadence → please install the app and play ~10 levels, or have me re-watch specific timestamps.
- Legal note: mimic the *mechanic* (a Hidato-style puzzle, a well-known genre) but create your **own art, name, mascot, icon, and level set**. Don't copy the bee, icon, store art, or their handcrafted levels.

## 9. Reference links
- Play Store: https://play.google.com/store/apps/details?id=com.goodjobgames.hexnumbers
- Video (levels 1–10): https://www.youtube.com/watch?v=KqfXshVL1R0
- Similar games listed on Play: Nonogram Crossing, Scalak, KAMI 2, Queens Battle, Shadowmatic
