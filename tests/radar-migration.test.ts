import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../drizzle/0011_wonderful_may_parker.sql", import.meta.url), "utf8");
describe("radar D1 migration", () => {
  it("is additive and creates the required audit and paper-trading tables", () => {
    for (const table of ["radar_signals", "radar_signal_sources", "radar_signal_snapshots", "radar_analysis", "narrative_events", "strategy_settings", "paper_positions", "paper_orders", "position_events", "exit_ladders", "execution_attempts", "trade_outcomes", "user_wallet_accounts", "user_trading_wallets", "wallet_auth_nonces"]) expect(migration).toContain(`CREATE TABLE \`${table}\``);
    expect(migration).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE.*DROP/i);
  });
  it("never creates fields for raw private keys, mnemonic phrases or signatures", () => {
    expect(migration).not.toMatch(/private_key|mnemonic|seed_phrase|signed_transaction|\bsignature\b/i);
    expect(migration).toContain("public_address");
    expect(migration).toContain("key_reference");
  });
});
