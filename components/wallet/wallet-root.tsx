"use client";

import { useEffect, useState } from "react";

export type WalletRuntimeConfig = { enabled: boolean; projectId: string | null };

export default function WalletRoot({ config, children }: { config: WalletRuntimeConfig; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (!config.enabled || !config.projectId) return;
    import("./reown-client").then(({ initializeReown }) => initializeReown(config.projectId!)).then(() => {
      if (active) setReady(true);
    }).catch(() => {
      if (active) setReady(false);
    });
    return () => { active = false; };
  }, [config.enabled, config.projectId]);
  return <div data-wallet-enabled={config.enabled && Boolean(config.projectId)} data-wallet-ready={ready}>{children}</div>;
}
