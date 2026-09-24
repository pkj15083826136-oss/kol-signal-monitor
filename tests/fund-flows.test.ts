import { describe,expect,it } from "vitest";
import { classifyFlow,normalizeWhaleAlert } from "@/lib/fund-flows";
describe("large fund flow classification",()=>{
  it("uses outflow-minus-inflow sign inputs without claiming a trade",()=>{expect(classifyFlow("unknown","Binance")).toEqual({direction:"inflow",classification:"exchange_inflow",countsTowardNetflow:true});expect(classifyFlow("Coinbase","unknown")).toEqual({direction:"outflow",classification:"exchange_outflow",countsTowardNetflow:true})});
  it("excludes internal, same-entity and bridge movements",()=>{expect(classifyFlow("Binance","Coinbase").countsTowardNetflow).toBe(false);expect(classifyFlow("Kraken","Kraken").classification).toBe("same_entity");expect(classifyFlow("Wormhole Bridge","Binance").classification).toBe("bridge")});
  it("enforces the ten-million-dollar boundary and preserves attribution",()=>{expect(normalizeWhaleAlert({hash:"x",amount_usd:9_999_999})).toBeNull();const row=normalizeWhaleAlert({hash:"abc",blockchain:"ethereum",symbol:"USDT",amount:"10000000",amount_usd:10_000_000,timestamp:1700000000,from:{address:"0x1",owner:"unknown"},to:{address:"0x2",owner:"Binance"}})!;expect(row.direction).toBe("inflow");expect(row.institutionTradeSide).toBeNull();expect(row.labelConfidence).toBe("provider_attributed")});
});
