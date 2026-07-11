import { KuriskoScannerPage } from "@/features/kurisko/KuriskoScannerPage";

export const metadata = {
  title: "QR Pro Scanner | METS",
  description: "Kurisko K1 quad rotation live scanner on Capital.com data",
};

/** Nested under /day-trade — same middleware public route that already works in Cursor Cloud. */
export default function DayTradeQrScannerPage() {
  return <KuriskoScannerPage />;
}
