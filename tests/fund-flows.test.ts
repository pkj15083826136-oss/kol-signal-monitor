import { describe,expect,it } from "vitest";
import { classifyFlow,normalizeWhaleAlert,normalizeWhaleAlerts } from "@/lib/fund-flows";
describe("large fund flow classification",()=>{
  it("uses outflow-minus-inflow sign inputs without claiming a trade",()=>{expect(classifyFlow("unknown","Binance")).toEqual({direction:"inflow",classification:"exchange_inflow",countsTowardNetflow:true});expect(classifyFlow("Coinbase","unknown")).toEqual({direction:"outflow",classification:"exchange_outflow",countsTowardNetflow:true})});
  it("excludes internal, same-entity and bridge movements",()=>{expect(classifyFlow("Binance","Coinbase").countsTowardNetflow).toBe(false);expect(classifyFlow("Kraken","Kraken").classification).toBe("same_entity");expect(classifyFlow("Wormhole Bridge","Binance").classification).toBe("bridge")});
  it("enforces the ten-million-dollar boundary and preserves attribution",()=>{expect(normalizeWhaleAlert({hash:"x",amount_usd:9_999_999})).toBeNull();const row=normalizeWhaleAlert({hash:"abc",blockchain:"ethereum",symbol:"USDT",amount:"10000000",amount_usd:10_000_000,timestamp:1700000000,from:{address:"0x1",owner:"unknown"},to:{address:"0x2",owner:"Binance"}})!;expect(row.direction).toBe("inflow");expect(row.institutionTradeSide).toBeNull();expect(row.labelConfidence).toBe("provider_attributed")});
  it("ingests the official WebSocket alert schema and applies the threshold per asset",()=>{
    const rows=normalizeWhaleAlerts({type:"alert",blockchain:"ethereum",timestamp:1700000000,from:"unknown wallet",to:"Binance",amounts:[{symbol:"USDC",amount:20_000_000,value_usd:20_000_000},{symbol:"WETH",amount:5_000,value_usd:9_000_000}],transaction:{hash:"0xabc",sub_transactions:[{symbol:"USDC",transaction_type:"transfer",unit_price_usd:"1",inputs:[{address:"0x1",owner:"unknown wallet",amount:"20000000"}],outputs:[{address:"0x2",owner:"Binance",amount:"20000000"}]}]}});
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({txHash:"0xabc",symbol:"USDC",amountUsd:20_000_000,fromAddress:"0x1",toAddress:"0x2",classification:"exchange_inflow"});
  });
  it("keeps each qualifying asset of a multi-asset alert separately",()=>{
    const rows=normalizeWhaleAlerts({type:"alert",blockchain:"ethereum",timestamp:1700000000,from:"Binance",to:"unknown wallet",amounts:[{symbol:"USDT",amount:11_000_000,value_usd:11_000_000},{symbol:"USDC",amount:12_000_000,value_usd:12_000_000}],transaction:{hash:"0xdef",sub_transactions:[]}});
    expect(rows.map((row)=>row.symbol)).toEqual(["USDT","USDC"]);expect(new Set(rows.map((row)=>row.eventKey)).size).toBe(2);
  });
});
