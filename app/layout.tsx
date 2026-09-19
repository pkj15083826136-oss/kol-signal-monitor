import type { Metadata, Viewport } from "next";
import { env } from "cloudflare:workers";
import WalletRoot from "@/components/wallet/wallet-root";
import { tradingFeatureFlags } from "@/lib/feature-flags";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOL Signal｜聪明资金聚集预警",
  description: "四链KOL与聪明钱包聚集预警、AI叙事分析及持仓趋势。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  const projectId = env.REOWN_PROJECT_ID?.trim() || null;
  return (
    <html lang="zh-CN">
      <body className="antialiased"><WalletRoot config={{ enabled: flags.walletConnect, projectId }}>{children}</WalletRoot></body>
    </html>
  );
}
