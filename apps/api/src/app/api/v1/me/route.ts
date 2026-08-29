/**
 * GET /api/v1/me
 *
 * Everything the Account tab needs in one read: profile, risk policy, the paper
 * account with whether a reset is available, subscription tier with its
 * entitlement flags, the memory switch, preferences (accessibility included),
 * broker state, and the counts the tab badges need.
 *
 * ACCESSIBILITY STORAGE (noted per the brief): `reduced_motion` and
 * `text_scale` live in `profiles.onboarding -> 'prefs'`. There is no
 * accessibility column in 01 and inventing one is SCHEMA-2's call, not this
 * lane's — `onboarding` is already the profile's free-form config bag, and
 * `prefs` namespaces it so an onboarding rewrite cannot collide with it.
 */
import type { NextRequest } from 'next/server';
import { MeRound6Response } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { env } from '@/lib/env';
import { loadProfile, loadRiskPolicy } from '@/lib/kai/context';
import { loadEntitlements } from '@/lib/entitlements';
import { canResetPaper, resetPlain } from '@/lib/paper';
import { readPrefs } from '@/lib/prefs';
import { kaiProfile, ruleAdherence } from '@/lib/round4/profile-round4';
import { loadStaffRole, staffPlain } from '@/lib/admin/staff';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const [profile, risk, ent, account, notifPrefs, counts, adherence, staffRole] = await Promise.all([
    loadProfile(ctx.user.id),
    loadRiskPolicy(ctx.user.id),
    loadEntitlements(ctx.user.id),
    db
      .from('accounts')
      .select('id,kind,name,starting_balance,cash,buying_power,equity,reset_count,last_reset_at')
      .eq('user_id', ctx.user.id)
      .eq('kind', 'paper')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from('notification_prefs')
      .select('per_mode,quiet_hours,push_enabled,categories')
      .eq('user_id', ctx.user.id)
      .maybeSingle(),
    countBlock(ctx.user.id),
    ruleAdherence(ctx.user.id),
    loadStaffRole(ctx.user.id),
  ]);

  const acc = (account.data as Record<string, unknown> | null) ?? null;
  const lastReset = (acc?.last_reset_at as string) ?? null;
  const canReset = canResetPaper(lastReset);
  const np = (notifPrefs.data as Record<string, unknown> | null) ?? null;
  const prefs = readPrefs(profile.onboarding);

  return ok(
    MeRound6Response.parse({
      profile: {
        user_id: profile.user_id,
        handle: null,
        display_name: profile.display_name,
        primary_mode: profile.primary_mode,
        experience: profile.experience,
        involvement: profile.involvement,
        explanation_level: profile.explanation_level,
        memory_enabled: profile.memory_enabled,
        timezone: profile.timezone,
        onboarding: profile.onboarding,
      },
      risk_policy: risk,
      account: {
        id: acc ? String(acc.id) : null,
        kind: 'paper',
        name: acc ? String(acc.name) : 'Paper account',
        starting_balance: acc ? numOrNull(acc.starting_balance) : null,
        cash: acc ? numOrNull(acc.cash) : null,
        buying_power: acc ? numOrNull(acc.buying_power) : null,
        equity: acc ? numOrNull(acc.equity) : null,
        reset_count: Number(acc?.reset_count ?? 0),
        last_reset_at: lastReset,
        can_reset: canReset,
        reset_plain: resetPlain(lastReset),
      },
      subscription: {
        tier: ent.tier,
        status: ent.status,
        current_period_end: ent.current_period_end,
        plain:
          ent.tier === 'premium'
            ? 'Premium. Unlimited watches, full posting, and priority when you ask me things.'
            : 'Free. Paper trading, five watches at a time, and the beginner rooms.',
      },
      entitlements: ent.flags,
      memory_enabled: profile.memory_enabled,
      prefs: {
        explanation_level: profile.explanation_level,
        quiet_hours: (np?.quiet_hours as never) ?? null,
        notifications: { per_mode: (np?.per_mode as Record<string, unknown>) ?? {} },
        accessibility: prefs.accessibility,
        // Round 5. `push_enabled` is INTENT, not OS permission — it survives a
        // reinstall and is what the app honours when the two disagree. An empty
        // `notification_categories` is a user who has never touched the
        // switches, and every category is on.
        push_enabled: np ? np.push_enabled !== false : true,
        notification_categories: (np?.categories as Record<string, boolean>) ?? {},
      },
      broker: { connected: false, plain: 'None — add a broker (later release).' },
      dev_tools: env('DEV_TOOLS') === '1',
      counts,

      // ---- round 4: the Account board's "Your Kai profile" rows ---------
      rule_adherence: adherence,
      kai_profile: kaiProfile({
        mode: profile.primary_mode,
        onboarding: profile.onboarding,
        experienceLevel: profile.experience,
      }),

      // ---- round 6: the operator's door -------------------------------
      // A COURTESY, NOT A CONTROL (brief §3). This is what the Account tab
      // reads to decide whether to draw the admin row, and it grants nothing:
      // every admin byte still comes from a `staffed()` route that asks
      // `staff_members` again. Re-derived on every /me, so a revoked role is
      // gone from the next screen the user opens rather than at token expiry.
      staff: {
        is_staff: staffRole !== null,
        role: staffRole,
        plain: staffPlain(staffRole),
      },
    })
  );
});

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function countBlock(userId: string) {
  const db = serviceClient();
  const [active, attention, unread, debriefs] = await Promise.all([
    db.from('alerts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
    db.from('alerts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'triggered'),
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('delivery', null),
    db.from('debriefs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return {
    active_alerts: active.count ?? 0,
    needs_attention: attention.count ?? 0,
    unread_notifications: unread.count ?? 0,
    debriefs: debriefs.count ?? 0,
  };
}
