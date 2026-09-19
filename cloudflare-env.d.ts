declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FEATURE_WALLET_CONNECT?: string;
    REOWN_PROJECT_ID?: string;
    FEATURE_TRADE_QUOTE?: string;
    ZEROX_API_KEY?: string;
    JUPITER_API_KEY?: string;
    ZEROX_ALLOWED_TARGETS?: string;
    ZEROX_ALLOWED_SPENDERS?: string;
    FEATURE_TRADE_TESTNET?: string;
    FEATURE_TRADE_MAINNET?: string;
    FEATURE_TRADE_MAINNET_SOL?: string;
    FEATURE_TRADE_MAINNET_BSC?: string;
    FEATURE_TRADE_MAINNET_BASE?: string;
    FEATURE_TRADE_MAINNET_ROBINHOOD?: string;
    SOLANA_RPC_URL?: string;
    BSC_RPC_URL?: string;
    BASE_RPC_URL?: string;
    ROBINHOOD_RPC_URL?: string;
  }
}
