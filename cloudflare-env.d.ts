declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FEATURE_WALLET_CONNECT?: string;
    REOWN_PROJECT_ID?: string;
  }
}
