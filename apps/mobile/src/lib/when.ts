/**
 * WHEN A PRICE IS FROM, in the fewest words that still answer the question.
 *
 * The freshness mark used to say "Delayed" and stop. That is a category, not
 * an answer: a print from 15:59 and a Friday close both read "Delayed", and
 * the user had to do arithmetic — or trust — to tell them apart. Every price
 * on screen now carries the instant it happened, in New York time, because
 * that is the clock the market runs on and the one every level was measured
 * against.
 *
 * The shape shortens as the answer gets obvious:
 *   today            "3:59 PM"
 *   this week        "Fri 4:00 PM"
 *   older            "Sep 2, 4:00 PM"
 *
 * ET IS NOT OPTIONAL. Rendering a market timestamp in the phone's own zone
 * would put "1:00 PM" under a closing price for a user in California, which is
 * a quiet lie about what happened when. The suffix is left off the short forms
 * only where the whole app is already in one clock; `etStamp` keeps it.
 */
const NY = 'America/New_York';

function parts(d: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: NY, ...opts });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** The ET calendar date of an instant, as YYYY-MM-DD. */
function etDate(d: Date): string {
  const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * "3:59 PM" · "Fri 4:00 PM" · "Sep 2, 4:00 PM" — never a bare date, because a
 * price without a time of day cannot be placed inside a session.
 *
 * Returns null for anything unparseable, and the caller then says nothing
 * rather than something wrong. `Intl` with a time zone is guarded because a
 * runtime without it must degrade to a plain label, not to a crash.
 */
export function whenPlain(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const time = parts(d, { hour: 'numeric', minute: '2-digit', hour12: true });
    const clock = `${time.hour}:${time.minute} ${time.dayPeriod}`;
    const then = etDate(d);
    const today = etDate(now);
    if (then === today) return clock;
    const daysApart = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${then}T00:00:00Z`)) / 86_400_000);
    if (daysApart > 0 && daysApart < 7) {
      return `${parts(d, { weekday: 'short' }).weekday} ${clock}`;
    }
    const on = parts(d, { month: 'short', day: 'numeric' });
    return `${on.month} ${on.day}, ${clock}`;
  } catch {
    return null;
  }
}

/**
 * THE SESSION A BAR BELONGS TO, named: "Sep 4".
 *
 * A daily bar is not an instant, it is a TRADING DAY, and the market decides
 * which one — so the date has to be read in New York and nowhere else. Polygon
 * stamps a daily bar at midnight ET (`2026-09-04T04:00:00Z`), which a device
 * formatter in London renders as 5am on the 4th, in Auckland as 4pm on the 4th,
 * and in New York itself as 8pm on the THIRD. That last one is the one that
 * shipped: the ticker strip printed Friday's open, high, low and volume under
 * the words "SESSION · SEP 3". A row of real numbers under the wrong day is
 * worse than no row at all, and it also meant a member in Accra and a member in
 * New York could not name the same bar the same way.
 *
 * Returns null for anything unparseable, and the caller then says nothing.
 */
export function sessionDatePlain(at: string | number | Date | null | undefined): string | null {
  if (at === null || at === undefined || at === '') return null;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const p = parts(d, { month: 'short', day: 'numeric' });
    return `${p.month} ${p.day}`;
  } catch {
    return null;
  }
}

/** The same instant with the zone named, for anywhere it stands alone. */
export function etStamp(iso: string | null | undefined, now = new Date()): string | null {
  const w = whenPlain(iso, now);
  return w ? `${w} ET` : null;
}
