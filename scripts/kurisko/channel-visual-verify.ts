/**
 * Offline channel visual verifier — cached Capital bars → sloping rail overlays.
 *
 * Loads GOLD / US100 (or --symbol) from data/kurisko/capital/, builds 5m episodes,
 * audits geometry vs RAG invariants, writes HTML (+ optional PNG via matplotlib).
 *
 * Examples:
 *   npx tsx --import ./scripts/kurisko/stub-server-only.mjs scripts/kurisko/channel-visual-verify.ts
 *   npm run k1:channel-visual -- --symbol GOLD --windows 3
 *   npm run k1:channel-visual -- --no-png
 *
 * No live trading / no network fetch (cache-only unless --fetch).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadCapital1mCache } from "./capital-fetch";
import {
  aggregateCandles,
  bodyHigh,
  bodyLow,
  buildChannelFrom123,
  channelRailsOriented,
  channelValidDown,
  channelValidUp,
  collectStructurePivots,
  type ChannelPivot123,
} from "../../src/lib/kurisko/indicators/channel-geometry";
import {
  buildChannelEpisodes,
  episodesForChart,
  type ChannelEpisode,
} from "../../src/lib/kurisko/indicators/channel-episodes";
import type { LighterCandle } from "../../src/lib/lighter/client";

const MS_5M = 5 * 60 * 1000;
const OUT_DIR = path.join(process.cwd(), "artifacts", "kurisko", "channels");
const DRAW_PY = path.join(process.cwd(), "scripts", "kurisko", "channel_visual_draw.py");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function dayMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

function fmtIso(t: number): string {
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sliceByTime(candles: LighterCandle[], start: number, end: number): LighterCandle[] {
  return candles.filter((c) => c.t >= start && c.t <= end);
}

interface GeometryAudit {
  episodeIndex: number;
  kind: "down" | "up";
  tConfirm: string;
  slopeDeg: number;
  bodyPivots: boolean;
  parallel: boolean;
  lowerBelowUpper: boolean;
  channelValidSlope: boolean;
  lockSpanBars: number;
  notes: string[];
}

function auditEpisode(ep: ChannelEpisode, candles5m: LighterCandle[]): GeometryAudit {
  const notes: string[] = [];
  const piv = ep.pivots;

  // Body pivots: prices should match body high/low on their bars (within eps).
  let bodyPivots = true;
  const checkBody = (t: number, price: number, expect: "high" | "low") => {
    const bar = candles5m.find((c) => c.t === t);
    if (!bar) {
      notes.push(`pivot bar missing @ ${fmtIso(t)}`);
      bodyPivots = false;
      return;
    }
    const ref = expect === "high" ? bodyHigh(bar) : bodyLow(bar);
    const eps = Math.max(1e-6, Math.abs(ref) * 1e-8);
    if (Math.abs(ref - price) > eps) {
      notes.push(`pivot price ${price} ≠ body ${expect} ${ref} @ ${fmtIso(t)}`);
      bodyPivots = false;
    }
  };
  if (piv.kind === "down") {
    checkBody(piv.a.t, piv.a.price, "high");
    checkBody(piv.b.t, piv.b.price, "low");
    checkBody(piv.c.t, piv.c.price, "high");
  } else {
    checkBody(piv.a.t, piv.a.price, "low");
    checkBody(piv.b.t, piv.b.price, "high");
    checkBody(piv.c.t, piv.c.price, "low");
  }

  // Parallel + orientation via rebuild from 1-2-3.
  const rebuilt = buildChannelFrom123(piv);
  const parallel =
    rebuilt.valid &&
    Math.abs(rebuilt.upperAt(piv.a.t) - ep.upperAt(piv.a.t)) < 1e-6 * Math.max(1, Math.abs(piv.a.price)) &&
    Math.abs(rebuilt.lowerAt(piv.b.t) - ep.lowerAt(piv.b.t)) < 1e-6 * Math.max(1, Math.abs(piv.b.price));
  if (!rebuilt.valid) notes.push("rebuild from 1-2-3 rejected (crossed?)");
  if (!parallel && rebuilt.valid) notes.push("episode rails ≠ rebuild from pivots");

  const lowerBelowUpper = channelRailsOriented(ep.upperAt, ep.lowerAt, [
    piv.a.t,
    piv.b.t,
    piv.c.t,
    ep.tConfirm,
    ep.tEnd,
  ]);
  if (!lowerBelowUpper) notes.push("lower >= upper somewhere on span");

  const asLines = {
    valid: true as const,
    direction: ep.kind,
    upperAt: ep.upperAt,
    lowerAt: ep.lowerAt,
    midAt: (t: number) => (ep.upperAt(t) + ep.lowerAt(t)) / 2,
    pivots: piv,
    slopeDeg: ep.slopeDeg,
  };
  const channelValidSlope =
    ep.kind === "down" ? channelValidDown(asLines) : channelValidUp(asLines);
  if (!channelValidSlope) notes.push(`slopeDeg=${ep.slopeDeg.toFixed(2)} outside 15–40 or orientation fail`);

  const confirmIdx = candles5m.findIndex((c) => c.t === ep.tConfirm);
  const endIdx = candles5m.findIndex((c) => c.t === ep.tEnd);
  const lockSpanBars =
    confirmIdx >= 0 && endIdx >= confirmIdx ? endIdx - confirmIdx + 1 : 0;

  return {
    episodeIndex: -1,
    kind: ep.kind,
    tConfirm: fmtIso(ep.tConfirm),
    slopeDeg: ep.slopeDeg,
    bodyPivots,
    parallel: !!parallel && rebuilt.valid,
    lowerBelowUpper,
    channelValidSlope,
    lockSpanBars,
    notes,
  };
}

/** Prefer K1 slope-ok oriented episodes; fall back to recent oriented locks. */
function pickWindows(
  episodes: ChannelEpisode[],
  _candles5m: LighterCandle[],
  maxWindows: number
): { ep: ChannelEpisode; chartStart: number; chartEnd: number; label: string }[] {
  const usable = episodes.filter((ep) => ep.tEnd > ep.tConfirm && ep.pivots);
  const oriented = usable.filter((ep) =>
    channelRailsOriented(ep.upperAt, ep.lowerAt, [ep.pivots.a.t, ep.pivots.b.t, ep.pivots.c.t])
  );
  const slopeOk = oriented.filter((ep) => {
    const deg = Math.abs(ep.slopeDeg);
    return deg >= 15 && deg <= 40;
  });
  const pool = (slopeOk.length >= maxWindows ? slopeOk : oriented.length ? oriented : usable).sort(
    (a, b) => b.tConfirm - a.tConfirm
  );
  // Diversify up/down so gallery isn't one-sided.
  const picked: ChannelEpisode[] = [];
  const take = (kind: "up" | "down" | null, n: number) => {
    for (const ep of pool) {
      if (picked.length >= maxWindows || n <= 0) break;
      if (picked.includes(ep)) continue;
      if (kind && ep.kind !== kind) continue;
      picked.push(ep);
      n--;
    }
  };
  const half = Math.max(1, Math.ceil(maxWindows / 2));
  take("down", half);
  take("up", half);
  take(null, maxWindows);
  if (picked.length === 0 && usable[usable.length - 1]) picked.push(usable[usable.length - 1]!);

  return picked.map((ep, i) => {
    const padBefore = dayMs(0.12); // ~3h context before P1
    const padAfter = dayMs(0.08);
    const chartStart = Math.min(ep.pivots.a.t, ep.tConfirm) - padBefore;
    const chartEnd = Math.max(ep.tEnd, ep.pivots.c.t) + padAfter;
    const label = `${fmtIso(ep.tConfirm).slice(0, 16).replace(/[:T]/g, "-")}_${ep.kind}`;
    return { ep, chartStart, chartEnd, label: `${String(i + 1).padStart(2, "0")}_${label}` };
  });
}

/** Primary overlay for the audited episode: full formation P1 → lock → forward end. */
function primaryRailsFromEpisode(ep: ChannelEpisode): {
  tStart: number;
  tEnd: number;
  upperStart: number;
  upperEnd: number;
  lowerStart: number;
  lowerEnd: number;
  highlight: boolean;
} {
  const tStart = ep.pivots.a.t;
  const tEnd = Math.max(ep.tEnd, ep.pivots.c.t, ep.tConfirm);
  return {
    tStart,
    tEnd,
    upperStart: ep.upperAt(tStart),
    upperEnd: ep.upperAt(tEnd),
    lowerStart: ep.lowerAt(tStart),
    lowerEnd: ep.lowerAt(tEnd),
    highlight: true,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtmlSvg(opts: {
  symbol: string;
  title: string;
  bars5m: LighterCandle[];
  episode: ChannelEpisode;
  audit: GeometryAudit;
  draws: ReturnType<typeof episodesForChart>;
}): string {
  const { symbol, title, bars5m, episode, audit, draws } = opts;
  const W = 1100;
  const H = 640;
  const padL = 64;
  const padR = 24;
  const padT = 48;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars5m) {
    lo = Math.min(lo, b.l);
    hi = Math.max(hi, b.h);
  }
  for (const d of draws) {
    lo = Math.min(lo, d.lowerStart, d.lowerEnd, d.p1.price, d.p2.price, d.p3.price);
    hi = Math.max(hi, d.upperStart, d.upperEnd, d.p1.price, d.p2.price, d.p3.price);
  }
  const span = Math.max(hi - lo, 1e-9);
  const yPad = span * 0.06;
  lo -= yPad;
  hi += yPad;

  const t0 = bars5m[0]!.t;
  const t1 = bars5m[bars5m.length - 1]!.t;
  const tSpan = Math.max(t1 - t0, 1);

  const xOf = (t: number) => padL + ((t - t0) / tSpan) * plotW;
  const yOf = (p: number) => padT + ((hi - p) / (hi - lo)) * plotH;

  const candles: string[] = [];
  const barW = Math.max(1.2, (plotW / Math.max(bars5m.length, 1)) * 0.7);
  for (const b of bars5m) {
    const x = xOf(b.t);
    const up = b.c >= b.o;
    const color = up ? "#16a34a" : "#dc2626";
    const yH = yOf(b.h);
    const yL = yOf(b.l);
    const yO = yOf(b.o);
    const yC = yOf(b.c);
    candles.push(
      `<line x1="${x}" y1="${yH}" x2="${x}" y2="${yL}" stroke="${color}" stroke-width="1"/>` +
        `<rect x="${x - barW / 2}" y="${Math.min(yO, yC)}" width="${barW}" height="${Math.max(1, Math.abs(yC - yO))}" fill="${color}"/>`
    );
  }

  const rails: string[] = [];
  for (const d of draws) {
    const midS = (d.upperStart + d.lowerStart) / 2;
    const midE = (d.upperEnd + d.lowerEnd) / 2;
    const alpha = d.highlight ? 0.95 : 0.35;
    const uw = d.highlight ? 2.4 : 1.2;
    rails.push(
      `<line x1="${xOf(d.tStart)}" y1="${yOf(d.upperStart)}" x2="${xOf(d.tEnd)}" y2="${yOf(d.upperEnd)}" stroke="rgba(253,224,71,${alpha})" stroke-width="${uw}"/>` +
        `<line x1="${xOf(d.tStart)}" y1="${yOf(midS)}" x2="${xOf(d.tEnd)}" y2="${yOf(midE)}" stroke="rgba(148,163,184,${alpha})" stroke-width="${uw * 0.8}" stroke-dasharray="4 3"/>` +
        `<line x1="${xOf(d.tStart)}" y1="${yOf(d.lowerStart)}" x2="${xOf(d.tEnd)}" y2="${yOf(d.lowerEnd)}" stroke="rgba(34,211,238,${alpha})" stroke-width="${uw}"/>`
    );
  }

  const markers: string[] = [];
  const mark = (label: string, t: number, price: number, color: string) => {
    const x = xOf(t);
    const y = yOf(price);
    markers.push(
      `<circle cx="${x}" cy="${y}" r="5" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>` +
        `<text x="${x + 8}" y="${y - 8}" fill="${color}" font-size="12" font-family="ui-sans-serif,system-ui">${label}</text>`
    );
  };
  mark("P1", episode.pivots.a.t, episode.pivots.a.price, "#f472b6");
  mark("P2", episode.pivots.b.t, episode.pivots.b.price, "#a78bfa");
  mark("P3", episode.pivots.c.t, episode.pivots.c.price, "#fb923c");

  // Lock start tick
  markers.push(
    `<line x1="${xOf(episode.tConfirm)}" y1="${padT}" x2="${xOf(episode.tConfirm)}" y2="${padT + plotH}" stroke="rgba(250,250,250,0.25)" stroke-dasharray="3 4"/>` +
      `<text x="${xOf(episode.tConfirm) + 4}" y="${padT + 14}" fill="#e2e8f0" font-size="11" font-family="ui-sans-serif,system-ui">lock</text>`
  );

  const pass =
    audit.bodyPivots && audit.parallel && audit.lowerBelowUpper
      ? "PASS geometry"
      : "FAIL geometry";
  const passColor = pass.startsWith("PASS") ? "#4ade80" : "#f87171";
  const checks = [
    `body pivots: ${audit.bodyPivots ? "yes" : "NO"}`,
    `parallel rebuild: ${audit.parallel ? "yes" : "NO"}`,
    `lower < upper: ${audit.lowerBelowUpper ? "yes" : "NO"}`,
    `slope 15–40: ${audit.channelValidSlope ? "yes" : "no (" + audit.slopeDeg.toFixed(1) + "°)"}`,
    `lock bars: ${audit.lockSpanBars}`,
  ].join(" · ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <style>
    body { margin: 0; background: #0b1220; color: #e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .wrap { max-width: 1140px; margin: 0 auto; padding: 16px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
    .meta { font-size: 13px; color: #94a3b8; margin-bottom: 12px; line-height: 1.5; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #1e293b; color: ${passColor}; font-weight: 600; }
    svg { width: 100%; height: auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; }
    .notes { margin-top: 12px; font-size: 12px; color: #fbbf24; }
    .legend { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .legend span { margin-right: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeXml(symbol)} · ${escapeXml(title)}</h1>
    <div class="meta">
      <span class="badge">${pass}</span>
      ${escapeXml(checks)}
      <br/>Episode ${episode.kind} · confirm ${escapeXml(audit.tConfirm)} · slope ${episode.slopeDeg.toFixed(2)}°
    </div>
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#0f172a"/>
      <text x="${padL}" y="28" fill="#e2e8f0" font-size="14" font-family="ui-sans-serif,system-ui">5m bodies + sloping upper / mid / lower</text>
      ${candles.join("\n")}
      ${rails.join("\n")}
      ${markers.join("\n")}
      <text x="${padL}" y="${H - 12}" fill="#64748b" font-size="11" font-family="ui-sans-serif,system-ui">${escapeXml(fmtIso(t0))} → ${escapeXml(fmtIso(t1))}</text>
    </svg>
    <div class="legend">
      <span style="color:#fde047">■ upper</span>
      <span style="color:#94a3b8">■ mid</span>
      <span style="color:#22d3ee">■ lower</span>
      <span style="color:#f472b6">● P1</span>
      <span style="color:#a78bfa">● P2</span>
      <span style="color:#fb923c">● P3</span>
    </div>
    ${
      audit.notes.length
        ? `<div class="notes">Notes: ${escapeXml(audit.notes.join("; "))}</div>`
        : ""
    }
  </div>
</body>
</html>`;
}

interface DrawPayload {
  symbol: string;
  title: string;
  outPng: string;
  bars: { t: number; o: number; h: number; l: number; c: number }[];
  rails: {
    tStart: number;
    tEnd: number;
    upperStart: number;
    upperEnd: number;
    lowerStart: number;
    lowerEnd: number;
    highlight: boolean;
  }[];
  pivots: ChannelPivot123;
  tConfirm: number;
}

function writePng(payload: DrawPayload): { ok: boolean; detail: string } {
  if (!fs.existsSync(DRAW_PY)) {
    return { ok: false, detail: "draw helper missing" };
  }
  const tmp = payload.outPng + ".json";
  fs.writeFileSync(tmp, JSON.stringify(payload));
  const r = spawnSync("python3", [DRAW_PY, tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (r.status !== 0) {
    return { ok: false, detail: (r.stderr || r.stdout || "png failed").slice(0, 400) };
  }
  return { ok: true, detail: payload.outPng };
}

async function runSymbol(symbol: string, opts: { windows: number; wantPng: boolean; days?: number }) {
  const loaded = loadCapital1mCache(symbol);
  if (loaded.candles.length < 500) {
    throw new Error(
      `${symbol}: need cached 1m bars under data/kurisko/capital/${symbol}_1m.json (got ${loaded.candles.length})`
    );
  }

  // Use a recent slice for speed (default last ~21 calendar days of 1m → 5m).
  const last = loaded.candles[loaded.candles.length - 1]!.t;
  const days = opts.days ?? 21;
  const slice1m = sliceByTime(loaded.candles, last - dayMs(days), last);
  const candles5m = aggregateCandles(slice1m, MS_5M);
  const episodes = buildChannelEpisodes(candles5m, MS_5M);
  const pivots = collectStructurePivots(candles5m);

  const audits: GeometryAudit[] = [];
  let failCount = 0;
  for (let i = 0; i < episodes.length; i++) {
    const a = auditEpisode(episodes[i]!, candles5m);
    a.episodeIndex = i;
    audits.push(a);
    if (!a.bodyPivots || !a.parallel || !a.lowerBelowUpper) failCount++;
  }

  const windows = pickWindows(episodes, candles5m, opts.windows);
  const written: string[] = [];

  for (const w of windows) {
    const bars = sliceByTime(candles5m, w.chartStart, w.chartEnd);
    if (bars.length < 10) continue;
    // Context chain (faint) + primary audited rails (bright, full P1→end).
    const chainDraws = episodesForChart(
      episodes,
      bars[0]!.t,
      bars[bars.length - 1]!.t,
      w.ep.tConfirm,
      6,
      w.ep.pivots.b.price
    ).map((d) => ({ ...d, highlight: false }));
    const primary = primaryRailsFromEpisode(w.ep);
    const draws = [
      ...chainDraws.filter(
        (d) =>
          !(
            Math.abs(d.tConfirm - w.ep.tConfirm) < 1 &&
            Math.abs(d.upperStart - primary.upperStart) < 1e-6
          )
      ),
      {
        kind: w.ep.kind,
        tConfirm: w.ep.tConfirm,
        tStart: primary.tStart,
        tEnd: primary.tEnd,
        slopeDeg: w.ep.slopeDeg,
        upperStart: primary.upperStart,
        upperEnd: primary.upperEnd,
        lowerStart: primary.lowerStart,
        lowerEnd: primary.lowerEnd,
        p1: w.ep.pivots.a,
        p2: w.ep.pivots.b,
        p3: w.ep.pivots.c,
        highlight: true,
      },
    ];
    const audit = auditEpisode(w.ep, candles5m);
    const base = `${symbol}_${w.label}`;
    const htmlPath = path.join(OUT_DIR, `${base}.html`);
    const html = renderHtmlSvg({
      symbol,
      title: w.label,
      bars5m: bars,
      episode: w.ep,
      audit,
      draws,
    });
    fs.writeFileSync(htmlPath, html);
    written.push(htmlPath);

    if (opts.wantPng) {
      const pngPath = path.join(OUT_DIR, `${base}.png`);
      const result = writePng({
        symbol,
        title: `${symbol} ${w.label} · slope ${w.ep.slopeDeg.toFixed(1)}°`,
        outPng: pngPath,
        bars: bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })),
        rails: [
          ...chainDraws.map((d) => ({
            tStart: d.tStart,
            tEnd: d.tEnd,
            upperStart: d.upperStart,
            upperEnd: d.upperEnd,
            lowerStart: d.lowerStart,
            lowerEnd: d.lowerEnd,
            highlight: false,
          })),
          primary,
        ],
        pivots: w.ep.pivots,
        tConfirm: w.ep.tConfirm,
      });
      if (result.ok) written.push(pngPath);
      else console.warn(`PNG skip ${base}: ${result.detail}`);
    }
  }

  // Index page for the symbol
  const indexBits = written
    .filter((p) => p.endsWith(".html"))
    .map((p) => {
      const name = path.basename(p);
      const png = name.replace(/\.html$/, ".png");
      const pngExists = fs.existsSync(path.join(OUT_DIR, png));
      return `<li><a href="${name}">${name}</a>${pngExists ? ` · <a href="${png}">png</a>` : ""}</li>`;
    });
  fs.writeFileSync(
    path.join(OUT_DIR, `${symbol}_index.html`),
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${symbol} channel visuals</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0b1220;color:#e2e8f0;padding:24px}a{color:#38bdf8}</style>
</head><body><h1>${symbol} channel overlays</h1>
<p>Slice: last ${days}d of cache · 5m bars=${candles5m.length} · episodes=${episodes.length} · geometry fails=${failCount} / ${episodes.length}</p>
<ul>${indexBits.join("\n")}</ul>
</body></html>`
  );

  return {
    symbol,
    cacheBars1m: loaded.candles.length,
    sliceBars1m: slice1m.length,
    bars5m: candles5m.length,
    pivots: pivots.length,
    episodes: episodes.length,
    geometryFails: failCount,
    slopeOkCount: audits.filter((a) => a.channelValidSlope).length,
    written,
    sampleAudits: audits.slice(-5),
  };
}

async function main() {
  const symbols = (arg("--symbol") ?? "GOLD,US100")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const windows = Number(arg("--windows") ?? "3");
  const days = Number(arg("--days") ?? "21");
  const wantPng = !has("--no-png");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summaries = [];
  for (const symbol of symbols) {
    console.log(`\n=== ${symbol} visual verify (cache-only, last ${days}d) ===`);
    const s = await runSymbol(symbol, {
      windows: Number.isFinite(windows) ? windows : 3,
      wantPng,
      days: Number.isFinite(days) ? days : 21,
    });
    summaries.push(s);
    console.log(
      JSON.stringify(
        {
          symbol: s.symbol,
          episodes: s.episodes,
          geometryFails: s.geometryFails,
          slopeOkCount: s.slopeOkCount,
          files: s.written.map((p) => path.relative(process.cwd(), p)),
        },
        null,
        2
      )
    );
  }

  const summaryPath = path.join(OUT_DIR, "summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        outDir: path.relative(process.cwd(), OUT_DIR),
        symbols: summaries,
      },
      null,
      2
    )
  );

  // Root gallery
  const links = symbols
    .map((s) => `<li><a href="${s}_index.html">${s} index</a></li>`)
    .join("\n");
  fs.writeFileSync(
    path.join(OUT_DIR, "index.html"),
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Kurisko channel visual check</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0b1220;color:#e2e8f0;padding:24px}a{color:#38bdf8}</style>
</head><body>
<h1>Kurisko channel visual check</h1>
<p>Open a symbol index, then an HTML overlay. Look for sloping yellow/cyan rails with P1/P2/P3 markers — not flat horizontals.</p>
<ul>${links}</ul>
<p>See <code>docs/CHANNEL_VISUAL_CHECK.md</code>.</p>
</body></html>`
  );

  console.log(`\nWrote gallery → ${path.relative(process.cwd(), OUT_DIR)}/index.html`);
  console.log(`Summary → ${path.relative(process.cwd(), summaryPath)}`);

  const totalFails = summaries.reduce((n, s) => n + s.geometryFails, 0);
  if (totalFails > 0) {
    console.error(`Geometry failures: ${totalFails}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
