# John Kurisko — Quad Rotation & Stochastic Scalping
## 3 Setups: Fully Quantified RAG Reference
### For Algorithmic Trading & Bot Development

> **Document Purpose:** Machine-readable, quantified rules consolidated from John Kurisko's teaching materials (2 advanced stochastic videos, 1 scalping-setups video summary, and references to the *Desire to Trade* PDF template). Intended for backtest engines, forward-test bots, and RAG-based agents — same role as `Andrew_Aziz_DayTrading_9Strategies_RAG v2.md`.
>
> **Author / Trader:** John Kurisko (a.k.a. John Kisco / John Krusko in transcripts) — DayTradingRadio, trading since ~1996, ~27 years experience at time of recordings.
>
> **Claimed performance (NOT independently verified):** ~90–98% win rate on “Holy Grail” / Quad Divergence setups when rules followed; ~95% in one podcast. **Bots MUST validate OOS — treat claims as marketing until backtested.**
>
> **Primary instruments (author):** U.S. equity index **futures** — Micro E-mini S&P 500 (**MES**), E-mini S&P (**ES**). Also applied to Bitcoin, gold, forex in later teaching.
>
> **METS / Capital.com scope:** CFDs on indices (US500, SPY proxy), **BTC/USD**, **ETH/USD**, metals — adapt tick size, session hours, and stop distance from ticks to %.
>
> **Core methodology (non-negotiable for bot implementation):**
> 1. **Channel geometry** — 1-2-3 pivot parallel channels define *where* trades are allowed.
> 2. **Dual timeframe** — **5-minute** = structure/context; **1-minute** = execution/trigger.
> 3. **Quad stochastic** — **four** stochastic bands on **each** timeframe, evaluated together (not a single stoch).
>
> **Version:** July 2026 | Sources: `Advanced Stochastic.docx`, `Advanced Stochastic2.docx`, `extract detail content and trading strategy from....docx`, `John-Kurisko-Trading-Template_Desire_to_Trade.pdf` (PDF is image-based; rules below are from video summaries + template references).

---

## THE THREE PILLARS (read before any strategy section)

John Kurisko's edge is **not** “stochastic oversold → buy.” It is the **intersection** of:

```
┌─────────────────────────────────────────────────────────────────┐
│  PILLAR 1 — CHANNEL GEOMETRY (WHERE)                            │
│  1-2-3 pivot sequence → parallel trend channel                  │
│  Trades only at channel boundary / midline / breakout           │
├─────────────────────────────────────────────────────────────────┤
│  PILLAR 2 — DUAL TIMEFRAME (WHICH LENS)                        │
│  5m: channel draw, trend leg, quad “permission”                 │
│  1m: divergence hook, entry bar, stop tick, scalp exit          │
├─────────────────────────────────────────────────────────────────┤
│  PILLAR 3 — QUAD STOCHASTIC (WHEN)                              │
│  Four stochastics per chart: 9,3 · 14,3 · 34,3 · 60,10          │
│  Quad rotation = all 4 < 20 (oversold) or all 4 > 80 (OB)     │
│  Compute independently on 1m bars AND on 5m bars                │
└─────────────────────────────────────────────────────────────────┘
```

**Bot rule:** If channel geometry is invalid or undefined → **NO TRADE**, even if one stochastic is oversold.

**Author quote (paraphrased):** Algorithms react to channel lines; the “Holy Grail” is **quad rotation + divergence at the channel rail**, not divergence alone.

---

## SOURCE CONSOLIDATION NOTES

| Source | Content captured |
|--------|------------------|
| Video 1 — Advanced Stochastic | Quad Rotation, Holy Grail, 2020 Bull Flag, psychology, NinjaTrader template |
| Video 2 — Advanced Stochastic 2 | Channel/pivot structure, entry/stop/exit table, flags vs divergences, alerts, lifestyle discipline |
| Video 3 — 3 Scalping Setups | Full RAG flowchart, quantified K1/K2/K3, autonomous decision tree |
| PDF template | **No extractable text** (scanned slides). Indicator list and layout assumed aligned with video template table below. |

**Spelling variants in transcripts:** Kurisko / Kisco / Krusko — same trader.

**Stochastic period variance:** Videos cite **9,3 · 14,3 · 34,4 · 60,10** (video 3) and **9,3 · 14,3 · 44,3 · 60,10** (video 2). Implement **9,3 / 14,3 / 34,3 / 60,10** as default on **both 1m and 5m**; expose `STOCH_LONG_PERIOD` as tunable (34 vs 44).

---

## DUAL TIMEFRAME ARCHITECTURE (1m + 5m)

### Role split

| Layer | Timeframe | Responsibilities |
|-------|-----------|------------------|
| **Structure** | **5m** | Identify 1-2-3 pivots; draw parallel channel; measure slope (20°–35°); confirm trend leg; **5m quad rotation** at channel rail |
| **Execution** | **1m** | Fine divergence (9,3 vs price); hook entry; stop 1–2 ticks beyond pattern low/high; exit when **1m** 9,3 hits 80 (long) or 20 (short) |
| **Alignment** | Both | High-probability (“super signal”) when **5m channel valid** AND **1m quad + divergence** fire at/near the **same channel boundary** |

### Data requirements (METS / Capital.com)

```
FETCH:
  candles_1m  — primary simulation loop (every bar)
  candles_5m  — aggregate from 1m OR separate API fetch (must align timestamps)

ON EACH 1m BAR CLOSE:
  1. Update 1m indicators (4 stochs, EMAs, VWAP)
  2. Map current time to active 5m bar (floor timestamp to 5m boundary)
  3. Update 5m indicators only on 5m bar close (no lookahead)
  4. Recompute channel geometry from 5m pivots (see below)
  5. Evaluate confluence: channel + 5m quad + 1m quad + divergence
```

### 5m ↔ 1m stochastic mapping (author teaching)

| Stochastic | On **1m** chart | On **5m** chart | Notes |
|------------|-----------------|-----------------|-------|
| 9,3 | Immediate execution / hook | Short-term momentum within 5m leg | **Entry trigger** uses **1m** 9,3 |
| 14,3 | Intermediate filter | Same role, slower | Must align for quad |
| 34,3 | Deep structure | Swing within channel | Quad member |
| 60,10 | ~“5m feel” on 1m tape | Macro momentum on true 5m | **Embedded trend** (pinned >80 or <20) |

**Important:** `60,10` on 1m is **not** a substitute for a **5m chart**. Bots must run **both** resolutions. Best practice: require **5m quad rotation** (or 5m embedded state) **and** **1m quad + divergence** for K1 entries.

### Dual-TF confluence levels

| Level | Condition | Use |
|-------|-----------|-----|
| `TF_WEAK` | 1m quad only | Watchlist — no entry |
| `TF_GOOD` | 1m quad + 1m divergence at 5m channel line | Paper trade / reduced size |
| `TF_SUPER` | 5m `CHANNEL_VALID` + 5m quad OS/OB + 1m quad OS/OB + 1m divergence at rail | Full size “Holy Grail” |

---

## GLOBAL PARAMETERS (Apply to ALL Kurisko Setups)

### Philosophy & Operating Constraints

| Parameter | Rule | Notes |
|-----------|------|-------|
| `TRADING_MODE` | Business plan, not discretion | Flowchart-defined entries/exits; no “feel” trades |
| `MAX_SETUPS_PER_DAY` | 3–7 (author); 1–2 “super signals” | “Less is more” — wait for convergence |
| `OVERTRADING` | Forbidden | Majority of losses from impatience |
| `COUNTER_INTUITIVE_RULE` | Buy weakness, sell strength | Enter on fear (oversold/divergence); exit into strength (stoch > 80) |
| `PART_TIME_TRADING` | Discouraged | Setups are infrequent; must be present at screen |
| `PERFECT_PRACTICE` | Required | Breaking stops or rules invalidates edge |

### Account Risk Management (author + METS defaults)

| Parameter | Value | Notes |
|-----------|-------|-------|
| `MAX_RISK_PER_TRADE` | 0.5–1% (MES scalping) | Author uses 1–3 micro contracts |
| `MAX_DAILY_LOSS` | 3–4% | Stop session |
| `POSITION_SIZE` | `RISK_AMOUNT / (ENTRY - STOP)` | Scale MES → CFD notional |
| `MIN_RISK_REWARD` | ≥ 1.5:1 (scalps); author often risks 1–2 ticks | Tight stops; small targets (3–5 ES points cited) |
| `TYPICAL_HOLD_MINUTES` | ~5 minutes | Scalp, not swing |

### Session & Liquidity (futures-native → Capital.com)

| Session | Time (ET) | Notes |
|---------|-----------|-------|
| U.S. RTH open | 09:30–11:30 | Highest opportunity density |
| Midday | 11:30–14:00 | Reduce size or skip (chop) |
| Afternoon | 14:00–15:30 | Continuation flags |
| European / overnight | Per author preference | “Cleaner” channels, less news (video 2) |
| **Crypto 24/7** | Use rolling 24h or US session overlay | Map “open drive” to 09:30–11:30 ET for BTC/USD if correlating with equities |

### Chart Template (NinjaTrader / TradingView equivalent)

**Maintain two synced charts (or one chart + hidden 5m series):**

```
CHART_5M (structure):
  EMA_20, EMA_50, EMA_200
  VWAP (session)
  PIVOT_POINTS
  CHANNEL_UPPER, CHANNEL_LOWER, CHANNEL_MID  — from geometry engine
  STOCH_9_3, STOCH_14_3, STOCH_34_3, STOCH_60_10  — quad pane

CHART_1M (execution):
  Same EMAs + VWAP + channel lines projected from 5m
  Same four stochastics (independent calculation on 1m bars)
  ORANGE_LINES — prior day H/L, premarket H/L, round numbers
```

### Quad Stochastic Stack (four bands — both timeframes)

John’s “Quad Rotation” = **four simultaneous stochastic oscillators** in one pane, **not** one stoch with four lines of code commented out.

```
PARAMS (identical on 1m and 5m):
  STOCH_A = Stochastic(period=9,  smooth=3)   # fast
  STOCH_B = Stochastic(period=14, smooth=3)   # medium
  STOCH_C = Stochastic(period=34, smooth=3)   # long [alt: 44,3]
  STOCH_D = Stochastic(period=60, smooth=10)  # macro / slow

THRESHOLDS:
  OVERSOLD   = 20
  OVERBOUGHT = 80
  EMBEDDED_BULL_ZONE = STOCH_D >= 85   # pinned near top
  EMBEDDED_BEAR_ZONE = STOCH_D <= 15   # pinned near bottom

QUAD_OVERSOLD(tf) =
  STOCH_A(tf) < 20 AND STOCH_B(tf) < 20 AND STOCH_C(tf) < 20 AND STOCH_D(tf) < 20

QUAD_OVERBOUGHT(tf) =
  STOCH_A(tf) > 80 AND STOCH_B(tf) > 80 AND STOCH_C(tf) > 80 AND STOCH_D(tf) > 80

QUAD_ROTATION_EVENT(tf) =
  QUAD_OVERSOLD(tf) became true this bar (all four crossed into OS together)
  OR QUAD_OVERBOUGHT(tf) became true this bar

EMBEDDED_BULL(tf) = STOCH_D(tf) > 80 for >= EMBED_BARS consecutive (default 3 on 5m, 5 on 1m)
EMBEDDED_BEAR(tf) = STOCH_D(tf) < 20 for >= EMBED_BARS consecutive
```

### Stochastic formula

```
STOCH_VALUE = 100 * (CLOSE - LOWEST_LOW(n)) / (HIGHEST_HIGH(n) - LOWEST_LOW(n))
%K_smooth = SMA(%K_raw, smooth)   # match Ninja/TradingView Stoch setting

Compute separately for each (period, smooth) pair → four series per timeframe.
```

### Divergence (price vs **1m** STOCH_A only)

```
BULLISH_DIVERGENCE (1m, at channel lower rail):
  price_low_2 < price_low_1   (lower low or equal double bottom)
  AND stoch_a_1m_low_2 > stoch_a_1m_low_1   (higher low on 9,3)
  AND stoch_a_1m_low_2 >= 20
  AND distance(price, CHANNEL_LOWER_5m) <= CHANNEL_TOUCH_TOLERANCE

BEARISH_DIVERGENCE (1m, at channel upper rail):
  price_high_2 > price_high_1
  AND stoch_a_1m_high_2 < stoch_a_1m_high_1
  AND stoch_a_1m_high_2 <= 80
  AND distance(price, CHANNEL_UPPER_5m) <= CHANNEL_TOUCH_TOLERANCE
```

---

## CHANNEL GEOMETRY ENGINE (PILLAR 1 — full spec)

Channel identification is the **primary** trade filter. Kurisko builds a **1-2-3 pivot channel** on the **5-minute** chart, then trades reactions at the parallel rails on **1-minute**.

### Step 1 — Swing pivot detection (5m)

```
SWING_HIGH at bar i when:
  high[i] > high[i-1] AND high[i] > high[i+1]
  AND (optional) high[i] == highest(high, i-LEFT, i+RIGHT) with LEFT=RIGHT=2

SWING_LOW at bar i when:
  low[i] < low[i-1] AND low[i] < low[i+1]
  AND (optional) low[i] == lowest(low, i-LEFT, i+RIGHT)

MIN_BARS_BETWEEN_PIVOTS = 3   # 5m bars (15 minutes)
MAX_PIVOT_AGE_BARS = 60       # discard channels older than ~5 hours on 5m
```

### Step 2 — 1-2-3 pivot sequence

**Descending channel (bullish K1 long environment):**

```
P1 = swing high (start of down-leg)
P2 = swing low  (first push down)
P3 = lower high (failed rally — lower high than P1)
Optional P4 = lower low (extends channel)

Valid 1-2-3 DOWN-CHANNEL when:
  high(P3) < high(P1)
  low(P2) < low(P1) or subsequent low P4 < low(P2)
  At least 3 pivot points connectable with trend structure
```

**Ascending channel (bearish K1 short environment):** mirror (higher lows, higher highs).

### Step 3 — Parallel channel lines

```
Given pivot highs H1, H2 and pivot lows L1, L2 on 5m:

UPPER_LINE: line through (t_H1, price_H1) and (t_H2, price_H2)
LOWER_LINE: parallel through (t_L1, price_L1) — same slope as upper
  OR: regression fit through all pivot highs / lows with parallel offset

CHANNEL_MID = (upper_price_at_t + lower_price_at_t) / 2 at current bar time t

SLOPE_DEG = atan((price_H2 - price_H1) / (t_H2 - t_H1)) * (180/π)
  # visual target 20°–35°; bot normalize:
CHANNEL_SLOPE_OK = abs(SLOPE_DEG) >= 15 AND abs(SLOPE_DEG) <= 40

CHANNEL_WIDTH_PCT = (upper - lower) / mid * 100
CHANNEL_WIDTH_OK = CHANNEL_WIDTH_PCT >= 0.15 AND CHANNEL_WIDTH_PCT <= 2.5  # tune per symbol
```

### Step 4 — Channel validity flags

```
CHANNEL_VALID_DOWN (for long K1) =
  CHANNEL_SLOPE_OK
  AND lower highs on upper rail (descending channel)
  AND price has touched lower rail within last TOUCH_LOOKBACK_5m bars (default 12)
  AND channel width stable (width change < 30% over last 6 bars)

CHANNEL_VALID_UP (for short K1) = mirror

CHANNEL_TOUCH_TOLERANCE =
  Futures: 2–4 ticks from rail
  CFD/crypto: 0.05%–0.12% of price

AT_LOWER_RAIL = abs(close_1m - lower_line_at_t) <= CHANNEL_TOUCH_TOLERANCE
AT_UPPER_RAIL = abs(close_1m - upper_line_at_t) <= CHANNEL_TOUCH_TOLERANCE
```

### Step 5 — Channel breakout (target / invalidation)

```
BULLISH_CHANNEL_BREAK (long target):
  1m close > upper_line_at_t + BREAK_BUFFER
  Author: ~90% of valid K1 longs eventually break upper channel

BEARISH_CHANNEL_BREAK (short target):
  1m close < lower_line_at_t - BREAK_BUFFER

CHANNEL_INVALIDATION:
  Parallel lines no longer fit (pivot violation > VIOLATION_PCT)
  OR slope flattens to horizontal chop (|SLOPE_DEG| < 8°)
  OR news spike bar range > 3× ATR_5m
```

### Channel + quad interaction (critical)

```
K1_LONG_SETUP_REQUIRES:
  CHANNEL_VALID_DOWN == true
  AT_LOWER_RAIL == true
  QUAD_OVERSOLD(5m) within last 3 five-minute bars   # structure timeframe agrees
  QUAD_OVERSOLD(1m) on trigger bar OR within last 5 one-minute bars
  BULLISH_DIVERGENCE(1m) at rail
```

Flags (K2/K3) often form **inside** a larger 5m channel or **along** a rising/falling channel midline — still require `CHANNEL_VALID` OR `EMBEDDED_BULL/BEAR on 5m` (trend channel, not reversal).

---

## STRATEGY K1 — Quad Divergence (“Holy Grail”)

**Direction:** LONG (in down-channel exhaustion) / SHORT (mirror in up-channel)  
**Win rate claimed:** ~90–95% when **channel + 5m quad + 1m quad + divergence** align (author)  
**Frequency:** ~1–2 per day  

> **This is the signature setup.** All three pillars must align. Missing channel geometry or running only one timeframe invalidates the methodology.

### Environment (ALL required — no exceptions)

| ID | Timeframe | Condition | Logic |
|----|-----------|-----------|-------|
| K1_E1 | **5m** | `CHANNEL_VALID_DOWN` or `CHANNEL_VALID_UP` | Parallel 1-2-3 pivot channel drawn and active |
| K1_E2 | **5m** | `AT_LOWER_RAIL` (long) or `AT_UPPER_RAIL` (short) | Price at channel boundary |
| K1_E3 | **5m** | `QUAD_OVERSOLD(5m)` or `QUAD_OVERBOUGHT(5m)` | All **four** stochastics on 5m chart in OS/OB |
| K1_E4 | **1m** | `QUAD_OVERSOLD(1m)` or `QUAD_OVERBOUGHT(1m)` | All **four** stochastics on 1m chart in OS/OB |
| K1_E5 | **1m** | `BULLISH_DIVERGENCE` or `BEARISH_DIVERGENCE` | 9,3 vs price at rail |
| K1_E6 | Both | `TF_SUPER` confluence | See dual-TF table above |

### Setup stages (long — 1m execution within 5m down-channel)

```
Stage 0 (5m): Channel identified; price riding lower parallel rail
Stage 1 (5m+1m): Aggressive down-leg → QUAD_OVERSOLD on BOTH 5m and 1m
Stage 2 (1m): Modest bounce; STOCH_A (9,3) hooks up briefly while still near lower rail
Stage 3 (1m): Price prints new low (or double bottom) at/below rail;
              STOCH_A forms higher low, stays >= 20
Trigger (1m): STOCH_A hooks upward — divergence confirmed
```

### Entry (LONG)

```
ENTRY = 1m trigger bar close OR next 1m open

CONFIRM (all):
  K1_E1 .. K1_E6
  QUAD_OVERSOLD(5m) true within last 3 closed 5m bars
  QUAD_OVERSOLD(1m) true within last 5 closed 1m bars
  BULLISH_DIVERGENCE(1m) at CHANNEL_LOWER_5m
```

### Stop loss

```
SL = pattern_swing_low_1m - STOP_BUFFER

Futures (MES/ES):
  STOP_BUFFER = 1–2 ticks below absolute 1m pattern low

Capital.com CFD / crypto:
  STOP_BUFFER = max(2 ticks equivalent, 0.05% of price)

Must be below 5m channel lower rail violation level
```

### Take profit / exit

```
TP1: 5m CHANNEL_MID
TP2: 5m CHANNEL_UPPER breakout (author: ~90% of valid K1 longs)
EXIT (1m): STOCH_A(1m) crosses above 80 — sell into strength
TIME_STOP: 15–20 bars on 1m without reaching TP1

INVALIDATION:
  SL hit
  5m close below channel lower rail (geometry broken)
  1m new low after entry without stoch recovery
  High-impact news spike
```

### Short mirror (K1_SHORT)

```
5m: CHANNEL_VALID_UP, AT_UPPER_RAIL, QUAD_OVERBOUGHT(5m)
1m: QUAD_OVERBOUGHT(1m), BEARISH_DIVERGENCE, STOCH_A hooks down
SL: 1–2 ticks above 1m pattern high
TP: channel mid → lower rail break
Exit: STOCH_A(1m) < 20
```

---

## STRATEGY K2 — 20/20 Bull Flag (“2020 Bull Flag”)

**Direction:** LONG only (continuation inside or with 5m up-channel)  
**Also related:** Aziz S2 Bull Flag — Kurisko adds **quad stoch + 5m embedded macro**.

### Environment (ALL required)

| ID | TF | Condition | Logic |
|----|-----|-----------|-------|
| K2_E1 | 5m | Up-channel OR strong up-leg | `CHANNEL_VALID_UP` OR price > 5m EMA_20 rising |
| K2_E2 | 5m | `EMBEDDED_BULL(5m)` | STOCH_D(5m) >= 80 pinned (85–90 ideal) |
| K2_E3 | 1m | Flagpole | ≥2 green 1m bars, steep rally off 1m EMA_20 |
| K2_E4 | 1m | Pullback | Price to 1m EMA_20; **all four** 1m stochs dip (STOCH_A toward 20) while 5m stays embedded |

### Entry

```
ENTRY when (1m bar close):
  STOCH_A(1m) <= 22 AND STOCH_A(1m) hooks up
  AND low_1m >= EMA_20(1m) * (1 - 0.0005)
  AND EMBEDDED_BULL(5m) still true   # 5m quad macro pinned
  AND price inside or above 5m channel lower rail (no channel break down)
```

### Stop / target

```
SL = min(1m pullback_low, EMA_20(1m)) - STOP_BUFFER
TP = 3–5 index points OR 5m channel upper rail
EXIT alt: STOCH_A(1m) >= 80
```

### Invalidation

```
EMBEDDED_BULL(5m) lost (STOCH_D drops below 80)
5m channel broken downward
Bearish 1m divergence at flag high inside down-channel → defer to K3
```

---

## STRATEGY K3 — Bear Flag / “Sell Strength” Exit Framework

**Direction:** SHORT (or exit longs) inside **5m down-channel** or embedded bear.

### Environment (ALL required)

| ID | TF | Condition | Logic |
|----|-----|-----------|-------|
| K3_E1 | 5m | `CHANNEL_VALID_DOWN` OR price < EMA_200(5m) | Structural weakness |
| K3_E2 | 5m | `EMBEDDED_BEAR(5m)` | STOCH_D(5m) <= 20 pinned |
| K3_E3 | 1m | Dead-cat bounce to upper rail or mid-channel | Price bounces; 1m quad may OS briefly |
| K3_E4 | 1m | `STOCH_A(1m)` surges toward 80 | Sell-strength rotation |

### Short entry

```
ENTRY SHORT when (1m):
  STOCH_A(1m) crosses 78–80
  AND K3_E1 AND K3_E2 (5m)
  AND price below 1m EMA_20 and EMA_50
  AND ideally AT_UPPER_RAIL or mid-channel resistance on 5m

SL = 1m bounce_high + STOP_BUFFER
TP = 5m lower channel rail OR STOCH_A(1m) < 20
```

### Long scalp exit rule

```
If long from K1 inside K3 macro:
  MANDATORY_EXIT when STOCH_A(1m) >= 80
  Do not hold for 5m channel breakout
```

---

## MASTER STRATEGY SELECTION FLOWCHART (Autonomous)

```
START (each 1m bar close)
  │
  ├── [1] Update 5m channel geometry from 5m pivots
  │       CHANNEL_VALID? ──NO──► NO TRADE (wait)
  │       YES ↓
  │
  ├── [2] Compute QUAD on 5m (4 stochs) and QUAD on 1m (4 stochs)
  │
  ├── [3] Price at 5m channel rail?
  │       AT_LOWER_RAIL or AT_UPPER_RAIL ──NO──► check K2/K3 trend only
  │
  ├── K1 PATH (Holy Grail — requires channel rail):
  │     QUAD_OVERSOLD(5m) + QUAD_OVERSOLD(1m) + AT_LOWER_RAIL
  │     + BULLISH_DIVERGENCE(1m) → LONG
  │     QUAD_OVERBOUGHT(5m) + QUAD_OVERBOUGHT(1m) + AT_UPPER_RAIL
  │     + BEARISH_DIVERGENCE(1m) → SHORT
  │
  ├── K2 PATH (needs 5m embedded bull):
  │     EMBEDDED_BULL(5m) + 1m flag to EMA_20 + STOCH_A(1m) at 20 hook → LONG
  │
  ├── K3 PATH (5m embedded bear / down-channel):
  │     EMBEDDED_BEAR(5m) + STOCH_A(1m) at 80 → SHORT or exit longs
  │
  └── Else → NO TRADE
```

**Priority:** Channel + K1 super signals first; K2/K3 only when channel context or 5m embedded trend clear.

---

## CONFLUENCE CHECKLIST (minimum before order)

| Check | K1 | K2 | K3 |
|-------|----|----|-----|
| **5m channel valid** | Required | Preferred | Required (down) |
| **At 5m rail** | Required | — | At upper/mid rail |
| **Quad 5m (all 4 stoch)** | OS/OB required | Embedded D | Embedded D bear |
| **Quad 1m (all 4 stoch)** | OS/OB required | A near 20 | A near 80 |
| **1m divergence** | Required | — | — |
| **1m trigger (9,3 hook)** | Required | Required | Required |
| Stop pre-defined | Yes | Yes | Yes |

---

## INDICATOR IMPLEMENTATION PSEUDOCODE

```python
# --- Quad stack (run on BOTH 1m and 5m bar series) ---
STOCH_PARAMS = [
    (9, 3),   # STOCH_A — entry hook on 1m
    (14, 3),  # STOCH_B
    (34, 3),  # STOCH_C  [alt period 44]
    (60, 10), # STOCH_D — embedded trend on 5m
]

def stoch_series(close, high, low, period, smooth):
    # Standard smoothed %K; match NinjaTrader / TradingView defaults
    ...

def quad_stack(bars_1m_or_5m) -> dict[str, Series]:
    return {
        "A": stoch_series(..., 9, 3),
        "B": stoch_series(..., 14, 3),
        "C": stoch_series(..., 34, 3),
        "D": stoch_series(..., 60, 10),
    }

def quad_oversold(stack) -> bool:
    return all(stack[k][-1] < 20 for k in "ABCD")

def quad_overbought(stack) -> bool:
    return all(stack[k][-1] > 80 for k in "ABCD")

def embedded_bull(stack, embed_bars=3) -> bool:
    return all(stack["D"][-i] >= 80 for i in range(1, embed_bars + 1))

def embedded_bear(stack, embed_bars=3) -> bool:
    return all(stack["D"][-i] <= 20 for i in range(1, embed_bars + 1))

# --- Channel geometry (5m only) ---
def detect_swing_pivots(bars_5m, left=2, right=2) -> list[Pivot]:
    ...

def build_channel(pivots_5m) -> Channel | None:
    # 1-2-3 sequence → parallel upper/lower/mid lines projected to 1m timestamps
    ...

def at_rail(price_1m, channel, tolerance_pct) -> Literal["lower", "upper", "none"]:
    ...

# --- Divergence (1m STOCH_A at 5m rail) ---
def bullish_divergence(price_lows_1m, stoch_a_1m, channel, lookback=20) -> bool:
    # two swing lows: lower price low, higher stoch low, stoch >= 20, near lower rail
    ...

def bearish_divergence(price_highs_1m, stoch_a_1m, channel, lookback=20) -> bool:
    ...

# --- Main loop (each 1m close) ---
def on_bar_close_1m(bars_1m, bars_5m):
    stack_1m = quad_stack(bars_1m)
    channel = build_channel(detect_swing_pivots(bars_5m))
    if not channel.valid:
        return NO_TRADE

    stack_5m = quad_stack(bars_5m)  # update only on 5m close
    if k1_long_confluence(channel, stack_5m, stack_1m):
        return signal("k1_quad_divergence", "long")
    ...
```

---

## CAPITAL.COM / METS INTEGRATION NOTES

| Topic | Futures (author) | Capital.com CFD |
|-------|------------------|-----------------|
| Symbol | MES / ES | US500, SPY, BTCUSD, ETHUSD |
| Tick / stop | 1–2 ticks | % of price or broker min distance |
| Session VWAP | 09:30 ET reset | Same for US indices; 24h VWAP for crypto |
| Volume | Real | CFD volume may be synthetic — use price-only stoch |
| Leverage | Exchange margin | `CAPITAL_*` API; cap in sim |
| Data resolution | **1m + 5m required** | `fetchAllCapitalCandles` 1m; aggregate or fetch 5m |
| Channel tolerance | 2–4 ticks from rail | 0.05%–0.12% of price |

**Recommended METS module path (new, parallel to Aziz):**

```
src/lib/kurisko/
  indicators/stochastic-quad.ts   — 4-band stack on 1m and 5m
  indicators/channel-geometry.ts — 5m pivot 1-2-3 parallel channel
  indicators/divergence.ts       — 1m STOCH_A vs price at rail
  backtest/k1-quad-div.ts
  backtest/k2-bull-flag-stoch.ts
  backtest/k3-bear-flag.ts
  backtest/run-strategy-backtest.ts
  forward/capital-forward.ts     — mirror aziz forward
```

**Implementation status (July 2026):** v1 shipped in `src/lib/kurisko/` — channel geometry, quad stoch, K1–K3 backtest engines, `POST /api/kurisko/backtest`, UI on `/day-trade`. Forward test and auto-tune remain backlog (see `Project-Management-Kurisko-Capital.md`).

**Strategy IDs (proposed):** `k1_quad_divergence`, `k2_stoch_bull_flag`, `k3_bear_flag`

Do **not** merge into Aziz `s1`–`s9` IDs — different logic tree (channel-first, dual TF, quad stack).

---

## PSYCHOLOGY RULES (for agent guardrails)

```
AGENT_MUST_NOT:
  - Enter without valid 5m channel (or explicit 5m embedded trend for K2/K3)
  - Enter K1 without quad on BOTH 5m and 1m plus 1m divergence at rail
  - Chase after STOCH_A(1m) > 80 (long) or < 20 (short) without pullback
  - Hold counter-trend long when K3_E1 and K3_E2 true past STOCH_A(1m) 80
  - Trade on 1m quad alone (TF_WEAK) — watchlist only
  - Increase size after losses without plan

AGENT_SHOULD:
  - Log setup type (K1/K2/K3), TF_SUPER vs TF_GOOD, channel slope, rail distance
  - Enforce daily max trades and daily loss
  - Prefer European session for cleaner channels (optional filter)
  - Invalidate channel and flatten if geometry breaks mid-trade
```

---

## QUANTITATIVE SUMMARY TABLE

| Strategy | Direction | 5m channel | 5m quad | 1m quad | Key trigger | Stop | Target | Claimed win% |
|----------|-----------|------------|---------|---------|-------------|------|--------|--------------|
| K1 Quad Divergence | Long/Short | At rail required | OS/OB | OS/OB + divergence | STOCH_A(1m) hook at rail | 1–2 ticks beyond 1m pattern | 5m mid → upper/lower break; exit 1m stoch 80/20 | 90–95% (unverified) |
| K2 20/20 Bull Flag | Long | Up-channel preferred | EMBEDDED_BULL (D) | A toward 20 | EMA20 touch + 1m hook | Below pullback / EMA20 | 3–5 pts / 5m upper rail | High (not quantified) |
| K3 Bear Flag | Short / exit | Down-channel | EMBEDDED_BEAR (D) | A toward 80 | Sell strength at 1m 80 | Above 1m bounce high | 5m lower rail / stoch 20 | Filters losers (author) |

---

## BACKTEST / VALIDATION REQUIREMENTS (METS)

Before live Capital.com forward test:

1. **Reproduce quad stoch** vs TradingView/Ninja on **both 1m and 5m** (9,3 / 14,3 / 34,3 / 60,10).
2. **Channel geometry** — visual audit: 5m pivots → parallel rails match manual draw on ≥20 sessions.
3. **No lookahead** — 5m indicators update only on 5m close; channel projected to 1m without future bars.
4. **Walk-forward** on US500 1m + 5m — minimum 3–6 months; report win rate, PF, max DD per strategy.
5. **Ablation tests:**
   - K1 without channel → expect degraded edge (proves Pillar 1).
   - K1 with 1m quad only (no 5m quad) → compare to TF_SUPER baseline.
6. **Sensitivity** on `STOCH_LONG_PERIOD` 34 vs 44 and channel `TOUCH_TOLERANCE`.
7. **Compare K2** to existing Aziz `s2_bull_flag` — overlap expected; keep best OOS.
8. **Crypto** BTC/USD separate calibration (wider stops, 24h session, wider channel width %).
9. **Disprove or confirm** 98% claim — if win rate > 80% in-sample, suspect lookahead; use strict bar-by-bar simulation.

---

## REFERENCES (workspace)

- `.documents/John-Kurisko-Trading/Advanced Stochastic.docx`
- `.documents/John-Kurisko-Trading/Advanced Stochastic2.docx`
- `.documents/John-Kurisko-Trading/extract detail content and trading strategy from....docx`
- `.documents/John-Kurisko-Trading/John-Kurisko-Trading-Template_Desire_to_Trade.pdf` (visual template; OCR not applied)
- External: www.daytradingradio.com / DTRva.com (community, alerts — not required for bot)

---

*Document compiled: July 2026 | For METS-v1 bot/RAG use. Not financial advice. Author win-rate claims require independent backtest validation.*
