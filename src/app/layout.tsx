import "@/app/globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AppNav } from "@/components/AppNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "QR Pro Scanner — Kurisko K1",
  description: "John Kurisko quad rotation scalping dashboard · Capital.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <>
      <AppNav />
      <main>{children}</main>
    </>
  );

  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-slate-950 text-slate-100 antialiased`}>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider>{body}</ClerkProvider>
        ) : (
          body
        )}
      </body>
    </html>
  );
}
