# Channel geometry diagnosis

**Date:** 2026-09-07  
**Branch:** `cursor/kurisko-k1-event-backtest-fd61`  
**Scope:** Read-only investigation of 1-2-3 parallel channel geometry vs video extract / RAG. No large fix in this change.

**Verdict:** The user’s hypothesis is **plausible and well-supported**. The engine does not reliably *draw* a Kurisko channel (UI flattens rails; chart overlay path is dead), and the geometry selector can emit **crossed / inverted rails** that still pass `channelValidDown`. That alone can poison rail touches, divergence-at-rail, mid TP, and K1 backtests.

---

## Spec references (what “correct” means)

| Source | Rule |
|--------|------|
| `docs/KURISKO_VIDEO_EXTRACT.md` | Pivots from **bodies** (not wicks); lock 1-2-3; **parallel** clone to opposite pivot; **do not redraw** to chase blowouts; settle > wick extreme |
| `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` § CHANNEL GEOMETRY | Structure on **5m**; 1-2-3 → parallel upper/lower; `CHANNEL_SLOPE_OK` 15°–40°; width gates; trade rails on **1m** |

---

## Top bugs (severity-ordered)

### 1. UI cannot draw a sloping parallel channel — **P0 (visual) / explains “cannot really draw”**

Live charts only plot **horizontal** key levels at the *current* upper/mid/lower price, stretched across the whole window:

```111:134:src/features/kurisko/qr-pro/QrProMiniChart.tsx
    if (keyLevels) {
      const last = bars[bars.length - 1]!;
      const first = bars[0]!;
      const t0 = toTime(first.t);
      const t1 = toTime(last.t);
      const levels: { value: number; color: string }[] = [
        { value: keyLevels.upper, color: "#fde04788" },
        { value: keyLevels.mid, color: "#94a3b866" },
        { value: keyLevels.lower, color: "#22d3ee88" },
      ];
      for (const lvl of levels) {
        // ...
        line.setData([
          { time: t0, value: lvl.value },
          { time: t1, value: lvl.value },
        ]);
```

Snapshot feeds those scalars from a single timestamp (`build-snapshot.ts` ~94–100), discarding slope.

Serializable sloping overlays exist (`KuriskoChannelEpisodeDraw`, `episodesForChart`) but **nothing calls them** — only definitions in `channel-episodes.ts` / `chart-window-types.ts`. No `KuriskoChartWindow` builder is wired.

**Impact:** Manual audit vs video is impossible; “channel on chart” looks like flat S/R, not 1-2-3 rails.

---

### 2. No “lower rail below upper rail” invariant — **P0 (geometry)**

`findDescending123` / `findAscending123` never require the parallel clone to sit on the correct side of the reference rail. Only `p2.price < p1.price` (down) / `>` (up) is checked (`channel-geometry.ts` ~177–178, ~211–212).

**Reproduced:** hand-built pivots P1=100 → P2=99.3 → P3=98 over 4h yields:

- `upperAt(P2) = 99`, `lowerAt(P2) = 99.3` → **inverted** (width negative)
- `slopeDeg ≈ -26.8` → **`channelValidDown` = true**

So K1_E1 can pass on a non-drawable / crossed “channel.” Longs then use `lowerAt` (the higher line) for rail/div/mid.

`channelFitsCandle` masks this by using `max(upper,lower)` / `min(...)` (`channel-episodes.ts` ~77–80), so inverted episodes can still lock.

---

### 3. Slope gate uses `atan(%/hour)` — brittle vs visual 15°–40° — **P1**

```146:154:src/lib/kurisko/indicators/channel-geometry.ts
function slopeDeg(...): number {
  // ...
  const pctPerHour = ((p2 - p1) / mid) * 100 / hours;
  return (Math.atan(pctPerHour) * 180) / Math.PI;
}
```

Pass band ≈ **0.3%–0.8% per hour**. On ES≈5800 that is ~20–45 pts/hour; quieter structure fails low; short violent 1-2-3s fail high. Scoring prefers **short** spans (`PREFERRED_CHANNEL_SPAN_BARS = 25`, recency weight on P3 — ~237–253), which inflates `%/hour` and fights the gate.

Episodes **lock without** `CHANNEL_SLOPE_OK`; only `channelValidDown`/`Up` apply it later. Snapshot `channelValid` uses episode `valid`, not slope (`build-snapshot.ts` ~112) → UI “valid” ≠ K1_E1.

---

### 4. 1-2-3 selection is score-greedy, not “lock + don’t chase” — **P1**

While an episode is active, rails stay fixed (`channel-episodes.ts` ~250–252) — good vs video redraw rule.

On lock / re-lock, `buildChannelFromPivots` always takes the **max score** recent H-L-H / L-H-L (`channel-geometry.ts` ~328–335). Missing vs video/RAG:

- After break, **prior channel extreme as new P1** (video extract rule 3)
- Optional **P4** lower low for the parallel rail (RAG; comment at geometry ~159 claims it, code does not)
- Touch-count / width-stability / “≥4–5 touches” strength
- Explicit reject of blowout pivots beyond canceling-pair heuristic

Hard-break is body-based with flush grace (`channel-episodes.ts` ~125–168) — directionally video-aligned — but re-lock immediately calls the same greedy picker (`~242–248`).

---

### 5. Dual body high+low on the same bar — **P2**

`collectStructurePivots` can emit both kinds at one index (`channel-geometry.ts` ~114–121). Same-bar H/L is excluded from 1-2-3 by `p1.i >= p2.i`, but it still pollutes scoring neighborhoods and does not match a clean swing series.

Body pivots themselves **match the video** (RAG’s swing snippet still says `high[]`/`low[]` wicks — code correctly prefers bodies for channels).

---

### 6. Dual-TF wiring is mostly correct; gaps still matter — **P2**

- Canonical pair is `1m+5m` (`timeframes.ts` ~13–19); K1 engine defaults structure to 5m (`k1-event-engine.ts` ~36–43). **No systematic 5m-vs-1m structure swap.**
- `channelAtTime` only returns an episode active at `ts` (`dual-tf-context.ts` ~82–97). Bars in gaps (between episodes / before first lock) get `valid: false` even if a static `buildChannelFromStructure` would invent lines — correct for lock semantics, but empty geometry when `channelFitsCandle` rejects candidates (`channel-episodes.ts` ~76–93, ~199).
- `1m-only` scales pivot left/right ×5; `5m+15m` does **not** widen bar counts for longer structure bars (`timeframeScaledOptions` ~47–54) — experimental TF pairs drift from 5m wall-clock intent.

---

## What is *not* the main bug

| Area | Status |
|------|--------|
| Body vs wick for **channel pivots** | Aligned with video (`bodyHigh`/`bodyLow`) |
| Parallel clone math when P2 is on the correct side | `lineThrough` + `parallelThrough` is fine |
| Episode forward extension without redraw while locked | Implemented |
| Canceling / flush grace vs wick blowouts | Partially implemented (body break + canceling pair) |
| Exec 1m vs structure 5m plumbing | Canonical path OK |

Divergence rail interaction prefers body with wick fallback (`divergence.ts` ~11–28) — acceptable; unused `findSwingLows` still wick-based (~59–66) but K1 path does not use it.

---

## Link to K1 backtest weakness

`docs/K1_BACKTEST.md` shows the funnel is alive (many `channelValidDown` bars) but realized trades are ~break-even to losing. That fits **wrong or flat geometry** better than “no channel ever”:

1. Crossed rails → bogus `atLowerRail` / mid TP / stop geometry.
2. Slope/scoring mismatch → trades only on atypical steep micro-channels.
3. No visual overlay → cannot catch (1)–(2) in research UI.

Hypothesis: **yes — channel implementation cannot really draw (and sometimes cannot even form) a Kurisko channel; that is a credible root cause class for K1 failure.**

---

## Suggested fix order (for peer — not done here)

1. Reject candidates where `lowerAt(t) >= upperAt(t)` for any t in [P1,P3] (or at P2); add unit tests including the mild-inversion case above.
2. Wire `episodesForChart` → chart series (sloping upper/lower + P1/P2/P3 markers); stop drawing horizontal keyLevels as “the channel.”
3. Revisit slope normalization vs span scoring so preferred 1-2-3s are the ones that pass a stable `CHANNEL_SLOPE_OK`.
4. On hard break, seed next P1 from prior episode extreme; keep lock; avoid immediate greedy re-pick of noise.
5. Align snapshot `channelValid` with `channelValidDown`/`Up` (or expose both).

No live trading changes in this diagnosis.
