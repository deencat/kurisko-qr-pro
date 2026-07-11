"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [{ href: "/day-trade/qr-scanner", label: "QR Scanner" }];

export function AppNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/day-trade/qr-scanner")) return null;

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-cyan-400">Kurisko K1</p>
          <h1 className="text-lg font-semibold">QR Pro Scanner</h1>
        </div>
        <nav className="flex gap-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded border border-slate-700 px-3 py-1 text-sm",
                pathname.startsWith(href) && "border-cyan-500/50 text-cyan-200"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
