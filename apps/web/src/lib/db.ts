import { neon } from '@neondatabase/serverless';

let _client: ReturnType<typeof neon> | undefined;

function getClient() {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _client = neon(url);
  }
  return _client;
}

export const sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
  getClient()(strings, ...values);
