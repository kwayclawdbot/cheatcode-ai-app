/**
 * QUIET, OR JUST UNANSWERED? (audit F18)
 *
 * `GET /home` has always been able to return nothing. It has never been able to
 * say WHY there is nothing — and the audit is blunt about the cost: "no alert,
 * a failed request and an expired setup have different implications for a
 * user", and "a failed load cannot be mistaken for a verified empty list."
 *
 * Today the client sees an absent priority and an empty watchlist and has no
 * way to tell the morning where genuinely nothing is happening from the morning
 * where the positions read threw. Those two mornings look identical and mean
 * opposite things to somebody deciding whether they are done for the day.
 *
 * So the route now reports what it CHECKED, not only what it found. Three
 * outcomes:
 *
 *   needs_you    something is asking for a decision. Not this file's business
 *                beyond naming it — the priority object already carries it.
 *   quiet        every read answered, and every one of them came back empty.
 *                This is a finding. It is allowed to say "your watchlist is up
 *                to date" because it actually looked.
 *   unverified   at least one read failed. "Nothing needs you" is then a thing
 *                we do not know, and the sentence says which part we could not
 *                open rather than rounding it down to calm.
 *
 * The rule that makes this worth having: `quiet` requires EVERY check to have
 * answered. One failure is enough to demote the whole standing, because a
 * member cannot act on a partial all-clear and should not be asked to work out
 * which half of it was real.
 */
import type { HomeStanding, StandingCheck } from '@shared/api';

export type StandingInput = {
  /** ISO instant this payload was assembled. Becomes "Last checked 8:42 AM". */
  checkedAt: string;
  /** True when something on this payload is asking for a decision. */
  needsDecision: boolean;
  /** Each read, with whether it ANSWERED — not whether it found anything. */
  reads: {
    setups: { ok: boolean; count: number };
    alerts: { ok: boolean; count: number };
    positions: { ok: boolean; count: number };
    plans: { ok: boolean; count: number };
    /** The briefing is Kai's prose; it may be absent without anything failing. */
    briefing: { ok: boolean; present: boolean };
  };
};

const LABEL: Record<StandingCheck['key'], string> = {
  setups: 'your setups',
  alerts: 'your alerts',
  positions: 'your open positions',
  plans: 'your planned trades',
  briefing: "this morning's report",
};

/** "your setups and your alerts" / "your setups, your alerts and your positions" */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function homeStanding(input: StandingInput): HomeStanding {
  const r = input.reads;
  const checks: StandingCheck[] = [
    { key: 'setups', label: LABEL.setups, ok: r.setups.ok, count: r.setups.ok ? r.setups.count : null },
    { key: 'alerts', label: LABEL.alerts, ok: r.alerts.ok, count: r.alerts.ok ? r.alerts.count : null },
    { key: 'positions', label: LABEL.positions, ok: r.positions.ok, count: r.positions.ok ? r.positions.count : null },
    { key: 'plans', label: LABEL.plans, ok: r.plans.ok, count: r.plans.ok ? r.plans.count : null },
    {
      key: 'briefing',
      label: LABEL.briefing,
      ok: r.briefing.ok,
      count: r.briefing.ok ? (r.briefing.present ? 1 : 0) : null,
    },
  ];

  const failed = checks.filter((c) => !c.ok);

  /**
   * A FAILED READ OUTRANKS A FOUND OBJECT — but only for the WORD, never for
   * the object. If the positions read failed and a setup is still asking for a
   * decision, that setup is real and stays on screen; what we refuse to say is
   * that it is the ONLY thing, because we did not manage to look everywhere.
   */
  if (failed.length) {
    const named = list(failed.map((c) => c.label));
    return {
      state: 'unverified',
      plain: input.needsDecision
        ? `There is something below that needs you. I could not check ${named} just now, so this is not the whole picture.`
        : `I could not check ${named} just now. I am not going to tell you your list is clear when I could not look at all of it.`,
      checked_at: input.checkedAt,
      checks,
    };
  }

  if (input.needsDecision) {
    return {
      state: 'needs_you',
      plain: 'One thing needs a decision.',
      checked_at: input.checkedAt,
      checks,
    };
  }

  /**
   * The one sentence on the board, and it is earned: every read above answered
   * and every one of them was empty. "Up to date" is a claim about work that
   * was done, so it is only allowed here.
   */
  return {
    state: 'quiet',
    plain: 'Nothing needs a decision. Your watchlist is up to date.',
    checked_at: input.checkedAt,
    checks,
  };
}
