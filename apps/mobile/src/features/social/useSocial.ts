/**
 * The social layer's state, in one place.
 *
 * Every hook here follows the house loading contract — `loading`, `error`,
 * `isFixture`, `reload` — and the `api.available()` rule that governs the
 * whole app: fixtures render offline so the owner and Playwright can see every
 * screen, and a REAL stack that has not deployed the route yet says so rather
 * than showing sample members. Sample people with sample records on a live
 * account would be fabricated members, not placeholders.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import {
  fixtureCommunityCalls, fixtureContributorSocial, fixtureFollowFeed, fixtureFollowState,
  fixtureLeaderboard,
} from '../../lib/fixtures';
import type {
  CommunityCall, ContributorSocial, FollowFeed, FollowState, GoalMode, Leaderboard,
  LeaderboardPeriod,
} from '../../lib/types';
import type { CreateCommunityCallBody } from '@cheatcode/shared';

/** `GET /feed/following`. */
export function useFollowFeed() {
  return useResource<FollowFeed>(() => api.followFeed(), fixtureFollowFeed, []);
}

/** `GET /community/calls?user_id=` — everything, or one member's. */
export function useCommunityCalls(userId?: string) {
  const seed = userId
    ? fixtureCommunityCalls.filter((c) => c.author.user_id === userId)
    : fixtureCommunityCalls;
  return useResource<CommunityCall[]>(() => api.communityCalls(userId), seed, [userId ?? '']);
}

/**
 * `GET /community/calls?mode=` — ONE DESK'S calls, newest first.
 *
 * The Community tab on the Swing and Day Trade boards. It is deliberately not
 * folded into the alerts payload: a member's call is not a house alert, it has
 * no grade and no lifecycle, and the route that already answers this question
 * has an index built for exactly this read. Widening `/alerts` to carry a
 * second kind of object would have put them in one payload and, sooner or
 * later, in one list.
 *
 * Offline the fixtures are filtered by the same `mode` the server filters on,
 * so the fixture board and the real board disagree about nothing.
 */
export function useDeskCalls(mode: GoalMode) {
  const seed = fixtureCommunityCalls.filter((c) => c.mode === mode);
  return useResource<CommunityCall[]>(() => api.communityCallsByMode(mode), seed, [mode]);
}

/** `GET /contributors/:id` — the community half of a profile. */
export function useContributorSocial(userId: string) {
  const seed: ContributorSocial = {
    ...fixtureContributorSocial,
    follow: { ...fixtureContributorSocial.follow, user_id: userId || fixtureContributorSocial.follow.user_id },
  };
  return useResource<ContributorSocial>(() => api.contributorSocial(userId), seed, [userId]);
}

/**
 * `GET /leaderboard?period=`.
 *
 * The period is kept here rather than remounting the resource, so switching
 * "This week" to "All time" never blanks the board — the old rows stay until
 * the new ones land, which is the difference between a filter and a reload.
 */
export function useLeaderboard(initial: LeaderboardPeriod = 'week') {
  const offline = !api.available();
  const [period, setPeriod] = useState<LeaderboardPeriod>(initial);
  const [data, setData] = useState<Leaderboard | null>(offline ? fixtureLeaderboard(initial) : null);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (offline) { setData(fixtureLeaderboard(period)); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api.leaderboard(period)
      .then((b) => { if (alive) { setData(b); setError(null); } })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError && e.code === 'NOT_FOUND'
          ? "That part of the service isn't live yet."
          : e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [offline, period, tick]);

  return {
    data, loading, error, period, setPeriod,
    isFixture: offline,
    reload: () => setTick((t) => t + 1),
  };
}

/**
 * ONE MEMBER'S FOLLOW STATE, AND THE TAP THAT CHANGES IT.
 *
 * Optimistic, then corrected. The button flips on the press — a follow that
 * waits for a round trip feels broken — and the server's own answer is written
 * over it when it arrives, counts and all. On a refusal the old state goes
 * back and the server's sentence is handed to the caller; nothing is left
 * looking as though it counted when it did not.
 *
 * `initial` is the state the surrounding payload already carried. Passing it
 * means no second request just to draw a button that the profile response
 * already answered.
 */
export function useFollow(userId: string, initial?: FollowState | null) {
  const offline = !api.available();
  const [state, setState] = useState<FollowState | null>(
    initial ?? (offline ? { ...fixtureFollowState, user_id: userId } : null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (initial) setState(initial);
    else if (offline) setState({ ...fixtureFollowState, user_id: userId });
  }, [initial, offline, userId]);

  const toggle = useCallback(async (): Promise<boolean> => {
    const before = state;
    const next = !(before?.following ?? false);
    setError(null);
    setState((s) => (s
      ? { ...s, following: next, follower_count: Math.max(0, s.follower_count + (next ? 1 : -1)) }
      : { user_id: userId, following: next, follower_count: next ? 1 : 0, following_count: 0 }));

    if (offline) return next;

    setBusy(true);
    try {
      const settled = next ? await api.follow(userId) : await api.unfollow(userId);
      if (alive.current) setState(settled);
      return settled.following;
    } catch (e) {
      if (alive.current) {
        setState(before);
        setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
      }
      return before?.following ?? false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [offline, state, userId]);

  return {
    following: state?.following ?? false,
    followerCount: state?.follower_count ?? null,
    followingCount: state?.following_count ?? null,
    busy,
    error,
    toggle,
  };
}

/**
 * The server's level refusals, in sentences.
 *
 * `stop_not_below_entry` is a database constraint's name. It is correct, it is
 * useful in a log, and it is not something to put in front of a person who has
 * just typed two numbers into a box. Anything not on this list falls through
 * to the server's own `message_plain`, which is always more specific than
 * anything this file could invent.
 */
export const LEVEL_ERRORS: Record<string, string> = {
  stop_not_below_entry: 'On a long, the stop has to sit below the entry — that is what makes it a stop.',
  target_not_above_entry: 'On a long, the target has to sit above the entry.',
  stop_not_above_entry: 'On a short, the stop has to sit above the entry — that is where the idea is wrong.',
  target_not_below_entry: 'On a short, the target has to sit below the entry.',
};

export function plainLevelError(e: unknown): string {
  if (e instanceof ApiError) {
    const known = LEVEL_ERRORS[e.code] ?? LEVEL_ERRORS[e.message.trim()];
    if (known) return known;
    return e.message;
  }
  return e instanceof Error ? e.message : 'That did not publish. Nothing was sent.';
}

/** Publish a call. Nothing is written until `publish` is called. */
export function usePublishCall() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<CommunityCall | null>(null);

  const publish = useCallback(async (body: CreateCommunityCallBody): Promise<CommunityCall | null> => {
    setBusy(true);
    setError(null);
    try {
      if (!api.available()) {
        // Fixtures: the preview the composer is already showing IS the card,
        // so the offline path returns it rather than a different one.
        const local: CommunityCall = {
          id: `call-local-${Date.now()}`,
          author: fixtureCommunityCalls[0].author,
          symbol: body.symbol.toUpperCase(),
          direction: body.direction,
          entry: body.entry ?? null,
          stop: body.stop ?? null,
          target: body.target ?? null,
          thesis: body.thesis,
          // The desk the server will stamp. `CreateCommunityCallBody` does not
          // carry one yet, so offline this is the default the contract itself
          // defaults to rather than a guess of our own. Offline there is also
          // no room to post into, so the message receipt stays honestly empty.
          mode: 'day_trade',
          message_id: null,
          scoreable: body.entry != null && (body.stop != null || body.target != null),
          status: 'open',
          result_pct: null,
          outcome_label: 'Still open',
          published_at: new Date().toISOString(),
          time_label: 'just now',
          resolved_at: null,
        };
        setPublished(local);
        return local;
      }
      const call = await api.createCommunityCall(body);
      setPublished(call);
      return call;
    } catch (e) {
      setError(plainLevelError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { publish, busy, error, published, clearError: () => setError(null) };
}
