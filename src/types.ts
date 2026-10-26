export type Env = {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  IP_HASH_SALT?: string;
};
