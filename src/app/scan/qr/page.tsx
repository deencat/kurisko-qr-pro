import { KuriskoScannerPage } from "@/features/kurisko/KuriskoScannerPage";

export const metadata = {
  title: "QR Pro Scanner | METS",
  description: "Kurisko K1 quad rotation live scanner on Capital.com data",
};

/** Alias route — use /scan/qr if /kurisko-scanner 404s (cloud port-forward cache). */
export default function QrScannerAliasRoute() {
  return <KuriskoScannerPage />;
}
