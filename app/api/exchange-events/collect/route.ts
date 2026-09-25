import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";
import { ANNOUNCEMENT_SOURCES, EXCHANGES, EXCHANGE_LABELS, PAIR_SOURCES, classifyAnnouncement, eventPriority, extractAnnouncementLinks, extractBinanceAnnouncements, extractBitgetAnnouncements, extractCoinbaseXAnnouncements, extractGateAnnouncements, extractKrakenAnnouncements, normalizePairs, normalizeSuppliedPairs, reconcilePairSnapshot, splitPair, type Exchange, type ExchangeEventType } from "@/lib/exchange-intelligence";
import { normalizeNewListingsFeedBatch } from "@/lib/new-listings-feed";
import { translateExchangeTitle, translationSourceHash, type ExchangeTitleTranslation } from "@/lib/exchange-translation";

export const dynamic = "force-dynamic";
const headers = { "User-Agent": "KOL-Signal-Monitor/1.0 (+official-market-verification)", Accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
async function fetchOfficial(url:string,init:RequestInit={}) { let last:unknown; for(let attempt=0;attempt<2;attempt++){try{const response=await fetch(url,{...init,headers:{...headers,...(init.headers||{})},signal:AbortSignal.timeout(20_000)});if(response.ok)return response;last=new Error(`HTTP ${response.status}`)}catch(error){last=error}if(attempt<1)await wait(500);}throw last instanceof Error?last:new Error(String(last)); }
async function sha(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function tokens(title: string) { return [...new Set((title.match(/\b[A-Z0-9]{2,12}(?:[-\/]?(?:USDT|USDC|USD|KRW))?\b/g) || []).filter((x) => !["THE", "WILL", "SPOT", "LIST", "WITH", "NEW", "AND", "FOR"].includes(x)))].slice(0, 20); }
function pairTokens(title: string) { return tokens(title).filter((x) => /(?:USDT|USDC|USD|KRW)$/.test(x)).map((x) => x.replace("/", "-")); }

type StoredTranslation = { title_zh: string | null; translation_status: string; translation_provider: string | null; translation_source_hash: string | null; translation_error: string | null; translated_at: string | null; translation_char_count: number };

async function titleTranslation(db: D1Database, title: string, exchange: Exchange, existing: StoredTranslation | null, now: string): Promise<ExchangeTitleTranslation> {
  const sourceHash = await translationSourceHash(title);
  // Deterministic rules are free and versioned with the application, so recompute
  // them before accepting a cached value. This lets rule improvements replace an
  // older deterministic translation without manufacturing an event revision.
  const deterministic = await translateExchangeTitle({ title, exchange, now });
  if (deterministic.titleZh) return deterministic;
  if (existing?.translation_source_hash === sourceHash && existing.title_zh && existing.translation_provider === "google" && existing.translation_status === "translated") return { titleZh: existing.title_zh, status: "translated", provider: "google", sourceHash, error: existing.translation_error, translatedAt: existing.translated_at, charCount: existing.translation_char_count || 0 };
  if (existing?.translation_source_hash === sourceHash && existing.translation_status === "error" && existing.translated_at && Date.now() - Date.parse(existing.translated_at) < 21_600_000) return { titleZh: null, status: "error", provider: existing.translation_provider as "google" | null, sourceHash, error: existing.translation_error, translatedAt: existing.translated_at, charCount: 0 };
  const source = env as unknown as Record<string, unknown>;
  const googleEnabled = String(source.EXCHANGE_GOOGLE_TRANSLATION_ENABLED || "").toLowerCase() === "true";
  const googleApiKey = typeof source.GOOGLE_TRANSLATE_API_KEY === "string" ? source.GOOGLE_TRANSLATE_API_KEY : "";
  const configuredLimit = Number(source.EXCHANGE_TRANSLATION_MONTHLY_CHARACTER_LIMIT || 450_000);
  const monthlyCharacterLimit = Number.isFinite(configuredLimit) ? Math.max(0, Math.min(configuredLimit, 450_000)) : 450_000;
  let monthlyCharactersUsed = 0;
  if (googleEnabled && googleApiKey) {
    const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).toISOString();
    const usage = await db.prepare("SELECT COALESCE(SUM(translation_char_count),0) used FROM exchange_events WHERE translation_provider='google' AND translated_at>=?").bind(monthStart).first<{ used: number }>();
    monthlyCharactersUsed = Number(usage?.used || 0);
  }
  return translateExchangeTitle({ title, exchange, googleEnabled, googleApiKey, monthlyCharactersUsed, monthlyCharacterLimit, now });
}

function sameTranslation(existing: StoredTranslation, next: ExchangeTitleTranslation) {
  return existing.title_zh === next.titleZh && existing.translation_status === next.status && existing.translation_provider === next.provider && existing.translation_source_hash === next.sourceHash && existing.translation_error === next.error && Number(existing.translation_char_count || 0) === next.charCount;
}

async function saveEvent(db: D1Database, event: { eventKey: string; exchange: Exchange; eventType: ExchangeEventType; marketType: string; title: string; pairs?: string[]; sourceName: string; sourceUrl: string; sourceKind: string; announcementId?: string; announcementAt?: string | null; expectedEffectiveAt?: string | null; actualEffectiveAt?: string | null; status: string }, now: string) {
  const pairs = event.pairs || pairTokens(event.title); const assets = [...new Set([...pairs.map((p) => splitPair(p).base), ...tokens(event.title).filter((t) => !/(USDT|USDC|USD|KRW)$/.test(t))])].slice(0, 20);
  const body = JSON.stringify({ ...event, pairs, assets }); const contentHash = await sha(body); const existing = await db.prepare("SELECT id,content_hash,revision,title_zh,translation_status,translation_provider,translation_source_hash,translation_error,translated_at,translation_char_count FROM exchange_events WHERE event_key=?").bind(event.eventKey).first<{ id: number; content_hash: string; revision: number } & StoredTranslation>();
  const translation = await titleTranslation(db,event.title,event.exchange,existing||null,now);
  if (existing?.content_hash === contentHash) {
    if (!sameTranslation(existing,translation)) await db.prepare("UPDATE exchange_events SET title_zh=?,translation_status=?,translation_provider=?,translation_source_hash=?,translation_error=?,translated_at=?,translation_char_count=?,updated_at=? WHERE id=?").bind(translation.titleZh,translation.status,translation.provider,translation.sourceHash,translation.error,translation.translatedAt,translation.charCount,now,existing.id).run();
    return { id: existing.id, changed: false };
  }
  if (existing) {
    const revision = existing.revision + 1;
    await db.batch([
      db.prepare("UPDATE exchange_events SET event_type=?,market_type=?,title=?,title_zh=?,translation_status=?,translation_provider=?,translation_source_hash=?,translation_error=?,translated_at=?,translation_char_count=?,assets_json=?,pairs_json=?,source_url=?,announcement_at=?,expected_effective_at=?,actual_effective_at=?,status=?,priority=?,content_hash=?,revision=?,updated_at=? WHERE id=?").bind(event.eventType,event.marketType,event.title,translation.titleZh,translation.status,translation.provider,translation.sourceHash,translation.error,translation.translatedAt,translation.charCount,JSON.stringify(assets),JSON.stringify(pairs),event.sourceUrl,event.announcementAt||null,event.expectedEffectiveAt||null,event.actualEffectiveAt||null,event.status,eventPriority(event.eventType,pairs),contentHash,revision,now,existing.id),
      db.prepare("INSERT INTO exchange_event_revisions (event_id,revision,content_hash,payload_json,recorded_at) VALUES (?,?,?,?,?)").bind(existing.id,revision,contentHash,body,now),
    ]);
    return { id: existing.id, changed: true };
  }
  const inserted = await db.prepare("INSERT INTO exchange_events (event_key,exchange,event_type,market_type,title,title_zh,translation_status,translation_provider,translation_source_hash,translation_error,translated_at,translation_char_count,assets_json,pairs_json,conditions,announcement_id,source_name,source_url,source_kind,announcement_at,discovered_at,expected_effective_at,actual_effective_at,activity_start_at,activity_end_at,status,priority,content_hash,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) RETURNING id").bind(event.eventKey,event.exchange,event.eventType,event.marketType,event.title,translation.titleZh,translation.status,translation.provider,translation.sourceHash,translation.error,translation.translatedAt,translation.charCount,JSON.stringify(assets),JSON.stringify(pairs),null,event.announcementId||null,event.sourceName,event.sourceUrl,event.sourceKind,event.announcementAt||null,now,event.expectedEffectiveAt||null,event.actualEffectiveAt||null,null,null,event.status,eventPriority(event.eventType,pairs),contentHash,now).first<{id:number}>();
  if (inserted) await db.prepare("INSERT INTO exchange_event_revisions (event_id,revision,content_hash,payload_json,recorded_at) VALUES (?,1,?,?,?)").bind(inserted.id,contentHash,body,now).run();
  return { id: inserted?.id || 0, changed: true };
}

async function recordHealth(db: D1Database, source: string, exchange: Exchange, status: string, started: number, error: string | null, coverage: string[], now: string, cursor?: string | null) {
  const previous = await db.prepare("SELECT consecutive_failures FROM exchange_collector_state WHERE source=?").bind(source).first<{consecutive_failures:number}>(); const failures = status === "healthy" ? 0 : (previous?.consecutive_failures || 0) + 1; const nextRetry = status === "healthy" ? null : new Date(Date.now() + Math.min(300_000, 2 ** Math.min(failures, 8) * 1000)).toISOString();
  await db.prepare("INSERT INTO exchange_collector_state (source,exchange,status,cursor,last_attempt_at,last_success_at,last_event_at,last_latency_ms,consecutive_failures,next_retry_at,last_error,coverage_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET status=excluded.status,cursor=COALESCE(excluded.cursor,exchange_collector_state.cursor),last_attempt_at=excluded.last_attempt_at,last_success_at=CASE WHEN excluded.status='healthy' THEN excluded.last_success_at ELSE exchange_collector_state.last_success_at END,last_latency_ms=excluded.last_latency_ms,consecutive_failures=excluded.consecutive_failures,next_retry_at=excluded.next_retry_at,last_error=excluded.last_error,coverage_json=excluded.coverage_json").bind(source,exchange,status,cursor===undefined?null:cursor,now,status==="healthy"?now:null,null,Date.now()-started,failures,nextRetry,error,JSON.stringify(coverage)).run();
}

async function collectPairs(db: D1Database, exchange: Exchange, marketType: "spot"|"contract", url: string, now: string, suppliedPairs?: string[]) {
  const source = `${exchange}_pairs_${marketType}`; const started = Date.now();
  try {
    const pairs=suppliedPairs?normalizeSuppliedPairs(suppliedPairs):normalizePairs(exchange,marketType,await (await fetchOfficial(url)).json()); if (!pairs.length) throw new Error("empty_pair_snapshot"); const contentHash=await sha(JSON.stringify(pairs));
    const previous=await db.prepare("SELECT pairs_json,content_hash FROM exchange_pair_snapshots WHERE exchange=? AND market_type=?").bind(exchange,marketType).first<{pairs_json:string;content_hash:string}>(); const priorState=await db.prepare("SELECT cursor FROM exchange_collector_state WHERE source=?").bind(source).first<{cursor:string|null}>(); let created=0;
    if (!previous) await db.prepare("INSERT INTO exchange_pair_snapshots (exchange,market_type,pairs_json,content_hash,initialized_at,captured_at,source_url) VALUES (?,?,?,?,?,?,?)").bind(exchange,marketType,JSON.stringify(pairs),contentHash,now,now,url).run();
    else if (previous.content_hash !== contentHash) {
      const priorPairs=JSON.parse(previous.pairs_json) as string[]; let pendingMissing:Record<string,number>={}; try{pendingMissing=JSON.parse(priorState?.cursor||"{}").pendingMissing||{}}catch{} const reconciliation=reconcilePairSnapshot(priorPairs,pairs,pendingMissing); if(reconciliation.suspect)throw new Error(`partial_pair_snapshot:${pairs.length}/${priorPairs.length}`); const added=reconciliation.added.slice(0,100); const removed=reconciliation.removed.slice(0,100);
      for (const pair of added) { await saveEvent(db,{eventKey:`pair:${exchange}:${marketType}:${pair}:open:${now}`,exchange,eventType:marketType==="spot"?"spot_pair_add":"contract_open",marketType,title:`${EXCHANGE_LABELS[exchange]} 已实际开通 ${pair} ${marketType==="spot"?"现货交易对":"合约"}`,pairs:[pair],sourceName:source,sourceUrl:url,sourceKind:"official_public_api",actualEffectiveAt:now,status:"effective"},now); created++; }
      for (const pair of removed) { await saveEvent(db,{eventKey:`pair:${exchange}:${marketType}:${pair}:closed:${now}`,exchange,eventType:"pair_delisting",marketType,title:`${EXCHANGE_LABELS[exchange]} 已实际停止 ${pair} ${marketType==="spot"?"现货交易对":"合约"}`,pairs:[pair],sourceName:source,sourceUrl:url,sourceKind:"official_public_api",actualEffectiveAt:now,status:"effective"},now); created++; }
      const reconciledHash=await sha(JSON.stringify(reconciliation.snapshot)); await db.prepare("UPDATE exchange_pair_snapshots SET pairs_json=?,content_hash=?,captured_at=?,source_url=? WHERE exchange=? AND market_type=?").bind(JSON.stringify(reconciliation.snapshot),reconciledHash,now,url,exchange,marketType).run();
      await recordHealth(db,source,exchange,"healthy",started,null,[marketType],now,JSON.stringify({pendingMissing:reconciliation.pendingMissing})); return {source,count:pairs.length,created,baseline:false,pendingRemovals:Object.keys(reconciliation.pendingMissing).length};
    } else await db.prepare("UPDATE exchange_pair_snapshots SET captured_at=? WHERE exchange=? AND market_type=?").bind(now,exchange,marketType).run();
    await recordHealth(db,source,exchange,"healthy",started,null,[marketType],now,previous?undefined:JSON.stringify({pendingMissing:{}})); return {source,count:pairs.length,created,baseline:!previous};
  } catch(error) { const message=error instanceof Error?error.message:String(error); await recordHealth(db,source,exchange,"error",started,message,[marketType],now); return {source,error:message}; }
}

async function collectAnnouncements(db:D1Database,exchange:Exchange,url:string,now:string) {
  const source=`${exchange}_official_announcements`; const started=Date.now(); const previousHealth=await db.prepare("SELECT last_success_at,cursor FROM exchange_collector_state WHERE source=?").bind(source).first<{last_success_at:string|null;cursor:string|null}>(); const lastSuccessAt=previousHealth?.last_success_at||null; const hadBaseline=!!lastSuccessAt; let healthCursor:string|undefined;
  try { let links:{id:string;title:string;url:string;announcedAt?:string|null}[]=[];
    if(exchange==="coinbase") { const token=String((env as unknown as Record<string,unknown>).COINBASE_X_BEARER_TOKEN||""); if(!token)throw new Error("blocked: COINBASE_X_BEARER_TOKEN 未配置；Coinbase 已指定 @CoinbaseMarkets 为上币公告唯一官方渠道"); const auth={Authorization:`Bearer ${token}`};let userId="";try{userId=String(asRecord(JSON.parse(previousHealth?.cursor||"{}")).userId||"")}catch{}if(!userId){const userResponse=await fetchOfficial("https://api.x.com/2/users/by/username/CoinbaseMarkets",{headers:auth});userId=String(asRecord(asRecord(await userResponse.json()).data).id||"");if(!userId)throw new Error("coinbase_x_user_not_found");healthCursor=JSON.stringify({userId});}const timeline=await fetchOfficial(`https://api.x.com/2/users/${userId}/tweets?max_results=25&exclude=replies,retweets&tweet.fields=created_at`,{headers:auth});links=extractCoinbaseXAnnouncements(await timeline.json()); }
    else if(exchange==="upbit") { const previous=await db.prepare("SELECT status,last_attempt_at FROM exchange_collector_state WHERE source=?").bind(source).first<{status:string;last_attempt_at:string}>();if(previous?.status==="healthy"&&Date.now()-new Date(previous.last_attempt_at).getTime()<180_000)return {source,count:0,changed:0,stream:"healthy"};throw new Error("blocked: UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 未配置或私有公告 WebSocket 心跳已超时"); }
    else if(exchange==="kraken") { const response=await fetchOfficial(url);links=extractKrakenAnnouncements(await response.json()); }
    else if(exchange==="bitget") { for(const annType of ["coin_listings","symbol_delisting","product_updates"]){const response=await fetchOfficial(`${url}&annType=${annType}`);links.push(...extractBitgetAnnouncements(await response.json()));} }
    else if(exchange==="gate") { const response=await fetchOfficial(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({page:"1",size:"50",language:"en"})});links=extractGateAnnouncements(await response.json()); }
    else { const urls=exchange==="okx"?[url,"https://www.okx.com/en-us/help/section/announcements-delistings","https://www.okx.com/en-us/help/section/trading-updates-us-aus"]:[url]; for(const pageUrl of urls){const response=await fetchOfficial(pageUrl);const raw=await response.text();links.push(...(exchange==="binance"?extractBinanceAnnouncements(JSON.parse(raw)):extractAnnouncementLinks(raw,pageUrl)));} }
    links=[...new Map(links.map((link)=>[link.id,link])).values()]; if(!links.length) throw new Error("official_page_unparseable_or_empty"); let changed=0; for(const link of links.slice(0,50)){const kind=classifyAnnouncement(link.title); if(!kind)continue; const announcedAt="announcedAt" in link&&typeof link.announcedAt==="string"?link.announcedAt:null; const result=await saveEvent(db,{eventKey:`announcement:${exchange}:${link.id}`,exchange,eventType:kind.eventType,marketType:kind.marketType,title:link.title,announcementId:link.id,sourceName:source,sourceUrl:link.url,sourceKind:"official_announcement",announcementAt:announcedAt,status:"announced"},now); if(result.changed)changed++;} await recordHealth(db,source,exchange,"healthy",started,null,["official_announcements"],now,healthCursor); return {source,count:links.length,changed,baseline:!hadBaseline}; }
  catch(error){const message=error instanceof Error?error.message:String(error); await recordHealth(db,source,exchange,"error",started,message,["official_announcements"],now); return {source,error:message};}
}

async function ingestUpbit(db:D1Database,body:JsonRecord,now:string){const source="upbit_official_announcements";const started=Date.now();let changed=0,rejected=0;for(const value of Array.isArray(body.events)?body.events.slice(0,100):[]){const raw=asRecord(value);const title=String(raw.title||"").trim();const id=String(raw.uuid||"").trim();const url=String(raw.url||"").trim();const kind=classifyAnnouncement(title);if(raw.type!=="announcement"||raw.category!=="trade"||!id||!kind||!/^https:\/\/(?:www\.)?upbit\.com\/service_center\/notice/i.test(url)){rejected++;continue}const result=await saveEvent(db,{eventKey:`announcement:upbit:${id}`,exchange:"upbit",eventType:kind.eventType,marketType:kind.marketType,title,announcementId:id,sourceName:source,sourceUrl:url,sourceKind:"official_announcement_websocket",announcementAt:raw.first_listed_at?String(raw.first_listed_at):null,status:"announced"},now);if(result.changed)changed++;}await recordHealth(db,source,"upbit",String(body.status||"healthy")==="healthy"?"healthy":"error",started,body.error?String(body.error).slice(0,300):null,["official_announcements","websocket"],now);return{ok:true,source,changed,rejected,notifications:{enabled:false,mode:"web_only"}}}

async function ingestNewListingsFeed(db:D1Database,body:JsonRecord,now:string){
  const started=Date.now();const parsed=normalizeNewListingsFeedBatch(body.events);let changed=0;const rejected=(Array.isArray(body.events)?body.events.length:0)-parsed.length;
  for(const event of parsed){
    const identity=await sha(`${event.exchange}:${event.sourceUrl}:${event.eventType}:${event.marketType}`);
    const result=await saveEvent(db,{eventKey:`third-party:new-listings-feed:${identity}`,exchange:event.exchange,eventType:event.eventType,marketType:event.marketType,title:event.title,pairs:event.pairs,sourceName:"new_listings_feed",sourceUrl:event.sourceUrl,sourceKind:"third_party_discovery",announcementAt:null,status:"announced"},now);
    if(result.changed)changed++;
  }
  for(const exchange of ["coinbase","upbit"] as const){
    const source=`${exchange}_third_party_new_listings_feed`;const status=String(body.status||"healthy");
    await recordHealth(db,source,exchange,status==="healthy"?"healthy":"error",started,body.error?String(body.error).slice(0,300):null,["third_party_discovery","no_replay","configured_delay_3s"],now,body.cursor?String(body.cursor):undefined);
  }
  return{ok:true,source:"new_listings_feed",changed,rejected,notifications:{enabled:false,mode:"web_only"}};
}

async function backfillDeterministicTranslations(db:D1Database,now:string){const rows=await db.prepare("SELECT id,exchange,title FROM exchange_events WHERE translation_provider IN ('deterministic','original') OR translation_status='pending' OR translation_source_hash IS NULL ORDER BY id DESC LIMIT 500").all<{id:number;exchange:Exchange;title:string}>();let translated=0,pending=0;for(const row of rows.results){const result=await translateExchangeTitle({title:row.title,exchange:row.exchange,now});await db.prepare("UPDATE exchange_events SET title_zh=?,translation_status=?,translation_provider=?,translation_source_hash=?,translation_error=?,translated_at=?,translation_char_count=? WHERE id=?").bind(result.titleZh,result.status,result.provider,result.sourceHash,result.error,result.translatedAt,result.charCount,row.id).run();if(result.titleZh)translated++;else pending++;}return{ok:true,scanned:rows.results.length,translated,pending};}

async function collectExchange(db:D1Database,exchange:Exchange,now:string,binanceSpotPairs?:string[]){const results=[];results.push(await collectAnnouncements(db,exchange,ANNOUNCEMENT_SOURCES[exchange],now));const pairSources=PAIR_SOURCES[exchange];results.push(await collectPairs(db,exchange,"spot",pairSources.spot,now,exchange==="binance"?binanceSpotPairs:undefined));if(pairSources.contract)results.push(await collectPairs(db,exchange,"contract",pairSources.contract,now));return results;}

export async function POST(request:Request){const source=env as unknown as Record<string,unknown>; if(!isMonitorAuthorized(request,typeof source.MONITOR_SECRET==="string"?source.MONITOR_SECRET:""))return Response.json({error:"unauthorized"},{status:401}); const db=env.DB;if(!db)return Response.json({error:"database_unavailable"},{status:503}); const now=new Date().toISOString();let body:JsonRecord={};try{body=asRecord(await request.json())}catch{}if(body.mode==="upbit_stream")return Response.json(await ingestUpbit(db,body,now));if(body.mode==="new_listings_feed")return Response.json(await ingestNewListingsFeed(db,body,now));if(body.mode==="translation_backfill")return Response.json(await backfillDeterministicTranslations(db,now));const binanceSpotPairs=Array.isArray(body.binanceSpotPairs)?body.binanceSpotPairs.map(String):undefined; const results=(await Promise.all(EXCHANGES.map((exchange)=>collectExchange(db,exchange,now,exchange==="binance"?binanceSpotPairs:undefined)))).flat(); return Response.json({ok:true,at:now,results,notifications:{enabled:false,mode:"web_only"}});}
