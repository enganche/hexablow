# Hexablow

Hex number-path puzzle (Vite + Three.js). Place every number so each one touches the next. See [GDD.md](GDD.md) and [RESEARCH.md](RESEARCH.md).

```bash
npm install
npm run dev        # http://localhost:5173 (open in a phone-sized window)
npm run build      # production build in dist/
npm run levels     # regenerate src/levels.json (solver-verified unique solutions)
```

## How to play
- Drag a piece from the bottom tray onto the board (or tap a piece, then tap a cell). The piece's **first number** lands on the cell you target.
- A wrong placement costs a heart; 3 hearts per level. Dropping on an occupied/blocked cell just bounces back.
- Settings (gear): Sound, Music, Vibration, Notifications, Hints. Hints highlights cells where the selected piece is consistent with neighbours already placed (off by default).

## Layout
- `src/game.js` — Three.js scene, layout, input, placement/hearts logic
- `src/hex.js` — axial hex math (shared with the level script)
- `src/levels.json` — 5 levels (generated)
- `scripts/generate-levels.mjs` — path generator + uniqueness solver
- `src/audio.js` — WebAudio synth for SFX/music (no assets)
- `src/main.js`, `src/style.css`, `index.html` — HUD, settings, result card
