import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Lazily initialize the Neon client so this module can be imported at build
// time (Next.js "Collecting page data" phase) without DATABASE_URL being set.
let _client: NeonQueryFunction<false, false> | undefined;

function getClient(): NeonQueryFunction<false, false> {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _client = neon(url);
  }
  return _client;
}

// Proxy preserves the full NeonQueryFunction<false, false> interface so all
// call sites retain proper TypeScript types (tagged template, .query, .unsafe, etc.)
export const sql = new Proxy(
  (() => {}) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_target, _thisArg, args) {
      const client = getClient();
      return Reflect.apply(client as unknown as (...a: unknown[]) => unknown, client, args);
    },
    get(_target, prop) {
      return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    },
  },
) as NeonQueryFunction<false, false>;
