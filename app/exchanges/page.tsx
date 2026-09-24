import { env } from "cloudflare:workers";
import ExchangeDashboard, { type ExchangeEvent, type ExchangeHealth, type ExchangePayload } from "./exchange-dashboard";
export const dynamic="force-dynamic";
async function load():Promise<ExchangePayload>{if(!env.DB)return{events:[],health:[],fetchedAt:new Date().toISOString()};const [events,health]=await Promise.all([env.DB.prepare("SELECT * FROM exchange_events ORDER BY COALESCE(announcement_at,discovered_at) DESC,id DESC LIMIT 100").all<ExchangeEvent&{assets_json?:string|null;pairs_json?:string|null}>(),env.DB.prepare("SELECT * FROM exchange_collector_state ORDER BY exchange,source").all<ExchangeHealth>()]);return{events:events.results.map((row)=>({...row,pairs:JSON.parse(String(row.pairs_json||"[]")) as string[]})),health:health.results,fetchedAt:new Date().toISOString()};}
export default async function Page(){return <ExchangeDashboard initial={await load()}/>;}
