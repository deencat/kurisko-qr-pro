import type { ReactNode } from "react";

/** Full-bleed QR Pro dashboard (breaks out of default max-w-7xl main). */
export default function QrScannerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="qr-pro-root relative left-1/2 min-h-[calc(100vh-4rem)] w-screen max-w-[100vw] -translate-x-1/2 bg-[#060d18] text-slate-100">
      {children}
    </div>
  );
}
