/**
 * KEYSET PAGING, AND WHY THERE IS NO `offset`.
 *
 * Brief §7: "cursor paged — never an unbounded list of 2,507". An `offset`
 * parameter is an unbounded list with extra steps — nothing stops `?offset=0&
 * limit=100000`, and even bounded it re-scans everything it skips and silently
 * drops or duplicates rows when the underlying set changes between pages.
 *
 * So a cursor here is the LAST ROW'S SORT KEY, base64url-encoded so it reads as
 * opaque and nobody is tempted to construct one. Encoding is not security: it
 * is decoded, validated, and used only as a comparison against columns the
 * caller could already filter on. A malformed cursor is ignored rather than
 * raised — the honest failure of a stale bookmark is the first page, not a 400
 * on a screen the user did not know they were resuming.
 */

export type Cursor = { at: string | null; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.at, c.id]), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [at, id] = parsed;
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    if (at !== null && typeof at !== 'string') return null;
    return { at: at as string | null, id };
  } catch {
    return null;
  }
}

/**
 * The PostgREST `or=` filter for "strictly after this row" under
 * `order by <col> desc nulls last, id desc`.
 *
 * THE NULLS ARE THE WHOLE PROBLEM. `last_active_at` is nullable — a lead who
 * has never done anything has none — and `nulls last` means the null rows come
 * after every dated row. So "after a dated cursor" is three cases, not one:
 * an older date, the same date with a smaller id, or any null. "After a NULL
 * cursor" is one case: another null with a smaller id, because there is nothing
 * beyond the nulls.
 *
 * Getting this wrong does not error — it silently drops the tail of the list,
 * which on a CRM means a person the operator can never find by scrolling.
 */
export function afterFilter(col: string, c: Cursor): string {
  if (c.at === null) return `and(${col}.is.null,id.lt.${c.id})`;
  return `${col}.lt.${c.at},and(${col}.eq.${c.at},id.lt.${c.id}),${col}.is.null`;
}
