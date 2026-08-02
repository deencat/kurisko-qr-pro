# SRS: Steven Dux Small-Cap Short Strategies (Auto Algo)

| Field | Value |
|-------|--------|
| **Document** | Software Requirements Specification |
| **Source video** | Chart Fanatics — *If You Only Watch One Trading Strategy Video, Make It This* (Steven Dux) |
| **Companion notes** | `docs/Stephen-Duk-Strategy.md` |
| **Transcript** | `docs/If You Only Watch One Trading Strategy Video, Make It This.txt` |
| **Version** | 0.1 (draft from transcript gap fill) |
| **Date** | 2026-08-01 |
| **Status** | Requirements draft — several numeric thresholds marked **TBD / VALIDATE** (manual spreadsheet stats not published) |

---

## 0. How to read this document

- **MUST / SHALL** = hard filter for live algo (fail → no trade).
- **SHOULD** = soft filter / size modulator (fail → reduce size or skip unless override).
- **MAY** = optional enhancement.
- **VALIDATE** = stated by Dux but sample methodology / exact bucket tables not fully published; backtest before hardcoding.

Primary strategies:

1. **GUS** — Gap-Up Short  
2. **BS** — Bounce Short  
3. **FRD** — First Red Day  

---

## 1. Purpose and scope

### 1.1 Purpose

Specify an automatable trading system that:

1. Scans US equities for GUS / BS / FRD setups using Dux’s stated filters.
2. Scores conviction (volume ratios, float buckets, dollar blocks).
3. Enters / scales / exits short positions with explicit risk rules.
4. Logs every candidate for statistical review (mirrors his 2015+ spreadsheet process).

### 1.2 In scope

- Universe filtering (mcap, float, price, sector).
- Premarket + RTH signal detection.
- Entry, stop, scale-in, scale-out, cover rules.
- Position sizing caps (float %, day volume %).
- Event logging / expectancy simulation.
- Paper → live promotion gates.

### 1.3 Out of scope (v1)

- Long strategies.
- Options / warrants.
- Non-US listings (except as hard excludes, e.g. China ADRs).
- Discretionary “feel” overrides without logged reason codes.
- Claiming exact historical win rates without independent backtest.

### 1.4 Actors

| Actor | Role |
|-------|------|
| Scanner | Discovers candidates premarket / RTH |
| Strategy engines | GUS / BS / FRD state machines |
| Risk engine | Size, stops, daily loss, locate checks |
| Execution | Broker / OMS orders |
| Journal | Persist candidates, fills, outcomes for stats |

---

## 2. Gap analysis: `Stephen-Duk-Strategy.md` vs transcript

### 2.1 Critical gaps (block correct algo behavior)

| ID | Area | What’s missing / wrong in MD | Transcript requirement |
|----|------|------------------------------|------------------------|
| G1 | **Push % (GUS)** | Not in criteria tables | After open, track **20–35% push** from open / relevant base; **higher push → higher win rate**; float-dependent averages (1–2M float ≈ **30–35%**; 5–10M ≈ **20–25%**) |
| G2 | **Volume timing (GUS)** | Vague “9:30–11:30” | **~30–35% of estimated day volume before 11:00**; after 11 volume dies; entry window tied to this |
| G3 | **Scale-in mechanics (GUS)** | “Enter on first breakdown” only | After ~**1 hour** consolidation: **partial** near 10–11; **full size** after momentum crack **~3–5%**; stop above consolidation high |
| G4 | **Dollar-block formula (BS)** | MD says `float × price` | Wrong for precision: use **volume concentrated at resistance zone × consolidation price** (from 30m/1h bars), ideal **≥ $150M** (doable ~130–140M) |
| G5 | **Open dump volume decay (BS)** | Missing | Open often dumps **15–20%** → estimated day volume can shrink **50–80%**; compare **stuck shares vs revised estimate** |
| G6 | **BS volume estimate multiplier** | Implied 1:5–1:10 | Bounce path: estimate day vol ≈ **premarket × 10**, then revise down after open dump |
| G7 | **FRD green-day definition** | “Consecutive green days” | A day can **close red but trade green intraday** and still count toward the run; reset only on true interruption (red/flat as defined) |
| G8 | **FRD dollar-volume progression** | Share volume only | Prefer **dollar volume** day-over-day: `avg_price × volume` must increase even if share volume dips |
| G9 | **Initial market cap formula (FRD)** | “Up to $200M” | **Initial mcap** = current mcap adjusted by run multiple (e.g. $1→$10 ⇒ divide by 10); use **initial**, not peak mcap |
| G10 | **Dollar exhaustion table (FRD)** | Vague “30% of float/mcap” | Bucket by **initial mcap**; tops cluster at similar **dollar volume traded near top** (examples: ~$1B / ~$3B / $5–10B / IPO ~$30B) — **VALIDATE exact buckets** |
| G11 | **FRD day-2 volume ratio** | Missing | Day after first red: PM vol << prior day (e.g. 5–7M vs 200M) → estimate ratio **~3:1 to 4:1** vs prior day resistance volume |
| G12 | **FRD skip if next day green** | Missing | After first red close, if **following day is green**, **do not short** |
| G13 | **FRD 50% run fade rule** | Missing | If first red / gap already erased **>50% of entire run gain**, reward may be insufficient — **VALIDATE skip vs size-down** |
| G14 | **Low-float crowded GUS** | Only in examples | If float **<2M** and float rotation **>15×**, wait **50% pullback then bounce** before short; don’t treat as standard GUS |
| G15 | **Float-tiered GUS entries** | Missing | **<2M**: wait clear momentum shift; **3–5M**: partial size; **7–8M**: may short vs premarket high with **50–60%** of planned size |

### 2.2 Important gaps (accuracy / sizing)

| ID | Area | Gap |
|----|------|-----|
| G16 | Volume buckets (GUS) | Tradable PM vol bands **1–10M, 10–20M, 20–40M**; **>50M PM** = crowded / generally not GUS |
| G17 | Crowded → next-day short | After crowded day, prefer **next day gap-down / dry volume** short (related to BS), not same-day GUS breakdown |
| G18 | BS lookback | **1-year** chart; resistance spike then ideally **~2 months** flat |
| G19 | BS Type 1 vs 2 | Type1: gap into resistance, low PM (3–5M) → **higher WR**, fade ~**75%** of move; Type2: RTH grind from lows → **lower WR**, bounce then fade ~**50%** |
| G20 | BS spike volume | Example criteria also cite **≥100M** single-day spike (MD only “~30M+”) |
| G21 | FRD risk band | Consolidation risk often **~10–15%** (vs GUS ~7%) |
| G22 | FRD chart archetype | **Downtrending beaten-down** bases tend to run further than **flat** bases before FRD |
| G23 | FRD projection | Assume **30–50%** daily volatility to forecast which day may hit dollar block; skip days that can’t reach it |
| G24 | China ADR risk | If intraday volume **<~30M**, halt / thin book risk ($2→$200 stories); hard avoid |
| G25 | Biotech quant | GUS WR drops **~20–30%** on biotech (not just “avoid”) |
| G26 | Sector scope | Biotech + Energy avoid for **GUS, BS, and ideally FRD**; China avoid especially |
| G27 | Extreme exception | Extreme extensions (e.g. $1→$1000) may override sector avoid — discretionary / high scrutiny |
| G28 | Cross-strategy | Crowded GUS day can **seed BS** resistance for later short |
| G29 | Size vs edge | Size **up** with higher WR / better volume ratio; size **down** near criteria edges (e.g. $2.80–$2.99) |
| G30 | Personal size caps | GUS/BS: Dux personal max ~**1.0–1.2M shares**, typical reward **$200–300k**; FRD: no hard size limit but large size affects tape |

### 2.3 Gaps that are structural for automation (never in MD)

| ID | Missing for production algo |
|----|-----------------------------|
| A1 | Exact definitions: gap %, consolidation box, breakdown, push %, green/red/flat day |
| A2 | Session calendar (premarket hours, RTH, early close) |
| A3 | Data feeds: float, shares outstanding, mcap, sector taxonomy, halt status |
| A4 | Short locate / HTB / borrow fee constraints |
| A5 | Order types, partial fills, slippage model |
| A6 | Strategy priority when GUS+BS+FRD overlap |
| A7 | Daily loss / max concurrent shorts / kill switch |
| A8 | Backtest protocol matching “frequency × WR × avg fade” yearly simulation |
| A9 | Halt / LULD / SSR (Reg SHO) handling |
| A10 | Corporate actions (splits, offerings) mid-setup |

### 2.4 Minor / narrative items (optional)

- Anecdotes: $1.5M / 15m GME-style bounce; $7M BYND FRD; spreadsheet since 2015.
- Host ad segments (ignore for requirements).
- Name spelling: Steven / Stephen / Steven Dux vs “Steven Dux” in MD title.

---

## 3. Glossary (normative definitions for the algo)

| Term | Definition for v1 |
|------|-------------------|
| **Premarket (PM)** | 04:00–09:30 America/New_York (configurable) |
| **RTH** | 09:30–16:00 ET |
| **Gap %** | `(PM_or_open_ref - prior_RTH_close) / prior_RTH_close` — **VALIDATE** whether PM high, last PM trade, or official open is used; default: **official open vs prior close** for qualification, PM high for crowdedness |
| **Push % (GUS)** | Max favorable excursion after open from **open price** (or from post-open swing low if open dumps — **VALIDATE**); expressed as % up |
| **Consolidation** | Price range lasting ≥ **N minutes** (default **60**) with range width ≤ **X%** of mid (default **VALIDATE 5–8%**) after the push |
| **Consolidation high** | High of that consolidation box (stop reference) |
| **Breakdown / crack** | Close (or trade) **3–5%** below consolidation low / mid — **VALIDATE** exact trigger (low vs mid) |
| **Green day** | RTH close > RTH open **OR** (for FRD run counting) majority of RTH traded above prior close / net positive — **see FRD rules**; implement both modes with flag |
| **Red day** | RTH close < RTH open (classic). **FRD “first red”** may be close red while intraday was green |
| **Flat day** | `|close-open|/open < F%` (default **1%** VALIDATE) → resets FRD count |
| **Float** | Free float shares from data vendor (primary); fallback shares outstanding |
| **Float rotation** | `day_volume / float` |
| **Initial market cap (FRD)** | `current_market_cap / (price / price_at_run_start)` ≈ mcap at start of parabolic run |
| **Dollar block (BS)** | `shares_traded_in_resistance_zone × zone_vwap_or_mid` |
| **Dollar volume (day)** | `volume × VWAP` (or typical price) |
| **Volume estimate (day)** | GUS: `PM_volume × K` with **K ∈ [5,10]**; BS: start **K=10**, revise after open |
| **Stuck shares** | Volume accumulated in resistance price band on historical spike day(s) |

---

## 4. System overview

```
Universe → Hard filters → Strategy detectors → Score/size → Risk checks → Orders → Journal
                ↑                                      ↓
         Float/MCap/Sector                    Stops / scale / cover
```

### 4.1 Strategy priority (proposed)

When multiple strategies qualify on same symbol same day:

1. **FRD** (highest edge claim, rare)  
2. **BS** (if resistance dollar block qualifies)  
3. **GUS** (same-day gap)  
4. If GUS crowded (**PM vol > 50M** or rotation > 15×): **suppress GUS**, optionally arm **BS / next-day dry-up** modes  

---

## 5. Shared hard filters (all strategies)

| ID | Requirement | Notes |
|----|-------------|-------|
| SF-01 | Price SHALL be **≥ $3.00** at evaluation | Near miss ($2.80–$2.99): allow only with **size_mult ≤ 0.5** or skip (config) |
| SF-02 | Float SHALL be **≤ 50M** shares | >50M: reject **99%** of cases per Dux |
| SF-03 | Exclude sectors: **Biotechnology**, **Energy**, **China / China ADR** | Apply to GUS & BS always; FRD SHOULD |
| SF-04 | Biotech: treat as WR penalty **−20 to −30 pp** if ever enabled | Default disabled |
| SF-05 | China names: if expected RTH volume **< 30M**, hard reject (halt risk) | |
| SF-06 | Instrument = common stock / suitable shortable equity | No warrants/OTC by default |
| SF-07 | Must pass shortability / locate check before order | |

### 5.1 Market-cap filters (strategy-specific)

| Strategy | Rule |
|----------|------|
| GUS | **Initial / current small-cap mcap ≤ $100M** (transcript: under $100M; over $200M not doable) |
| BS | Ideally **≤ $200M** |
| FRD | **Initial mcap ≤ $200M** (peak mcap may be higher) |

---

## 6. Strategy SRS — Gap-Up Short (GUS)

### 6.1 Qualification (premarket / open)

| ID | Requirement |
|----|-------------|
| GUS-01 | Gap % SHALL be **≥ 100%** |
| GUS-02 | MCap SHALL be **≤ $100M** (reject if **> $200M**) |
| GUS-03 | Float in **[1M, 50M]**; bucket for sizing: **1–2M / 2–5M / 5–10M / 10–20M** |
| GUS-04 | PM volume buckets: prefer **1–40M**; if PM vol **> 50M** → **GUS-CROWDED** (do not take standard GUS) |
| GUS-05 | Estimate day volume `E = PM_vol × K`, `K` default **10** (range 5–10) |
| GUS-06 | If `E` implies extreme crowding vs mcap (e.g. E ≥ 500M on &lt;$100M mcap) → treat as crowded / reduce or skip |
| GUS-07 | Sector filters SF-03 apply |

### 6.2 Intraday confirmation

| ID | Requirement |
|----|-------------|
| GUS-08 | After open, measure **push %**; target band **20–35%** (higher better) |
| GUS-09 | Expected push by float: **1–2M → 30–35%**; **5–10M → 20–25%**; if push << bucket average, skip or tiny size |
| GUS-10 | Require consolidation ≈ **≥ 60 minutes** after push |
| GUS-11 | By **11:00**, actual volume SHOULD be ≈ **30–35% of E**; if far below/above, rescoring |
| GUS-12 | Prefer entries **10:00–11:30**; afternoon only if morning volume exhausted + late breakdown (lower priority) |

### 6.3 Entry / stop / targets

| ID | Requirement |
|----|-------------|
| GUS-13 | **Partial entry** into weakness near end of consolidation (~10–11) |
| GUS-14 | **Full entry** after breakdown crack **3–5%** |
| GUS-15 | Stop SHALL be **above consolidation high** (not arbitrary spike unless config) |
| GUS-16 | Planned risk ≈ **7%** of entry (informational); reject if stop distance &gt; **R_max** (config, default 10%) |
| GUS-17 | Average fade expectancy ≈ **26%** from intraday high / **24–25%** from entry — use for R:R gate **≥ ~1:3** |
| GUS-18 | Cover rules (v1 proposal): scale out at **−10%, −15%, −20%, −25%** from entry or trail; full cover EOD unless overnight module enabled (default **flat by 15:55**) |

### 6.4 Low-float / crowded variants

| ID | Requirement |
|----|-------------|
| GUS-19 | If float **&lt; 2M** AND rotation **&gt; 15×**: **forbid** standard breakdown entry; require **≥50% retrace from HOD** then **bounce short** entry |
| GUS-20 | Float **3–5M**: max **50–70%** planned size on first signal |
| GUS-21 | Float **7–8M+**: may short vs **premarket high** with **50–60%** size (VALIDATE vs consolidation method) |
| GUS-22 | Crowded day: queue **next-session** watch for gap-down + volume dry-up (hand off to BS-like logic) |

### 6.5 Statistics targets (journal KPIs, not guarantees)

| Metric | Stated |
|--------|--------|
| Frequency | ~**50–70** / year after filters |
| Win rate | ~**75%+** |
| Avg fade | ~**26%** from HOD |

---

## 7. Strategy SRS — Bounce Short (BS)

### 7.1 Historical structure

| ID | Requirement |
|----|-------------|
| BS-01 | Scan **≥ 1 year** history for a **high-volume resistance spike candle** |
| BS-02 | After spike, prefer **multi-week / ~2 month** flat base below resistance |
| BS-03 | Spike day volume ideally **≥ 30M**; strong examples **≥ 100M** (score higher) |
| BS-04 | Price ≥ $3; mcap ideally ≤ $200M; float ≤ 50M |
| BS-05 | Compute **resistance zone** around spike consolidation (e.g. $5 area) using **30m/1h** volume-at-price |
| BS-06 | **Dollar block** = stuck_shares_in_zone × zone_price; ideal **≥ $150M**; soft ok **≥ $130M** |

### 7.2 Event day

| ID | Requirement |
|----|-------------|
| BS-07 | Gap toward resistance (often **≥ 100%** gap context) OR RTH rally into resistance |
| BS-08 | PM vol estimate: `E0 = PM_vol × 10` |
| BS-09 | If open dumps **15–20%**, revise `E := E0 × (0.2–0.5)` (50–80% reduction) |
| BS-10 | Volume ratio `R = stuck_shares / E_revised`; size by R: **1:1 reduce**, **≥2:1 increase**, extreme **up to 10:1** max conviction |
| BS-11 | Entry: **closer to resistance consolidation → larger size / tighter risk**; open entry allowed when gap into level |

### 7.3 Types

| Type | Pattern | WR / fade (stated) |
|------|---------|---------------------|
| **BS-T1** | Gaps into resistance with **low PM vol (≈3–5M)** | Higher WR; fade ≈ **75%** of up-move; often straight down |
| **BS-T2** | Little/no PM move; RTH parabolic into resistance | Lower WR; bounce then fade ≈ **50%** of up-move |

### 7.4 Sizing / exit

| ID | Requirement |
|----|-------------|
| BS-12 | Position SHALL NOT exceed **10% of float** |
| BS-13 | Position SHALL NOT exceed **1% of expected/actual day volume** (use conservative estimate) |
| BS-14 | Large accounts: **scale cover along the fade** (return shares to market); do not only cover at full target |
| BS-15 | Stop: above resistance consolidation / invalidation level |

### 7.5 Stats KPIs

| Metric | Stated |
|--------|--------|
| Frequency | ~**30** / year |
| Win rate | ~**80–85%** |

---

## 8. Strategy SRS — First Red Day (FRD)

### 8.1 Run qualification

| ID | Requirement |
|----|-------------|
| FRD-01 | Compute **run start** and **initial mcap ≤ $200M** |
| FRD-02 | **≥ 3 consecutive advancing days** with **non-decreasing emotional chase** (no red/flat reset in between) |
| FRD-03 | **Exception 2-day run**: range MUST be **≥ 1000%**; 3+ day run range MUST be **≥ 300%** from initial breakout |
| FRD-04 | Day-over-day **dollar volume** SHOULD increase: `DV_t ≥ DV_{t-1}` even if share volume falls |
| FRD-05 | Red/flat day **resets** consecutive count to zero |
| FRD-06 | Prefer beaten-down prior downtrend base (higher extension risk — size/expectancy model) |

### 8.2 Top-timing / dollar exhaustion

| ID | Requirement |
|----|-------------|
| FRD-07 | Maintain **VALIDATE** table: initial_mcap_bucket → typical **top dollar volume** (transcript examples: ~$1B, ~$3B, $5–10B, IPO ~$30B) |
| FRD-08 | Each PM: estimate `E = PM_vol × 10` and projected dollar volume; **if cannot reach bucket threshold today → no trade** |
| FRD-09 | Conceptual cap: large players avoid pushing **&gt; ~30% of float/mcap** alone — use as sanity check, not sole trigger |
| FRD-10 | Project path with **30–50%** daily ranges to guess exhaustion day |

### 8.3 First red recognition & entry

| ID | Requirement |
|----|-------------|
| FRD-11 | Detect **first red close** after qualified run (intraday may have been green) |
| FRD-12 | On exhaustion / first-red day: max size **≤ 25%** of planned FRD size (fakeout risk under high volume) |
| FRD-13 | **Primary entry day = next session** if still red / weak: PM volume << prior day; target ratio vs prior day volume **~3:1–4:1** |
| FRD-14 | If day after first red is **green** → **cancel** FRD setup |
| FRD-15 | Prefer add on **bounce** into prior consolidation; if no bounce, may size at **open** (common) |
| FRD-16 | Stop above **consolidation** (not necessarily absolute spike high) |
| FRD-17 | Planned stop distance often **~10–15%** |
| FRD-18 | If gap already consumed **&gt;50% of total run gain**, skip or heavily reduce (reward check) |
| FRD-19 | Cover: ride breakdown; large size → scale out (tape impact) |

### 8.4 Stats KPIs

| Metric | Stated |
|--------|--------|
| Frequency | ~**5–10** / year |
| Win rate | up to ~**90%** |
| Size | No same float% hard cap as GUS/BS in talk — still enforce firm risk limits |

---

## 9. Position sizing engine

### 9.1 Inputs

- Account equity, max risk per trade `%R`
- Strategy base size from WR / R:R simulation
- Float cap, volume cap
- Conviction multipliers (volume ratio, push %, dollar block, type)

### 9.2 Constraints (SHALL)

| ID | Rule |
|----|------|
| SZ-01 | Risk to stop ≤ **max_risk_per_trade** (config; e.g. 0.5–1% equity) |
| SZ-02 | Shares ≤ **10% float** (BS hard; GUS SHOULD; FRD configurable) |
| SZ-03 | Shares ≤ **1% of E or day volume** (BS hard; others SHOULD) |
| SZ-04 | Near-miss criteria → `size_mult ≤ 0.5` |
| SZ-05 | Higher volume ratio / WR bucket → higher `size_mult` (bounded) |
| SZ-06 | Max concurrent symbols, max daily loss, kill switch |

### 9.3 Yearly expectancy simulation (required journal feature)

Mirror Dux process:

```
expected_wins = frequency_per_year * win_rate
expected_pnl ≈ expected_wins * avg_fade_$ - expected_losses * avg_loss_$
```

UI/report SHALL show “on-track vs perfect year” for FOMO control.

---

## 10. Data & interface requirements

| Data | Use | Notes |
|------|-----|-------|
| L1/L2 trades + 1m OHLCV | Intraday | |
| Premarket tape | Gap, PM vol | |
| Daily OHLCV + VWAP | FRD / BS history | |
| Float, shares out, mcap | Filters | Vendor SLA critical |
| Sector / country of risk | Excludes | GICS + China ADR flag |
| Halt / LULD / SSR | Safety | |
| Locate / HTB | Execution | |
| Volume-at-price | BS dollar block | 30m/1h preferred |

APIs (logical):

- `GET /scan/premarket` → candidates  
- `GET /setups/{symbol}` → strategy scores + blockers  
- `POST /orders/intent` → risk-checked  
- `GET /journal/stats` → frequency, WR, fade  

---

## 11. State machines (summary)

### GUS
`WATCH_PM → QUALIFIED → PUSHING → CONSOLIDATING → PARTIAL → FULL → MANAGING → FLAT / STOPPED`

### BS
`MAP_RESISTANCE → ARMED → GAP_OR_RALLY → RATIO_OK → ENTER → SCALE_COVER → FLAT`

### FRD
`RUN_BUILDING → EXHAUSTION_DAY (≤25%) → FIRST_RED → DAY2_CONFIRM → FULL → MANAGING → FLAT`  
Cancel paths: `RESET_ON_RED_MID_RUN`, `DAY2_GREEN`, `DOLLAR_NOT_REACHABLE`, `REWARD_LT_50PCT`

---

## 12. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Decision latency from bar close → order intent **&lt; 500ms** p95 (excl. broker) |
| NFR-02 | All rejects logged with **reason codes** (mirrors spreadsheet columns) |
| NFR-03 | Replayable from stored ticks/candles (deterministic) |
| NFR-04 | Paper trade **≥ N setups** per strategy before live size (N VALIDATE, e.g. 30) |
| NFR-05 | No strategy enabled without independent backtest vs stated KPI bands |

---

## 13. Open questions / VALIDATE list (must resolve before live)

1. Exact **gap reference** (PM high vs open vs last PM print).  
2. Exact **push %** baseline (open vs VWAP vs PM high).  
3. Consolidation geometry (range %, min bars, time).  
4. Breakdown trigger (3% vs 5%; vs consolidation low vs mid).  
5. Official **initial mcap → top dollar volume** lookup table from Dux samples.  
6. FRD green-day classifier: close-based vs intraday-green allowance — implement dual flags.  
7. Whether **$3** is hard floor or soft.  
8. Overnight holds allowed? (assume **no** for v1).  
9. SSR / uptick rule interactions on hard downs.  
10. Vendor definition of float vs “tradable float”.  
11. Energy/biotech taxonomy mapping.  
12. Whether 70% gaps ever qualify (early mention) — later clarified **≥100%**; treat 70% as non-qualifying.

---

## 14. Acceptance criteria (algo v1)

1. Given historical day fixtures (BIRD crowded, low-float 15×, BS resistance, BYND-like FRD), system emits **same allow/deny** as rule table.  
2. No GUS order when PM vol **> 50M**.  
3. No FRD full size on day-1 exhaustion (≤25%).  
4. BS size never exceeds 10% float and 1% volume caps.  
5. Journal can reproduce yearly expectancy math from stored trades.  
6. Sector excludes prevent biotech/energy/China candidates in default config.

---

## 15. Suggested implementation phases

| Phase | Deliverable |
|-------|-------------|
| P0 | Glossary + data adapters + hard filters + journal |
| P1 | GUS detector + paper execution |
| P2 | BS dollar-block + ratio sizing |
| P3 | FRD run state machine + exhaustion model (VALIDATE table) |
| P4 | Cross-strategy priority + crowded handoff |
| P5 | Live micro-size + KPI dashboards |

---

## 16. Traceability: MD vs this SRS

| MD section | Covered here | Gap fill |
|------------|--------------|----------|
| Gap-up criteria table | §5–6 | Push %, volume timing, scale-in, float variants |
| Bounce criteria table | §7 | Correct dollar-block formula, open dump, types |
| First red criteria table | §8 | Initial mcap, DV progression, day-2 rules, 50% rule |
| Psychology / stats | §9.3, §12 | Yearly simulation requirement |
| Examples | §14 fixtures | Crowded / low float / BS / FRD |

---

*End of SRS v0.1*
