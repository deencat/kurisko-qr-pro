"use client";

import { useEffect, useRef } from "react";
import type { KuriskoAlert } from "@/lib/kurisko/snapshot/types";

function playBeep(freq: number, durationMs: number, volume = 0.15) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.value = volume;
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, durationMs);
  } catch {
    /* autoplay policy or no audio */
  }
}

function playSignalAlert(action: "BUY" | "SELL", stage: string) {
  if (stage === "SIGNAL") {
    playBeep(action === "BUY" ? 880 : 440, 280, 0.2);
    setTimeout(() => playBeep(action === "BUY" ? 1100 : 330, 200, 0.15), 300);
  } else if (stage === "CONFIRM") {
    playBeep(action === "BUY" ? 660 : 520, 150, 0.12);
  }
}

/** Play audio when new CONFIRM/SIGNAL alerts arrive. */
export function useKuriskoAudioAlerts(alerts: KuriskoAlert[], enabled: boolean) {
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!enabled || alerts.length === 0) return;

    if (!primedRef.current) {
      for (const a of alerts) seenRef.current.add(a.id);
      primedRef.current = true;
      return;
    }

    for (const alert of alerts) {
      if (seenRef.current.has(alert.id)) continue;
      seenRef.current.add(alert.id);
      if (alert.toStage === "SIGNAL" || alert.toStage === "CONFIRM") {
        playSignalAlert(alert.action, alert.toStage);
      }
    }
  }, [alerts, enabled]);
}

export function playTestAlert() {
  playSignalAlert("BUY", "SIGNAL");
}
