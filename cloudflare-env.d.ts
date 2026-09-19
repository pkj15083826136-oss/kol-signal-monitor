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
  }
}
