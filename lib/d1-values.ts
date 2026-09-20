export type D1Value = string | number | null;

export function d1Text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function d1Number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function d1Integer(value: unknown, fallback = 0): number {
  return Math.round(d1Number(value, fallback));
}

export function d1Json(value: unknown, fallback: unknown = {}): string {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

export function d1Bindings(sqlName: string, fields: Record<string, D1Value>): D1Value[] {
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
      throw new TypeError(`${sqlName}.${field} is not a valid D1 value`);
    }
  }
  return Object.values(fields);
}

export const SIGNAL_MARKET_UPDATE_SQL = `UPDATE signals SET
  name = CASE WHEN ? != '' THEN ? ELSE name END,
  symbol = CASE WHEN ? != '' THEN ? ELSE symbol END,
  logo = CASE WHEN ? != '' THEN ? ELSE logo END,
  market_cap = CASE WHEN ? > 0 THEN ? ELSE market_cap END,
  liquidity = CASE WHEN ? > 0 THEN ? ELSE liquidity END,
  holders = CASE WHEN ? > 0 THEN ? ELSE holders END,
  volume_24h = CASE WHEN ? > 0 THEN ? ELSE volume_24h END,
  price = CASE WHEN ? > 0 THEN ? ELSE price END,
  official_description = CASE WHEN ? != '' THEN ? ELSE official_description END,
  description_source = CASE WHEN ? != '' THEN ? ELSE description_source END,
  description_updated_at = CASE WHEN ? != '' THEN ? ELSE description_updated_at END,
  website = CASE WHEN ? != '' THEN ? ELSE website END,
  socials_json = CASE WHEN ? != '{}' THEN ? ELSE socials_json END
  WHERE chain = ? AND token_address = ?`;

export function signalMarketUpdateBindings(market: Record<string, unknown>, chain: unknown, token: unknown): D1Value[] {
  const name = d1Text(market.name);
  const symbol = d1Text(market.symbol);
  const logo = d1Text(market.logo);
  const marketCap = d1Integer(market.marketCap);
  const liquidity = d1Integer(market.liquidity);
  const holders = d1Integer(market.holders);
  const volume24h = d1Integer(market.volume24h);
  const price = d1Number(market.price);
  const description = d1Text(market.description).slice(0, 1200);
  const descriptionSource = d1Text(market.descriptionSource);
  const descriptionUpdatedAt = d1Text(market.descriptionUpdatedAt);
  const website = d1Text(market.website);
  const socialsJson = d1Json(market.socials, {});
  return d1Bindings("signals.market_update", {
    name_check: name, name,
    symbol_check: symbol, symbol,
    logo_check: logo, logo,
    market_cap_check: marketCap, market_cap: marketCap,
    liquidity_check: liquidity, liquidity,
    holders_check: holders, holders,
    volume_24h_check: volume24h, volume_24h: volume24h,
    price_check: price, price: d1Text(price),
    official_description_check: description, official_description: description,
    description_source_check: descriptionSource, description_source: descriptionSource,
    description_updated_at_check: descriptionUpdatedAt, description_updated_at: descriptionUpdatedAt,
    website_check: website, website,
    socials_json_check: socialsJson, socials_json: socialsJson,
    chain: d1Text(chain), token_address: d1Text(token),
  });
}
