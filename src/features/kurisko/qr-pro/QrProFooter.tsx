"use client";

import { Radio } from "lucide-react";

export function QrProFooter() {
  return (
    <footer className="flex items-center justify-between border-t border-slate-800 bg-black px-3 py-1">
      <span className="text-[9px] font-black tracking-widest text-slate-600">METS · QR PRO</span>
      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-500">
        <Radio className="h-3 w-3" />
        DTR LIVE
      </span>
    </footer>
  );
}
