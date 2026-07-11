"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { KuriskoChartCandle, KuriskoKeyLevels } from "@/lib/kurisko/snapshot/types";

interface Props {
  bars: KuriskoChartCandle[];
  keyLevels?: KuriskoKeyLevels | null;
  pivot?: number | null;
  showTimeScale?: boolean;
  height?: number;
  className?: string;
}

export function QrProMiniChart({
  bars,
  keyLevels,
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
      layout: { background: { color: "#0a1628" }, textColor: "#64748b" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1e293b33" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderVisible: false, visible: showTimeScale, timeVisible: showTimeScale },
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
  }, [bars, keyLevels, pivot]);

  return <div ref={ref} className={className ?? "w-full"} />;
}
