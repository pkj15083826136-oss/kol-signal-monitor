import { env } from "cloudflare:workers";
import { ArrowLeft, ExternalLink, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import SignalChart from "./chart";
import KlineChart from "./kline-chart";
import CopyAddress from "./copy-address";
import WalletButton from "@/components/wallet/wallet-button";
import LiveMarketStrip from "@/components/market/live-market-strip";
import TradePanel from "@/components/trade/trade-panel";
import { getKlineData, getMarketData } from "@/lib/market";
import { tradingFeatureFlags } from "@/lib/feature-flags";
import { isRejectedTokenIdentity, verifiedTokenIdentity } from "@/lib/token-identity";

export const dynamic = "force-dynamic";
function validImage(value: string) { return /^https:\/\//i.test(value); }

export default async function SignalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = env.DB;
  if (!db) throw new Error("DB binding 未配置");
  const signal = await db.prepare("SELECT * FROM signals WHERE id = ?").bind(Number(id)).first<Record<string, unknown>>();
  if (!signal) return <main className="grid min-h-screen place-items-center bg-[#070a0f] text-slate-300"><div className="text-center"><p>没有找到该预警</p><Link href="/" className="mt-4 inline-block text-cyan-300">返回监控面板</Link></div></main>;
  const chain = String(signal.chain);
  const address = String(signal.token_address);
  if (isRejectedTokenIdentity(chain, address)) return <main className="grid min-h-screen place-items-center bg-[#070a0f] text-slate-300"><div className="text-center"><p>该历史记录的代币身份无法验证</p><Link href="/" className="mt-4 inline-block text-cyan-300">返回监控面板</Link></div></main>;
  const [posts, snapshots, market, kline5, kline15] = await Promise.all([
    db.prepare("SELECT * FROM hot_posts WHERE signal_id = ? ORDER BY rank").bind(Number(id)).all<Record<string, unknown>>(),
    db.prepare("SELECT holder_count, total_token_amount, market_value, captured_at FROM snapshots WHERE chain = ? AND token_address = ? ORDER BY captured_at LIMIT 120").bind(chain, address).all<Record<string, unknown>>(),
    getMarketData(chain, address).catch(() => ({ name:"",symbol:"",logo:"",description:"",price:0,marketCap:0,liquidity:0,holders:0,volume24h:0,pairAddress:"",dexUrl:"",createdAt:0 })),
    getKlineData(chain, address, 5).catch(() => ({ candles: [], source: "", reason: "5分钟行情数据源请求失败，请稍后刷新重试。" })),
    getKlineData(chain, address, 15).catch(() => ({ candles: [], source: "", reason: "15分钟行情数据源请求失败，请稍后刷新重试。" })),
  ]);
  const livePrice = market.price;
  const chartData = snapshots.results.map((row) => ({
    time: new Date(String(row.captured_at)).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }),
    holders: Number(row.holder_count),
    value: Number(row.market_value) || Number(row.total_token_amount) * livePrice,
    amount: Number(row.total_token_amount),
  }));
  const wallets = JSON.parse(String(signal.wallet_names_json || "[]")) as string[];
  const identity = verifiedTokenIdentity(chain, address, market.name || String(signal.name), market.symbol || String(signal.symbol));
  const name = identity.name;
  const symbol = identity.symbol;
  const logo = market.logo || String(signal.logo || "");
  const marketCap = market.marketCap;
  const liquidity = market.liquidity;
  const holders = market.holders;
  const volume24h = market.volume24h;
  const description = market.description || "暂无可核验的官方项目简介。";
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  const broadcastEnabled = flags.tradeMainnet && flags.tradeMainnetChains[chain as keyof typeof flags.tradeMainnetChains] === true;
  return <main className="min-h-screen w-full max-w-full overflow-x-clip bg-[#070a0f] text-[#edf2f7]"><div className="ambient"/><div className="relative mx-auto w-full min-w-0 max-w-[1500px] px-4 py-7 sm:px-7"><div className="mb-6 flex min-w-0 items-center justify-between gap-3"><Link href="/" className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-500 transition hover:text-cyan-300"><ArrowLeft className="shrink-0" size={16}/>返回预警列表</Link><WalletButton/></div><div className="grid w-full min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,65fr)_minmax(300px,35fr)]"><div className="w-full min-w-0 max-w-full">
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5 sm:p-7"><div className="flex min-w-0 max-w-full flex-col justify-between gap-5 sm:flex-row sm:items-start"><div className="flex min-w-0 max-w-full items-center gap-3">{validImage(logo) ? <Image unoptimized src={logo} alt={`${symbol} 头像`} width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.04] object-cover"/> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] font-semibold text-cyan-200">{symbol.slice(0,2)}</div>}<div className="min-w-0 max-w-full flex-1"><h1 className="truncate text-2xl font-semibold">{symbol}</h1>{name && name.toLowerCase() !== symbol.toLowerCase() && <p className="mt-0.5 truncate text-sm text-slate-500">{name}</p>}<div className="mt-1 flex min-w-0 max-w-full items-center gap-2"><p className="block min-w-0 max-w-full flex-1 truncate font-mono text-xs text-slate-600">{address}</p><span className="shrink-0"><CopyAddress address={address}/></span></div></div></div><div className="w-full min-w-0 max-w-full rounded-xl border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-3 sm:w-auto sm:shrink-0"><div className="text-xs text-cyan-300/70">当前聚集</div><div className="mt-1 text-xl font-semibold text-cyan-200">{Number(signal.holder_count)} 人</div></div></div>
      <LiveMarketStrip chain={chain} address={address} enabled={flags.liveMarket} initial={{ price: livePrice, marketCap, liquidity, volume24h }}/>
      <div className="mt-3 text-xs text-slate-600">持币地址：{holders ? holders.toLocaleString() : "暂无数据"}</div>
      <div className="mt-7 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"><div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="text-sm font-medium text-slate-300">代币简介</div><p className="mt-2 break-words text-sm leading-6 text-slate-400 [overflow-wrap:anywhere]">{description}</p>{market.dexUrl && <a href={market.dexUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300/80 hover:text-cyan-200">查看DEX行情 <ExternalLink size={12}/></a>}</div><div className="min-w-0 overflow-hidden rounded-xl border border-cyan-300/10 bg-gradient-to-r from-cyan-300/[0.07] to-violet-400/[0.05] p-5"><div className="flex items-center gap-2 text-sm text-cyan-300"><Sparkles size={16}/>AI分析</div><p className="mt-2 break-words leading-7 text-slate-200 [overflow-wrap:anywhere]">{String(signal.ai_analysis)}</p><p className="mt-3 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">数据主题：{String(signal.gmgn_theme)}</p></div></div>
    </section>
    <section className="mt-5 w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5"><KlineChart five={kline5} fifteen={kline15}/></section>
    <div id="mobile-trade-panel" className="mt-5 w-full min-w-0 max-w-full lg:hidden"><TradePanel symbol={symbol} chain={chain} quoteEnabled={flags.tradeQuote} broadcastEnabled={broadcastEnabled}/></div>
    <section className="mt-5 grid w-full min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"><div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5"><div className="mb-2 flex min-w-0 items-center justify-between gap-2"><div className="min-w-0"><h2 className="font-semibold">KOL持仓趋势</h2><p className="mt-1 break-words text-xs text-slate-600">人数、代币数量与按行情估算总价值</p></div><span className="shrink-0 text-xs text-slate-600">自动更新</span></div>{chartData.length ? <SignalChart data={chartData}/> : <div className="grid h-72 place-items-center text-sm text-slate-600">等待下一轮持仓快照</div>}</div><div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5"><div className="flex items-center gap-2"><Users size={16} className="text-cyan-300"/><h2 className="font-semibold">建仓账户</h2></div><div className="mt-4 flex max-h-72 max-w-full flex-wrap content-start gap-2 overflow-auto">{wallets.map((name, index) => <span key={`${name}-${index}`} className="max-w-full break-all rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-400">{name}</span>)}</div></div></section>
    <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5 sm:p-6"><div><h2 className="font-semibold">热门评论</h2><p className="mt-1 text-xs text-slate-600">X平台热门原创内容，经AI筛选并翻译</p></div><div className="mt-5 grid gap-3 lg:grid-cols-3">{posts.results.length ? posts.results.map((post) => <a key={String(post.id)} href={String(post.url)} target="_blank" rel="noreferrer" className="group rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 transition hover:border-cyan-300/20"><div className="flex items-center justify-between"><span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-300/10 text-xs font-semibold text-cyan-300">{Number(post.rank)}</span><ExternalLink size={14} className="text-slate-700 group-hover:text-cyan-300"/></div><p className="mt-4 text-sm leading-6 text-slate-300">{String(post.chinese)}</p><div className="mt-4 flex items-center justify-between text-xs text-slate-600"><span>{String(post.author)}</span><span>{String(post.engagement || "查看原帖")}</span></div></a>) : <div className="col-span-3 rounded-xl border border-dashed border-white/[0.08] py-12 text-center text-sm text-slate-600">本阶段未触发X搜索，或暂时没有有效热门帖子</div>}</div></section>
  </div><div className="hidden lg:block"><TradePanel symbol={symbol} chain={chain} quoteEnabled={flags.tradeQuote} broadcastEnabled={broadcastEnabled}/></div></div></div></main>;
}
