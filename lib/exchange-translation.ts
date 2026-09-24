import type { Exchange } from "@/lib/exchange-intelligence";

export type ExchangeTitleTranslation = {
  titleZh: string | null;
  status: "translated" | "original_zh" | "pending" | "error";
  provider: "deterministic" | "google" | "original" | null;
  sourceHash: string;
  error: string | null;
  translatedAt: string | null;
  charCount: number;
};

const HAN = /[\u3400-\u9fff]/u;
const KOREAN = /[\uac00-\ud7af]/u;

export async function translationSourceHash(title: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(title));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Translate only phrases whose market meaning is fixed. Captured project names,
 * symbols, pairs, dates and numbers are deliberately left byte-for-byte intact.
 */
export function deterministicExchangeTitle(title: string) {
  const original = title.trim();
  if (!original) return null;
  const englishTemplate = /\b(?:will|list|listed|listing|delist|delisting|trading|futures|launch|launched|remove|spot|convert|announcement|available|published|pairs?|deposits?|withdrawals?)\b/iu;
  const hasEnglishTemplate = englishTemplate.test(original);
  if (HAN.test(original) && !KOREAN.test(original) && !hasEnglishTemplate) return original;

  const alphaRemoval = original.match(/^Binance Alpha Will Remove\s+(.+?)(\s*\([^)]*\))?$/iu);
  if (alphaRemoval) return `Binance Alpha 将移除 ${alphaRemoval[1].replace(/,\s*/g, "、").replace(/\s+and\s+/giu, "、")}${alphaRemoval[2] || ""}`;

  let translated = original;
  const replacements: Array<[RegExp, string]> = [
    [/\[Important\]/giu, "[重要]"],
    [/^Notice of Removal of Spot Trading Pairs/iu, "现货交易对下架公告"],
    [/^Notice of Delisting (\d+) Spot Trading Pairs/iu, "关于下架 $1 个现货交易对的公告"],
    [/^Notice of Delisting/iu, "下架公告"],
    [/^Notice on\b/iu, "公告："],
    [/^Initial Listing:/iu, "首发上线："],
    [/^New listing:\s*Listing of/iu, "新上线："],
    [/\bAnnouncement on the Listing of\b/giu, "上线公告："],
    [/\bAnnouncement on Listing\b/giu, "上线公告："],
    [/^Gate Completes Delisting of/iu, "Gate 已完成下架"],
    [/^Binance Exchange Adds/iu, "Binance 交易所新增"],
    [/\bBinance Alpha Will Remove\b/giu, "Binance Alpha 将移除"],
    [/\bBinance Alpha Will (?:Add|List|Include)\b/giu, "Binance Alpha 将纳入"],
    [/\bwill close\b/giu, "将停止"],
    [/\bwill delist\b/giu, "将下架"],
    [/\bto delist\b/giu, "将下架"],
    [/\band Delist\b/giu, "并下架"],
    [/\bcompletes delisting and buyback of\b/giu, "已完成下架并回购"],
    [/\bwill launch\b/giu, "将上线"],
    [/\bto launch\b/giu, "将上线"],
    [/\bnow launched\b/giu, "现已上线"],
    [/\bhas launched\b/giu, "已上线"],
    [/\blaunches\b/giu, "上线"],
    [/\bwill list\b/giu, "将上线"],
    [/\bto list\b/giu, "将上线"],
    [/\bhas listed\b/giu, "已上线"],
    [/\blisted\b/giu, "已上线"],
    [/\bis available for trading\b/giu, "已开放交易"],
    [/\bwith Seed Tag Applied\b/giu, "并添加种子标签"],
    [/\bSpot Trading Pairs?\b/giu, "现货交易对"],
    [/\bfor spot trading\b/giu, "用于现货交易"],
    [/\bNew Trading Pairs?\b/giu, "新增交易对"],
    [/\bTrading Pairs?\b/giu, "交易对"],
    [/\bon Binance Spot\/Convert\b/giu, "至 Binance 现货/闪兑"],
    [/\bon Binance Spot\b/giu, "至 Binance 现货"],
    [/\bfor Spot and Convert Trading\b/giu, "用于现货及闪兑交易"],
    [/\bon Spot\b/giu, "现货"],
    [/\bUSDⓈ-Margined Perpetual Contract\b/giu, "U 本位永续合约"],
    [/\bPre-IPO Tradfi Perpetual\b/giu, "传统金融盘前永续合约"],
    [/\bconvert pre-market futures to standard perpetual futures\b/giu, "将闪兑盘前合约转为标准永续合约"],
    [/\bTradFi Perpetual\b/giu, "传统金融永续合约"],
    [/\bPre-IPO Perps\b/giu, "盘前永续合约"],
    [/\bhot stock perps\b/giu, "热门股票永续合约"],
    [/\bStock Perps\b/giu, "股票永续合约"],
    [/\bStock Futures\b/giu, "股票合约"],
    [/\bPerpetual Futures\b/giu, "永续合约"],
    [/\bFutures Zone\b/giu, "合约专区"],
    [/\bForex Zone\b/giu, "外汇专区"],
    [/\bFutures Trading\b/giu, "合约交易"],
    [/\bPre-IPO Trading\b/giu, "盘前交易"],
    [/\bTrading Bots Services?\b/giu, "交易机器人服务"],
    [/\bTrading Bots\b/giu, "交易机器人"],
    [/\bCopy Trading Features\b/giu, "跟单交易功能"],
    [/\band related services\b/giu, "及相关服务"],
    [/\bLaunchpool Project\b/giu, "Launchpool 项目"],
    [/\bDeposits and Withdrawals\b/giu, "充值和提现"],
    [/\bvia Fiat Trade\b/giu, "通过法币交易"],
    [/\bwith 0-Fee Trading\b/giu, "并提供零手续费交易"],
    [/\bPublished on\b/giu, "发布于"],
    [/\bselected\b/giu, "指定"],
    [/\bIncluding\b/gu, "包括"],
    [/\bStake\b/gu, "质押"],
    [/\bto Claim Airdrops\b/giu, "领取空投"],
    [/\bFutures\b/giu, "合约"],
    [/\bspot trading\b/giu, "现货交易"],
    [/\bpre-market\b/giu, "盘前"],
    [/\bconvert\b/giu, "闪兑"],
    [/\bProject\b/giu, "项目"],
    [/\bCoins?\b/giu, "币种"],
    [/\bZone\b/giu, "专区"],
    [/\bBots\b/giu, "机器人"],
    [/\band\b/giu, "和"],
    [/\bor\b/giu, "或"],
    [/\bfor\b/giu, "用于"],
    [/\bto\b/giu, "至"],
    [/\bon\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?=\s|$)/giu, "于 $1"],
  ];
  for (const [pattern, replacement] of replacements) translated = translated.replace(pattern, replacement);
  translated = translated.replace(/\s*&\s*/gu, "及");
  translated = translated.replace(/\s+([，。！？；：])/gu, "$1").replace(/\s+(?:及|至|通过)/gu, (value) => value.trim()).replace(/!$/u, "！").replace(/\s{2,}/g, " ").trim();
  // A partial rule match must not masquerade as a finished translation.
  if (englishTemplate.test(translated)) return null;
  return translated === original ? null : translated;
}

function protectedFragments(title: string, exchange: Exchange) {
  const fragments = new Set<string>();
  fragments.add({ binance: "Binance", coinbase: "Coinbase", upbit: "Upbit", okx: "OKX", bybit: "Bybit", kraken: "Kraken", bitget: "Bitget", gate: "Gate", mexc: "MEXC", htx: "HTX" }[exchange]);
  for (const match of title.matchAll(/0x[a-fA-F0-9]{40}|\b[A-Z0-9]{2,20}(?:[-/]?[A-Z0-9]{2,20})*\b|\b\d+(?:[.,:/-]\d+)*\b/gu)) fragments.add(match[0]);
  return [...fragments].filter((fragment) => title.includes(fragment));
}

function decodeEntities(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function translateExchangeTitle(input: {
  title: string;
  exchange: Exchange;
  googleApiKey?: string;
  googleEnabled?: boolean;
  monthlyCharactersUsed?: number;
  monthlyCharacterLimit?: number;
  now?: string;
}): Promise<ExchangeTitleTranslation> {
  const title = input.title.trim();
  const sourceHash = await translationSourceHash(title);
  const now = input.now || new Date().toISOString();
  const deterministic = deterministicExchangeTitle(title);
  if (deterministic) return { titleZh: deterministic, status: deterministic === title ? "original_zh" : "translated", provider: deterministic === title ? "original" : "deterministic", sourceHash, error: null, translatedAt: now, charCount: 0 };
  if (!input.googleEnabled || !input.googleApiKey) return { titleZh: null, status: "pending", provider: null, sourceHash, error: null, translatedAt: null, charCount: 0 };
  const monthlyLimit = Math.max(0, input.monthlyCharacterLimit ?? 450_000);
  const used = Math.max(0, input.monthlyCharactersUsed ?? 0);
  if (title.length > 500 || used + title.length > monthlyLimit) return { titleZh: null, status: "pending", provider: "google", sourceHash, error: "monthly_character_limit", translatedAt: now, charCount: 0 };
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(input.googleApiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: title, target: "zh-CN", format: "text" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const payload = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
    const translatedText = decodeEntities(String(payload.data?.translations?.[0]?.translatedText || "").trim());
    if (!translatedText || protectedFragments(title, input.exchange).some((fragment) => !translatedText.includes(fragment))) throw new Error("protected_fragment_mismatch");
    return { titleZh: translatedText, status: "translated", provider: "google", sourceHash, error: null, translatedAt: now, charCount: title.length };
  } catch (error) {
    return { titleZh: null, status: "error", provider: "google", sourceHash, error: error instanceof Error ? error.message.slice(0, 80) : "translation_failed", translatedAt: now, charCount: 0 };
  }
}
