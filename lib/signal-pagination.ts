export type SignalCursor = { alertedAt: string; id: number };
export function signalPageLimit(requested?: number) { void requested; return 20; }
export function encodeSignalCursor(cursor: SignalCursor) { return btoa(JSON.stringify(cursor)).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
export function decodeSignalCursor(value: string | null | undefined): SignalCursor | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as SignalCursor;
    if (!parsed.alertedAt || !Number.isInteger(parsed.id) || parsed.id <= 0 || !Number.isFinite(Date.parse(parsed.alertedAt))) return null;
    return parsed;
  } catch { return null; }
}
