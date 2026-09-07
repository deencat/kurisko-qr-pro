"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { KuriskoChannelEpisodeDraw } from "@/lib/kurisko/backtest/chart-window-types";
import { episodeToRailSeries } from "@/lib/kurisko/backtest/channel-chart-draw";
import type { KuriskoChartCandle, KuriskoKeyLevels } from "@/lib/kurisko/snapshot/types";

interface Props {
  bars: KuriskoChartCandle[];
  keyLevels?: KuriskoKeyLevels | null;
  /** Prefer sloping parallel rails over flat keyLevels when present. */
  channelEpisodes?: KuriskoChannelEpisodeDraw[] | null;
  pivot?: number | null;
  showTimeScale?: boolean;
  height?: number;
  className?: string;
}

export function QrProMiniChart({
  bars,
  keyLevels,
  channelEpisodes,
  pivot,
  showTimeScale = false,
  height = 72,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const levelRefs = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      height,
      layout: { background: { color: "#0a1628" }, textColor: "#94a3b8" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1e293b33" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, visible: false, timeVisible: false, secondsVisible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    });

    const candles = chart.addCandlestickSeries({
      upColor: "#34d399",
      downColor: "#f87171",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
    });

    chartRef.current = chart;
    candleRef.current = candles;

    const ro = new ResizeObserver(() => {
      const w = ref.current?.clientWidth ?? 0;
      if (w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      levelRefs.current = [];
    };
  }, [height]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: {
        borderVisible: false,
        visible: showTimeScale,
        timeVisible: showTimeScale,
        secondsVisible: false,
      },
    });
  }, [showTimeScale]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!candleRef.current || !chart || bars.length === 0) return;

    const toTime = (t: number) => Math.floor(t / 1000) as UTCTimestamp;
    candleRef.current.setData(
      bars.map((b) => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c }))
    );

    levelRefs.current.forEach((s) => chart.removeSeries(s));
    levelRefs.current = [];

    if (pivot != null && pivot > 0) {
      const last = bars[bars.length - 1]!;
      const first = bars[0]!;
      const t0 = toTime(first.t);
      const t1 = toTime(last.t);
      const pivotLine = chart.addLineSeries({
        color: "#c4b5fd",
        lineWidth: 2,
        lineStyle: 0,
        priceLineVisible: true,
        lastValueVisible: true,
        title: "PVOT",
      });
      pivotLine.setData([
        { time: t0, value: pivot },
        { time: t1, value: pivot },
      ]);
      levelRefs.current.push(pivotLine);
    }

    const episodes = channelEpisodes?.filter((ep) => ep.tEnd > ep.tStart) ?? [];
    if (episodes.length > 0) {
      for (const ep of episodes) {
        const series = episodeToRailSeries(ep);
        if (!series) continue;
        const highlight = ep.highlight;
        const upperColor = highlight ? "#fde047cc" : "#fde04755";
        const midColor = highlight ? "#94a3b8aa" : "#94a3b844";
        const lowerColor = highlight ? "#22d3eecc" : "#22d3ee55";
        const width = highlight ? 2 : 1;

        for (const [pts, color] of [
          [series.upper, upperColor],
          [series.mid, midColor],
          [series.lower, lowerColor],
        ] as const) {
          const line = chart.addLineSeries({
            color,
            lineWidth: width as 1 | 2,
            lineStyle: highlight ? 0 : 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          line.setData(pts.map((p) => ({ time: toTime(p.t), value: p.value })));
          levelRefs.current.push(line);
        }

        // P1 / P2 / P3 markers on the highlighted episode only.
        if (highlight) {
          const markers = [
            { t: ep.p1.t, price: ep.p1.price, label: "1", color: "#fde047" },
            { t: ep.p2.t, price: ep.p2.price, label: "2", color: "#22d3ee" },
            { t: ep.p3.t, price: ep.p3.price, label: "3", color: "#a78bfa" },
          ];
          for (const m of markers) {
            if (m.t < bars[0]!.t || m.t > bars[bars.length - 1]!.t) continue;
            const mark = chart.addLineSeries({
              color: m.color,
              lineWidth: 1,
              lineStyle: 0,
              priceLineVisible: false,
              lastValueVisible: false,
              title: m.label,
            });
            // Tiny horizontal tick so lightweight-charts renders a visible point.
            const dt = 60_000;
            mark.setData([
              { time: toTime(m.t - dt), value: m.price },
              { time: toTime(m.t + dt), value: m.price },
            ]);
            levelRefs.current.push(mark);
          }
        }
      }
    } else if (keyLevels) {
      // Fallback: scalar levels at "now" (no episode payload) — still horizontal.
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
        const line = chart.addLineSeries({
          color: lvl.color,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        line.setData([
          { time: t0, value: lvl.value },
          { time: t1, value: lvl.value },
        ]);
        levelRefs.current.push(line);
      }
    }

    chart.timeScale().fitContent();
  }, [bars, keyLevels, channelEpisodes, pivot]);

  return <div ref={ref} className={className ?? "w-full"} />;
}
