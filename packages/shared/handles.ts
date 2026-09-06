/**
 * Usernames ("handles") — the rules, in one place.
 *
 * A handle is the name a member is called by in the community: it is what a
 * post is signed with and what an `@mention` will resolve to when that lane
 * lands. Everything in this file exists so that the same answer comes back
 * whichever door the question arrives through — the phone checking as you
 * type, the API refusing a bad one, or the database trigger that is the last
 * word (0033, `profiles_handle_guard`).
 *
 * THE RULES, STATED ONCE
 *   * 3 to 20 characters.
 *   * Letters, digits and underscores only. Nothing else — no dots, no dashes,
 *     no spaces, no emoji. A handle has to survive being typed after an `@`
 *     in a sentence, and a dot or a dash makes "where does the name end"
 *     ambiguous for the mention parser that is coming.
 *   * It starts with a letter. `1000` and `007` read as identifiers, not as
 *     people, and a leading digit is the first thing a spoofing attempt uses.
 *   * It does not end with an underscore and never carries two in a row —
 *     `kway__` and `k__way` are the cheapest way to make a near-copy of
 *     somebody else's name.
 *   * UNIQUENESS IS CASE-INSENSITIVE, DISPLAY IS NOT. `Kway` and `kway` are
 *     the same handle and only one person can have it; whichever of the two
 *     was typed is what everybody sees. The database enforces this with a
 *     unique index on `lower(handle)`, not with application code.
 *   * RESERVED NAMES CANNOT BE REGISTERED. See below — this is the part that
 *     matters most.
 *
 * WHY RESERVED NAMES MATTER
 * `@everyone` and `@kai` are being built by another lane. If a member can
 * register the handle `everyone`, then `@everyone` in a room is ambiguous at
 * best and a way to impersonate an announcement at worst. The same is true of
 * `admin`, `support`, `staff` and `kai`. Reserving a name costs nothing and
 * un-reserving one later is a one-row change; letting one out is permanent,
 * because by then somebody is using it.
 *
 * Reservation is checked against the FOLDED form: lowercase, with underscores
 * removed. So `Admin`, `admin`, `a_d_m_i_n` and `ad_min` are all the same
 * reserved word. That is deliberately generous. A member who wanted `admin`
 * is told plainly that it is kept for the team, and `adminkway` is still free.
 *
 * THE LIST LIVES IN TWO PLACES, ON PURPOSE
 * Here, so the phone can say "that one is kept for the team" before a round
 * trip; and in the `reserved_handles` table, which is what the database
 * trigger actually enforces and what staff can add to without a deploy. They
 * are kept honest by `apps/api/scripts/handles-proof.ts`, which fails if the
 * table and this array disagree.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Letters, digits, underscore; starts with a letter; no trailing underscore. */
export const HANDLE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,18}[A-Za-z0-9]$/;

/**
 * Reserved words. Compared on the folded form (lowercase, underscores removed),
 * so one entry covers every underscore-spelling of it.
 *
 * Grouped by what each group protects. Add generously; the cost of a name on
 * this list is that one person has to pick a different one.
 */
export const RESERVED_HANDLES: readonly string[] = [
  // --- mention scope. The reason this list exists. -----------------------
  'everyone', 'here', 'all', 'channel', 'room', 'rooms', 'circle', 'circles',
  'group', 'thread', 'online', 'members',

  // --- the team, and every word that stands in for it --------------------
  'admin', 'admins', 'administrator', 'administrators', 'mod', 'mods',
  'moderator', 'moderators', 'staff', 'team', 'owner', 'owners', 'founder',
  'founders', 'ceo', 'official', 'verified', 'root', 'superuser', 'sudo',
  'system', 'sys', 'operator', 'op',

  // --- the product and the assistant -------------------------------------
  'kai', 'kaiai', 'askkai', 'cheatcode', 'cheatcodeai', 'cheatcodeclub',
  'cheat', 'code', 'club', 'thecheatcode', 'ai', 'bot', 'bots', 'assistant',
  'kaibot',

  // --- functions a member could be mistaken for --------------------------
  'support', 'help', 'helpdesk', 'contact', 'billing', 'payments', 'payment',
  'sales', 'security', 'abuse', 'legal', 'privacy', 'terms', 'compliance',
  'info', 'noreply', 'donotreply', 'postmaster', 'webmaster', 'hostmaster',
  'notifications', 'notification', 'alerts', 'alert', 'announcement',
  'announcements', 'moderation', 'report', 'reports',

  // --- names that are also routes in this app ----------------------------
  'api', 'app', 'www', 'mail', 'ftp', 'cdn', 'static', 'assets', 'dev', 'test',
  'staging', 'prod', 'production', 'home', 'feed', 'community', 'messages',
  'message', 'chat', 'trade', 'trades', 'watchlist', 'positions', 'position',
  'orders', 'order', 'portfolio', 'market', 'markets', 'desk', 'live', 'show',
  'setup', 'setups', 'settings', 'account', 'accounts', 'profile', 'profiles',
  'contributor', 'contributors', 'invite', 'invites', 'credits', 'plans',

  // --- words that would read as a state rather than a person -------------
  'null', 'undefined', 'none', 'nobody', 'anonymous', 'anon', 'deleted',
  'removed', 'guest', 'user', 'users', 'me', 'my', 'self', 'you', 'new',

  // --- authentication. A handle must never look like a prompt. -----------
  'login', 'logout', 'signin', 'signup', 'signout', 'register', 'auth',
  'oauth', 'token', 'password', 'passwords', 'reset', 'verify', 'confirm',
  'session',
];

const RESERVED_SET = new Set(RESERVED_HANDLES.map((h) => h.replace(/_/g, '').toLowerCase()));

/** Lowercase, underscores removed. What reservation is compared on. */
export function foldHandle(handle: string): string {
  return handle.replace(/_/g, '').toLowerCase();
}

/** Lowercase. What UNIQUENESS is compared on (the DB index does the same). */
export function normaliseHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED_SET.has(foldHandle(handle.trim()));
}

export type HandleCheck = { ok: true } | { ok: false; reason: HandleProblem; plain: string };

export type HandleProblem =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'bad_characters'
  | 'bad_start'
  | 'bad_end'
  | 'double_underscore'
  | 'reserved';

/**
 * Every refusal names the rule it broke and what to do instead. "Invalid
 * username" is the version of this that makes people guess.
 */
export function checkHandle(raw: string): HandleCheck {
  const h = (raw ?? '').trim();
  if (!h) return { ok: false, reason: 'empty', plain: 'Pick a username first.' };
  if (h.length < HANDLE_MIN) {
    return { ok: false, reason: 'too_short', plain: `A username is at least ${HANDLE_MIN} characters.` };
  }
  if (h.length > HANDLE_MAX) {
    return { ok: false, reason: 'too_long', plain: `A username is at most ${HANDLE_MAX} characters.` };
  }
  if (/[^A-Za-z0-9_]/.test(h)) {
    return {
      ok: false,
      reason: 'bad_characters',
      plain: 'Letters, numbers and underscores only — no spaces, dots or dashes.',
    };
  }
  if (!/^[A-Za-z]/.test(h)) {
    return { ok: false, reason: 'bad_start', plain: 'A username starts with a letter.' };
  }
  if (/_$/.test(h)) {
    return { ok: false, reason: 'bad_end', plain: 'A username cannot end with an underscore.' };
  }
  if (/__/.test(h)) {
    return { ok: false, reason: 'double_underscore', plain: 'Use one underscore at a time, not two together.' };
  }
  if (isReservedHandle(h)) {
    return {
      ok: false,
      reason: 'reserved',
      plain: `"${h}" is kept for the Cheat Code team and for the app itself, so it cannot be a member's name. Pick another one.`,
    };
  }
  return { ok: true };
}

/** The sentence shown when somebody else already has it. */
export const HANDLE_TAKEN_PLAIN = 'Somebody already has that username.';

/**
 * Alternatives to offer after a collision. They are SUGGESTIONS ONLY — every
 * one is still checked against the database before it is shown, because a
 * suggestion that is also taken is worse than no suggestion.
 *
 * Derived from what the person typed, never from their email address.
 */
export function handleSuggestions(base: string, count = 3): string[] {
  const stem = base.trim().replace(/[^A-Za-z0-9_]/g, '').replace(/_+$/, '').slice(0, HANDLE_MAX - 2);
  if (!stem || !/^[A-Za-z]/.test(stem)) return [];
  const out: string[] = [];
  for (let n = 1; out.length < count && n < 40; n += 1) {
    const candidate = `${stem}${n + 1}`;
    if (candidate.length <= HANDLE_MAX && checkHandle(candidate).ok) out.push(candidate);
  }
  return out;
}

/**
 * A SUGGESTION for somebody who has no handle yet. It is shown in the box for
 * them to accept or overwrite; it is never written without them pressing save.
 *
 * IT NEVER COMES FROM AN EMAIL ADDRESS. Deriving `k.coffie90` from
 * `kcoffie90@gmail.com` is calling somebody by their login and dressing it up
 * as a name they chose — an earlier lane rejected exactly that for
 * `display_name` and was right. If there is no display name to work from, this
 * returns null and the box starts empty.
 */
export function suggestFromDisplayName(displayName: string | null | undefined): string | null {
  const source = (displayName ?? '').trim();
  if (!source) return null;
  const stem = source
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, HANDLE_MAX);
  if (stem.length < HANDLE_MIN) return null;
  const candidate = stem.charAt(0).toLowerCase() + stem.slice(1);
  return checkHandle(candidate).ok ? candidate : null;
}
