export const CHAIN_LABELS: Record<string, string> = { sol: "Solana", bsc: "BSC", base: "Base", robinhood: "Robinhood" };

export const CHAIN_TONES: Record<string, string> = {
  sol: "text-violet-300 bg-violet-400/10 border-violet-300/15",
  bsc: "text-amber-300 bg-amber-400/10 border-amber-300/15",
  base: "text-blue-300 bg-blue-400/10 border-blue-300/15",
  robinhood: "text-emerald-300 bg-emerald-400/10 border-emerald-300/15",
};

export function chainLabel(chain: string) { return CHAIN_LABELS[chain] || chain; }
export function chainTone(chain: string) { return CHAIN_TONES[chain] || CHAIN_TONES.base; }
