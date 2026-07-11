"use client";

import type { ReactNode } from "react";

export function QrProWidgetCard({
  title,
  subtitle,
  headerClass,
  loading,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  headerClass: string;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded border border-slate-700/80 bg-[#0a1628] ${className ?? ""}`}>
      <div className={`px-2 py-1 ${headerClass}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wide">{title}</span>
          {loading ? <span className="text-[8px] opacity-70">…</span> : null}
        </div>
        {subtitle ? <p className="text-[7px] font-medium opacity-80">{subtitle}</p> : null}
      </div>
      <div className="p-1.5">{children}</div>
    </div>
  );
}
