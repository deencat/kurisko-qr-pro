#!/usr/bin/env python3
"""Render one channel overlay PNG from JSON payload (offline visual verifier)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: channel_visual_draw.py <payload.json>", file=sys.stderr)
        return 2

    payload = json.loads(Path(sys.argv[1]).read_text())
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.patches import Rectangle
    except ImportError as exc:
        print(f"matplotlib required: {exc}", file=sys.stderr)
        return 1

    bars = payload["bars"]
    if not bars:
        print("no bars", file=sys.stderr)
        return 1

    fig, ax = plt.subplots(figsize=(12, 6.5), dpi=120)
    fig.patch.set_facecolor("#0f172a")
    ax.set_facecolor("#0f172a")

    times = [b["t"] for b in bars]
    xs = list(range(len(bars)))
    width = 0.6

    for i, b in enumerate(bars):
        color = "#16a34a" if b["c"] >= b["o"] else "#dc2626"
        ax.plot([i, i], [b["l"], b["h"]], color=color, linewidth=0.8, solid_capstyle="round")
        bottom = min(b["o"], b["c"])
        height = max(abs(b["c"] - b["o"]), (max(b["h"] for b in bars) - min(b["l"] for b in bars)) * 1e-4)
        ax.add_patch(
            Rectangle((i - width / 2, bottom), width, height, facecolor=color, edgecolor=color, linewidth=0)
        )

    def x_of(t: float) -> float:
        if t <= times[0]:
            return 0.0
        if t >= times[-1]:
            return float(len(times) - 1)
        # linear in time between neighboring bars
        for j in range(1, len(times)):
            if times[j] >= t:
                t0, t1 = times[j - 1], times[j]
                if t1 == t0:
                    return float(j)
                return (j - 1) + (t - t0) / (t1 - t0)
        return float(len(times) - 1)

    for rail in payload["rails"]:
        alpha = 0.95 if rail["highlight"] else 0.35
        lw = 2.2 if rail["highlight"] else 1.1
        x0, x1 = x_of(rail["tStart"]), x_of(rail["tEnd"])
        mid0 = (rail["upperStart"] + rail["lowerStart"]) / 2
        mid1 = (rail["upperEnd"] + rail["lowerEnd"]) / 2
        ax.plot([x0, x1], [rail["upperStart"], rail["upperEnd"]], color="#fde047", alpha=alpha, lw=lw)
        ax.plot([x0, x1], [mid0, mid1], color="#94a3b8", alpha=alpha, lw=lw * 0.85, linestyle="--")
        ax.plot([x0, x1], [rail["lowerStart"], rail["lowerEnd"]], color="#22d3ee", alpha=alpha, lw=lw)

    piv = payload["pivots"]
    for label, pt, color in (
        ("P1", piv["a"], "#f472b6"),
        ("P2", piv["b"], "#a78bfa"),
        ("P3", piv["c"], "#fb923c"),
    ):
        x = x_of(pt["t"])
        ax.scatter([x], [pt["price"]], s=48, c=color, zorder=5, edgecolors="#0f172a", linewidths=0.8)
        ax.annotate(label, (x, pt["price"]), textcoords="offset points", xytext=(6, 6), color=color, fontsize=9)

    lock_x = x_of(payload["tConfirm"])
    ax.axvline(lock_x, color="#e2e8f0", alpha=0.25, linestyle=":", linewidth=1)
    ax.set_title(payload.get("title", "channel"), color="#e2e8f0", fontsize=11, loc="left")
    ax.tick_params(colors="#94a3b8")
    for spine in ax.spines.values():
        spine.set_color("#334155")
    ax.set_xlim(-1, len(bars))
    ax.set_ylabel("price", color="#94a3b8")

    # sparse time ticks
    n = len(bars)
    ticks = [0, n // 2, n - 1] if n > 2 else list(range(n))
    ax.set_xticks(ticks)
    ax.set_xticklabels(
        [datetime.fromtimestamp(bars[i]["t"] / 1000, tz=timezone.utc).strftime("%m-%d %H:%M") for i in ticks],
        color="#94a3b8",
        fontsize=8,
    )

    out = Path(payload["outPng"])
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
