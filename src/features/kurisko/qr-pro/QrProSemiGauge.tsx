"use client";

interface Props {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  sublabel?: string;
  size?: "sm" | "md" | "lg";
  zones?: { start: number; end: number; color: string }[];
}

/** Semi-circular gauge matching QR Pro reference (needle + arc zones). */
export function QrProSemiGauge({
  value,
  min = 0,
  max = 100,
  label,
  sublabel,
  size = "md",
  zones = [
    { start: 0, end: 33, color: "#f87171" },
    { start: 33, end: 66, color: "#fbbf24" },
    { start: 66, end: 100, color: "#34d399" },
  ],
}: Props) {
  const dim = size === "lg" ? 160 : size === "md" ? 120 : 80;
  const cx = 100;
  const cy = 95;
  const r = 72;
  const clamped = Math.min(max, Math.max(min, value));
  const pct = (clamped - min) / (max - min);
  const needleAngle = Math.PI * (1 - pct);
  const nx = cx + Math.cos(needleAngle) * (r - 8);
  const ny = cy - Math.sin(needleAngle) * (r - 8);

  const arcPath = (startPct: number, endPct: number) => {
    const a0 = Math.PI * (1 - startPct);
    const a1 = Math.PI * (1 - endPct);
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy - Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy - Math.sin(a1) * r;
    const large = endPct - startPct > 0.5 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };

  return (
    <div className="relative mx-auto text-center" style={{ width: dim, height: dim * 0.72 }}>
      <svg viewBox="0 0 200 110" className="h-full w-full">
        {zones.map((z, i) => (
          <path
            key={i}
            d={arcPath((z.start - min) / (max - min), (z.end - min) / (max - min))}
            fill="none"
            stroke={z.color}
            strokeWidth="14"
            strokeLinecap="butt"
            opacity={0.85}
          />
        ))}
        <circle cx={cx} cy={cy} r="4" fill="#94a3b8" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={nx} cy={ny} r="3" fill="#f8fafc" />
      </svg>
      <div className="absolute inset-x-0 bottom-0">
        <p className="font-mono text-lg font-black leading-none text-white">{Math.round(clamped)}</p>
        {label ? <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p> : null}
        {sublabel ? <p className="text-[8px] text-slate-500">{sublabel}</p> : null}
      </div>
    </div>
  );
}
