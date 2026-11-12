import { neon } from '@neondatabase/serverless';

let client;
export function database() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('DATABASE_URL is not configured');
    error.code = 'setup_required';
    throw error;
  }
  client ??= neon(process.env.DATABASE_URL);
  return client;
}
export async function query(text, params = []) {
  return database().query(text, params);
}
