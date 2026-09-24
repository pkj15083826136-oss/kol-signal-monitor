import { env } from "cloudflare:workers";
import ExchangeDashboard, { type ExchangePayload } from "./exchange-dashboard";
export const dynamic="force-dynamic";
async function load():Promise<ExchangePayload>{if(!env.DB)return{events:[],health:[],fetchedAt:new Date().toISOString()};const [events,health]=await Promise.all([env.DB.prepare("SELECT * FROM exchange_events ORDER BY COALESCE(announcement_at,discovered_at) DESC,id DESC LIMIT 100").all<Record<string,unknown>>(),env.DB.prepare("SELECT * FROM exchange_collector_state ORDER BY exchange,source").all<Record<string,unknown>>()]);return{events:events.results.map((row)=>({...row,assets:JSON.parse(String(row.assets_json||"[]")),pairs:JSON.parse(String(row.pairs_json||"[]"))})),health:health.results,fetchedAt:new Date().toISOString()};}
export default async function Page(){return <ExchangeDashboard initial={await load()}/>;}
