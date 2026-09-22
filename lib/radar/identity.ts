import type { RadarChain } from "@/lib/radar/types";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidRadarAddress(chain: RadarChain | string, value: unknown) {
  if (typeof value !== "string") return false;
  const address = value.trim();
  return chain === "sol" ? SOLANA_ADDRESS.test(address) : EVM_ADDRESS.test(address);
}

export function normalizeVerifiedRadarAddress(chain: RadarChain | string, value: unknown) {
  if (!isValidRadarAddress(chain, value)) return null;
  const address = String(value).trim();
  return chain === "sol" ? address : address.toLowerCase();
}

export function normalizeDexLabel(value: unknown) {
  if (typeof value !== "string") return null;
  const label = value.trim().toLowerCase();
  return label && label.length <= 80 ? label : null;
}
