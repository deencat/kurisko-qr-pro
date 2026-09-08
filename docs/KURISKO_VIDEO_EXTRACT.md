# Kurisko / Day Trading Radio — Channel + Quad Rotation video extract

**Purpose:** Research capture only. No live trading, no order routing, no copy-trade advice.

| Field | Value |
|-------|-------|
| URL | https://www.youtube.com/watch?v=71kKqbenw5o (also `youtu.be/71kKqbenw5o`) |
| Title | Channel Trading Master Class using the Quad Rotation for Exact Entries |
| Channel | Day Trading Radio (`@daytradingradio`) |
| Presenter | John Kurisko (“day trader the rockstar”) |
| Capture date | 2026-09-07 |
| Access | Watch-page narration / auto-transcript via WebFetch **OK**; `yt-dlp` subtitle download **blocked** (bot check) from this environment |
| Related in-repo | `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` (multi-video RAG consolidation) |

---

## Plain-English strategy summary

Kurisko does **not** trade “stochastic oversold = buy.” He draws **parallel 1-2-3 channels** from swing pivots, then only takes trades when price is at the **rail that favors the scalp** (usually the **lower** rail for longs, **upper** for shorts) **and** his **four stacked stochastics** (the “quad”) are extreme together — or a **body-based divergence** lines up with VWAP / 200 MA / a reversal candle.

In practice: map the day’s channels early, wait for price to tag the rail, require **all four** stochastics under **20** (long) or over **80** (short), take the bounce/fade, and **exit into the fast 9,3 rotation** (especially when under VWAP / 200 in a downtrend). Flags are treated as **short channels inside a strong trend** when the slow **60,10** is embedded and the fast **9,3** pulls back. A **QR scanner** (membership / trial) audio-alerts divergences and “extreme” bull/bear flags so the trader does not miss setups.

---

## Indicator stack (named as taught)

| Name in video | Role |
|---------------|------|
| **Quad Rotation / four stochastic bands** | Core timing. Spoken stack: **9,3 · 14,3 · 44 · 60,10** (also referred as “93 / 143 / 44 / 6010”). |
| **Oversold / overbought lines** | **20** OS, **80** OB (presenter draws a yellow horizontal on 20). |
| **1-2-3 channel / parallel channel** | Geometry filter: two pivots on one side → line; parallel cloned to the opposite pivot; extend; do not redraw after a valid 1-2-3. |
| **Divergence (2-stage)** | Stage 1: extreme + swing high/low on **candle bodies** (ignore wicks). Stage 2: equal/higher high (short) or lower low (long) with opposing stoch structure. |
| **VWAP** | Major confluence; buy/sell when VWAP + quad (or divergence) align. |
| **200-period MA** | Trend/context: under 200 + VWAP → treat longs as short-lived; respect 9,3 exits. |
| **20 / 50 MA (flags)** | Flag / pullback structure: holds of 20; first break of 20 often finds 50 (“second line of defense”). |
| **Reversal candles** | Engulfing, outside day, hammer, piercing (≥50% into prior body), morning star (de-emphasized), tweezers. Common rule: take out prior extreme then close back through. |
| **Volume profile / resistance** | Mentioned as secondary reasons price turns when no clean quad/divergence. |
| **QR Scanner (“rockbot” / panel)** | Productized alerts: divergences across TFs; Extreme Flag ID (watching → possible → extreme bull/bear flag). |
| **Fear index** | Brief contextual watch (not a formal entry rule in this episode). |

**Quad definition (spoken):** all **four** stochastics extreme together — “all four under the 20” for scalp longs; all four oversold/overbought for sells at the opposite rail (“93, 143, 44, and 6010”). Not one oscillator.

**60,10 note:** Presenter equates **60,10 on the 1m chart** with roughly a **5-minute** stochastic feel — used for embedded trend / permission, while **9,3** is the fast rotation for entries/exits.

---

## Rules — entry / exit / filters

### Channel construction (hard filter)

1. Find a **pivot** = change of direction (prefer **closing bodies**, not wicks).
2. **1-2-3 pattern:** two touches on one rail → draw and extend; clone parallel to the intervening opposite pivot.
3. After a **channel break** up or down, the **high/low of the prior channel just before the break** is usually **pivot #1** of the new channel.
4. Once a good 1-2-3 is in, **do not adjust** the channel to chase every spike.
5. **Blowouts / stop hunts / news spikes** often overshoot; if price **settles back** and holds, use the **settle** as the pivot, not the wick extreme.
6. **≥4–5 touches** → rail is strong; expect hold on retest even after a temporary break.
7. **Waterfall / flush:** occasional violent break of the lower rail; often returns into the channel — retest of original rail remains valid (reset / “rechamber”).
8. If structure is ruined → wait for a **new** 1-2-3 (reset). Do not force.

### Long bias (primary teaching in this video)

| Gate | Rule |
|------|------|
| Where | Price at / tagging the **lower channel trend line** (1-2-3 established; often trade touches **4 / 5 / 6**). |
| When (preferred) | **Quad OS:** all four stochastics **&lt; 20**. |
| Alt trigger | **Bullish divergence** at rail (body lows; stage-1 ignore wick spikes). Divergence alone can justify entry. |
| Confluence | Prefer **≥3 of 5** “indicators”: quad, channel, divergence, VWAP, reversal candle. |
| Filters | Avoid trading **into news** (e.g. 8:30 jobs). Weak/chop without rail + OS → skip. Not long mid-channel just because “oversold.” |
| Exit (scalp) | Take profits into **9,3** rotating up / into strength — often toward **80**, sometimes only to **50** in weak markets. |
| Safety net | If long in a **downtrending** tape (under **200** / **VWAP**, steep channel) and **9,3** gets overbought quickly with little price progress → exit; do not trail hoping for a bottom. |
| Claimed move example | Off rail + quad: ~**20 points** in a few candles on ES-style futures example; “**eight points easy**” as a realistic take. |

### Short / sell side

| Gate | Rule |
|------|------|
| Where | **Upper** channel line(s); “**X marks the spot**” when **two** trend lines meet. |
| When | Quad **OB** (all four elevated) and/or **sell divergence** (stage 1: high + **9,3 &gt; 80**, typically ~20-bar high; stage 2: body equal/higher high with weaker stoch). |
| Flag short | **Extreme bear flag:** **60,10** embedded down, fast **9,3** bounce/rotation, price vs 20 MA criteria (coded in scanner). |
| Exit longs / add shorts | Sell strength into **9,3** in a down channel; “short into that 93.” |

### Flags (bull / bear) — treated as channels

- **Bullish context:** **60,10** pushing up / embedded; **9,3** pulls back (often toward **80** then turns up) → buy the pullback (“93 flag”).
- **Bearish extreme flag:** slow stoch embedded down + fast rotation up against weak tape → short weakness (scanner “Extreme Flag ID”).
- Aging flags: pullbacks deepen; first sustained break of **20 MA** after multiple 20-holds often tags **50 MA** hard.

### Wedges

- Falling wedge ≈ converging channel; typically breaks higher.
- Still: **buy the lower trend line** when timed with stochastics — same rail discipline.

### Explicit non-rules / discipline

- No trade without criteria → “gambling.”
- Patience / being present at the screen is called the hard part; part-time forcing is discouraged.
- Presenter often skips copy trades on “blood bath” days; requires exact 1-2-3 + rail.
- Claimed qualitative hit rate when setups qualify: “**eight out of 10**”; failed ones often warn via fast 9,3 without 60,10 follow-through (“get out of jail free”).

---

## Timeframes & markets

| Item | Spoken |
|------|--------|
| Primary execution TF | **1-minute** scalping |
| Multi-TF monitoring | Scanner watches **1m / 3m / 5m** divergences (ES example) |
| Stoch stack as TF proxy | **60,10** on 1m ≈ **5m** oversold/overbought permission |
| Markets | **Index futures** (ES, NASDAQ, Dow), **gold**, “**SN**”; “works on stocks also”; “works on everything” (mathematical / science framing) |
| Candle variant | Sometimes **22-range** NASDAQ candles to reduce wick noise |
| Session color | Live day charts (RTH + overnight examples); Friday jobs / news called out as avoid zones |

---

## Quantitative / numeric crumbs (as spoken)

| Item | Value | Confidence |
|------|-------|------------|
| Stoch periods | **9,3 / 14,3 / 44 / 60,10** | High (repeated “93 143 44 6010”) |
| OS / OB | **20 / 80** | High |
| Quad long | **All four &lt; 20** | High |
| Divergence stage-1 high | Stoch **&gt; 80** + ~**20-period** high | Medium-high |
| Piercing | Close **≥ 50%** into prior candle | High |
| Channel validity heuristic | **≥4–5** touches → strong rail | Medium |
| Confluence | **3 of 5** key factors | Medium |
| Example scalp | ~**8 points** of a ~**20-point** ES-style burst | Anecdote only |
| Setup success claim | **~8/10** when criteria met | Marketing / anecdotal |
| Blowout settle | **9/10** overshoot then return (spoken) | Anecdote |
| Trail warning | **9/10** trailing stops get tagged after weak bounce | Anecdote |
| Experience framing | Trading live since **~2007** on daytrading.com; decades of channel/stoch work | Bio |
| Old class note | ~**2008–2010** channel class used fewer quads than current method | Historical |

**Not specified in this video:** fixed stop ticks, fixed R:R, position sizing %, max daily loss, ATR multiples, exact stochastic smoothing for “44” (3 vs 4), formal session allowlist.

---

## How the tool is sold / used

| Element | Detail |
|---------|--------|
| Brand / site | **daytrading.com** / **Day Trading Radio**; promo shortcuts spoken as **dtr.tv** / free-trial funnels |
| Offer | **14-day free trial** — username/password, **no credit card**; access to live trading, lessons/playbook, bots/scripts, **QR scanner** |
| QR Scanner | Membership (incl. trial) tool: panel + audio alerts for divergences, extreme bull/bear flags (states: watching → possible → extreme); multi-TF (1/3/5m) |
| Alerts stack | Scanner audio + **Voxer** member alerts; scanner also via **Patreon** (`patreon.com/daytradingradio` variants spoken) |
| Playbook (in-app) | Beginner chart setup + named lessons: lower trend line stochastic bounce, 1-2-3 pattern, channel breakout + stoch rotation, coiled stoch, downward wedge, EMA breakdown / “trap door,” part-time trading plan, business plan |
| Copy trades | Presenter has a copy-trade workflow but **skipped** on the filmed down day — insists on exact channel + rail criteria |
| Positioning | Tool is sold as encoding “30 years” of what not to miss; channel video is teaching + funnel into trial/scanner |

---

## Mismatches vs typical manual-indicator use

What a retail trader usually does with “stochastics + channels,” and how this video differs:

1. **Single stochastic vs quad** — Typical: one Stoch(14,3,3) cross of 20/80. Here: **four** periods must agree; lonely OS/OB mid-channel is explicitly rejected.
2. **Oversold = buy anywhere** — Typical discretionary habit. Here: OS only matters **on the lower 1-2-3 rail** (or with divergence / VWAP confluence).
3. **Redraw channels every spike** — Typical. Here: lock a valid 1-2-3; treat breakouts as stop runs; pivot off **settle**, not wick.
4. **Wick-based pivots / divergence** — Typical swing tools use highs/lows. Here: **bodies only** for stage-1 divergence and many channel pivots; wicks called noise / trap.
5. **Hold for channel breakout / target** — Typical channel trade aims for opposite rail or break. Scalp teaching here: **exit into 9,3**, especially against the larger trend; trailing stops discouraged in weak tape.
6. **One chart timeframe** — Typical. Here: 1m execution plus slower stack / scanner **1–3–5m**; 60,10 used as higher-TF proxy.
7. **Manual watch-only** — Method is taught as discretionary geometry, but productized as **QR Scanner + Voxer + bots** so the edge is “don’t miss the rare alignment,” not continuous discretionary clicking.
8. **Flag = classic pattern textbook** — Here flags are **stochastic-state machines** (embedded 60,10 + 9,3 pullback + MA structure), with scanner IDs — closer to a rules engine than pure pattern recognition.
9. **Always in the market** — Video stresses **few exact setups**, skip blood-bath / news, reset after broken structure — opposite of indicator-chasing every OS tick.

---

## Access / fidelity notes

- Extraction is from **spoken teaching** recovered via YouTube watch-page content (auto narration). Visual chart annotations and exact scanner UI strings may be incomplete.
- Stochastic middle length spoken as **44** in this episode; other Kurisko materials in-repo also cite **34,3** — treat **34 vs 44** as a known variance for any later coding.
- This file is a **single-video** satellite. Prefer `.documents/John_Kurisko_QuadRotation_Scalping_RAG.md` for multi-source bot quantification; reconcile conflicts explicitly before automating.

---

## Source checklist (captured)

- [x] Indicator names / periods / thresholds  
- [x] Entry / exit / filter rules  
- [x] Timeframes & markets  
- [x] Product / trial / scanner sales use  
- [x] Quantitative crumbs (with anecdote vs hard-rule tags)  
- [x] Plain-English summary + mismatches vs typical manual use  
- [ ] Live trading / forward test — **out of scope (none)**

---

## Related: event backtest MVP

Bar-by-bar K1 SIGNAL backtest (research-only): see **[K1_BACKTEST.md](./K1_BACKTEST.md)** (`npm run k1:test` / `npm run k1:backtest`). Implements stop / channel-mid TP / STOCH_A 80·20 / time-stop exits from the RAG; does **not** claim video win-rate figures.

K2/K3 diagnose (embedded 60,10 + 9,3 flag / sell-strength): see **[K2_K3_DIAGNOSE.md](./K2_K3_DIAGNOSE.md)** (`npm run k2k3:test` / `npm run k2k3:smoke`).
