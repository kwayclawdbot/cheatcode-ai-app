/**
 * The Kai SMS scanner's database, READ ONLY.
 *
 * `ryprohqthwflinadqotj` is the LIVE SMS product with paying subscribers on it.
 * SWING-2 owns writes to it; this lane owns none. The only verb this module can
 * issue is GET — there is no code path here that can POST, PATCH or DELETE, and
 * that is deliberate rather than a convention someone has to remember.
 *
 * Everything is env-driven (§5): `KAI_SUPABASE_URL` / `KAI_SUPABASE_KEY`. No
 * host, no project ref and no key is written down in this repo.
 */

const PAGE = 1000;

export type KaiSource = { url: string; key: string };

export function kaiSource(env: NodeJS.ProcessEnv = process.env): KaiSource {
  const url = (env.KAI_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.KAI_SUPABASE_KEY ?? '';
  if (!url || !key) {
    throw new Error(
      'KAI_SUPABASE_URL and KAI_SUPABASE_KEY must be set — the scanner database is read through the environment, never a hardcoded host.',
    );
  }
  return { url, key };
}

/**
 * One PostgREST GET, paged to the end. `query` is everything after the table
 * name; `select` and filters are the caller's business, the method is not.
 */
export async function readAll<T>(src: KaiSource, table: string, query: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${src.url}/rest/v1/${table}?${query}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { apikey: src.key, Authorization: `Bearer ${src.key}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`kai ${table} read failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}
