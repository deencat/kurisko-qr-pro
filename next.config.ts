import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/qr-scanner", destination: "/day-trade/qr-scanner", permanent: false },
      { source: "/kurisko-scanner", destination: "/day-trade/qr-scanner", permanent: false },
      { source: "/scan/qr", destination: "/day-trade/qr-scanner", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
