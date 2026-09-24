import { safeAvatarUrl, validAvatarContentType } from "@/lib/radar/enrichment";

export const dynamic = "force-dynamic";
const MAX_BYTES = 1_048_576;
function color(hash: number, shift: number) { return `hsl(${(hash >>> shift) % 360} 62% 52%)`; }
function hashKey(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function identicon(key: string) { const hash = hashKey(key); const cells: string[] = []; for (let y = 0; y < 5; y += 1) for (let x = 0; x < 3; x += 1) if ((hash >>> ((x + y * 3) % 24)) & 1) { cells.push(`<rect x="${x * 12 + 6}" y="${y * 12 + 6}" width="10" height="10" rx="2"/>`); if (x < 2) cells.push(`<rect x="${(4 - x) * 12 + 6}" y="${y * 12 + 6}" width="10" height="10" rx="2"/>`); } return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" rx="16" fill="${color(hash, 4)}"/><g fill="${color(hash, 12)}">${cells.join("")}</g></svg>`; }

export async function GET(request: Request) {
  const url = new URL(request.url); const key = String(url.searchParams.get("key") || "radar").slice(0, 200); const source = safeAvatarUrl(url.searchParams.get("url"));
  if (source) try {
    const upstream = await fetch(source, { redirect: "error", headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" }, signal: AbortSignal.timeout(10_000) }); const type = upstream.headers.get("content-type"); const declared = Number(upstream.headers.get("content-length") || 0);
    if (upstream.ok && validAvatarContentType(type) && (!declared || declared <= MAX_BYTES)) { const body = await upstream.arrayBuffer(); if (body.byteLength > MAX_BYTES) throw new Error("AVATAR_TOO_LARGE"); return new Response(body, { headers: { "Content-Type": String(type).split(";")[0], "Cache-Control": "public, max-age=3600, s-maxage=86400", "X-Content-Type-Options": "nosniff" } }); }
  } catch { /* deterministic fallback */ }
  return new Response(identicon(key), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400, s-maxage=604800", "Content-Security-Policy": "default-src 'none'; style-src 'none'; script-src 'none'; sandbox", "X-Content-Type-Options": "nosniff" } });
}
