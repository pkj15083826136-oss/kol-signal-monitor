import { describe,expect,it } from "vitest";
import { classifyFlow,normalizeBitqueryTransfers,normalizePublicRpcTransfer,normalizeWhaleAlert,normalizeWhaleAlerts,shouldQueuePublicFlowAlert } from "@/lib/fund-flows";
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
  it("normalizes documented Bitquery EVM transfers with provider labels and no inferred trade",()=>{
    const rows=normalizeBitqueryTransfers({data:{EVM:{Transfers:[{Block:{Time:"2026-09-24T01:02:03Z"},Transaction:{Hash:"0xabc"},Transfer:{Id:"4",Amount:"12000000",AmountInUSD:"12000000",Sender:"0xsender",Receiver:"0xreceiver",Currency:{Symbol:"USDC"}}}]}}},"ethereum",[{address:"0xreceiver",chain:"ethereum",type:"cex-deposit-address",value:"Binance deposit"}],"2026-09-24T01:03:00Z");
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({provider:"bitquery",eventKey:"bitquery:ethereum:0xabc:4:USDC",amountUsd:12_000_000,priceUsd:1,toEntity:"Binance deposit",toLabelSource:"Bitquery Metadata.Labels:cex-deposit-address",classification:"exchange_inflow",institutionTradeSide:null});
  });
  it("supports the documented Solana shape and rejects missing or sub-threshold USD valuation",()=>{
    const payload={data:{Solana:{Transfers:[{Block:{Time:"2026-09-24T01:02:03Z"},Transaction:{Signature:"sig"},Transfer:{Id:"1",Amount:"5000",AmountInUSD:"11000000",Sender:{Address:"sender"},Receiver:{Address:"receiver"},Currency:{Symbol:"SOL"}}},{Block:{Time:"2026-09-24T01:02:04Z"},Transaction:{Signature:"low"},Transfer:{Id:"2",Amount:"1",AmountInUSD:"9999999",Sender:{Address:"a"},Receiver:{Address:"b"},Currency:{Symbol:"SOL"}}}]}}};
    const rows=normalizeBitqueryTransfers(payload,"solana",[],"2026-09-24T01:03:00Z");expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({txHash:"sig",labelConfidence:"unverified",countsTowardNetflow:false,institutionTradeSide:null});
  });
  it("accepts only officially disclosed tracked-address stablecoin transfers",()=>{
    const tracked="0x1111111111111111111111111111111111111111";
    const base={chain:"ethereum",txHash:`0x${"a".repeat(64)}`,logIndex:7,symbol:"USDT",amount:10_000_000,fromAddress:"0x2222222222222222222222222222222222222222",toAddress:tracked,trackedAddresses:[tracked],blockTimestamp:"2026-09-25T01:02:03Z"};
    const row=normalizePublicRpcTransfer(base)!;
    expect(row).toMatchObject({provider:"public_rpc",direction:"inflow",classification:"exchange_inflow",countsTowardNetflow:true,toEntity:"Binance",labelConfidence:"official_disclosure",valuationMethod:"stablecoin_nominal_usd",institutionTradeSide:null});
    expect(normalizePublicRpcTransfer({...base,amount:9_999_999})).toBeNull();
    expect(normalizePublicRpcTransfer({...base,fromAddress:"0x3333333333333333333333333333333333333333",toAddress:"0x4444444444444444444444444444444444444444"})).toBeNull();
  });
  it("does not enqueue historical backfill as a fresh public-flow alert",()=>{
    const now=Date.parse("2026-09-25T02:00:00Z");
    expect(shouldQueuePublicFlowAlert("2026-09-25T01:50:00Z",now)).toBe(true);
    expect(shouldQueuePublicFlowAlert("2026-09-25T01:40:00Z",now)).toBe(false);
    expect(shouldQueuePublicFlowAlert("2026-09-25T02:01:00Z",now)).toBe(false);
  });
});
