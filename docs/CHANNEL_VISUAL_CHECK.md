# Channel visual check

**Purpose:** See sloping 1-2-3 parallel rails (not flat S/R) so channel math can be audited by eye. Offline / cache-only — no live trading.

**Branch context:** geometry P0 (reject inverted rails + chart overlays) lives on `cursor/kurisko-channel-fix-fd61`. This verifier regenerates pictures under `artifacts/kurisko/channels/`.

---

## How to regenerate

```bash
# Needs cached Capital 1m under data/kurisko/capital/{GOLD,US100}_1m.json
npm run k1:channel-visual
# or:
npm run k1:channel-visual -- --symbol GOLD,US100 --windows 3 --days 28
npm run k1:channel-visual -- --no-png   # HTML/SVG only
```

Requires Python `matplotlib` for PNGs (`pip install matplotlib`). HTML always writes.

**Unit smoke (no pictures):** `npm run k1:channel-test`

---

## Where to look

| Path | What |
|------|------|
| `artifacts/kurisko/channels/index.html` | Gallery entry |
| `artifacts/kurisko/channels/GOLD_index.html` / `US100_index.html` | Per-symbol links |
| `artifacts/kurisko/channels/*.html` | Interactive SVG overlay (open in browser) |
| `artifacts/kurisko/channels/*.png` | Static samples (a few committed for PR review) |
| `artifacts/kurisko/channels/summary.json` | Episode counts + geometry audit tallies |

HTML/JSON are gitignored (regenerate locally). Sample **PNGs** may be committed for review.

### Committed sample PNGs (open these first)

- `artifacts/kurisko/channels/GOLD_01_2026-09-04-14-00_down.png` — descending: P1/P3 on **upper** (yellow), P2 on **lower** (cyan)
- `artifacts/kurisko/channels/GOLD_03_2026-09-04-15-50_up.png` — ascending: P1/P3 on **lower**, P2 on **upper**
- `artifacts/kurisko/channels/US100_01_2026-09-04-18-10_down.png` — US100 descending sample
- `artifacts/kurisko/channels/US100_03_2026-09-03-16-45_up.png` — US100 ascending sample

Filenames include confirm time + `up`/`down`. Re-running the script refreshes names; keep docs in sync or open `index.html`.

---

## What “good” looks like

1. **Sloping** yellow upper + cyan lower + dashed mid — **not** three horizontal lines across the window.
2. **Parallel** rails (constant width); mid exactly between them.
3. **Orientation:** cyan **below** yellow everywhere on the segment.
4. **Pivots on bodies:**
   - **Down:** P1 & P3 = body swing highs on the upper rail; P2 = body swing low on the lower rail.
   - **Up:** P1 & P3 on lower; P2 on upper.
5. **Lock:** vertical “lock” marker at P3 confirm; rails keep the **same** slope forward until hard break (no redraw chasing spikes).
6. Badge on HTML should say **PASS geometry** (body pivots + parallel rebuild + lower &lt; upper).

### Fail cues (still reportable)

| Visual | Meaning |
|--------|---------|
| Rails cross / cyan above yellow | Inverted geometry (should be rejected by engine — file a bug if pictured) |
| Flat horizontals only | Looking at old keyLevels UI, not this overlay / Live Charts sloping path |
| P3 floating mid-channel | Wrong pivot or wrong rail clone |
| Rails jump after every wick | Lock/redraw broken vs video rule |

---

## Geometry recheck vs RAG / video (this run)

| Check | Status |
|-------|--------|
| Body pivots (not wicks) for 1-2-3 | Pass on audited episodes (`summary.json` `bodyPivots`) |
| Parallel clone | Pass (`parallel` rebuild matches episode rails) |
| `lower < upper` | Pass (`geometryFails: 0` on GOLD+US100 ~28d slice) |
| Lock without chase while active | Implemented in `buildChannelEpisodes` (visual: same slope past lock) |
| Slope 15°–40° (`channelValidDown`/`Up`) | **Gate only for K1_E1** — many locked episodes are flatter; samples prefer slope-ok windows |

**Remaining doubt (not a P0 cross/invert bug):** the `%/hour → atan` slope proxy is chart-scale dependent. Many valid-looking shallow channels fail the 15–40 band, so K1 trades a steep subset. Selection is still score-greedy (no “prior extreme → new P1 after break” seeding from the video). Those are P1 research items, not “rails are crossed.”

Diagnosis write-up: `docs/CHANNEL_GEOMETRY_DIAGNOSIS.md`.
