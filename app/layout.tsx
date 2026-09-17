import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOL Signal｜聪明资金聚集预警",
  description: "四链KOL与聪明钱包聚集预警、AI叙事分析及持仓趋势。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
