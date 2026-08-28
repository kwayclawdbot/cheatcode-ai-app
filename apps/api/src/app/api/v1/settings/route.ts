/**
 * PUT /api/v1/settings
 *
 * Explanation level, quiet hours, per-mode notification preferences and
 * accessibility. Nothing here can change financial behaviour — risk policy has
 * its own journaled endpoint (02 §1) and is deliberately not reachable from
 * this one.
 */
import type { NextRequest } from 'next/server';
import { EXPERIENCE_TO_LEVEL, SettingsRound4Request, SettingsResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { loadProfile } from '@/lib/kai/context';
import { readPrefs, writePrefs } from '@/lib/prefs';
import { writeKaiProfile } from '@/lib/round4/profile-round4';

export const dynamic = 'force-dynamic';

export const PUT = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, SettingsRound4Request);
  const db = serviceClient();
  const profile = await loadProfile(ctx.user.id);

  const profilePatch: Record<string, unknown> = {};
  if (body.explanation_level) profilePatch.explanation_level = body.explanation_level;

  // Round 4: the Account board's Kai-profile rows. `experience` is the word the
  // user picked (new / some / pro); `experience_level` and `explanation_level`
  // are the schema's mapping of it, so changing one word changes Kai's voice
  // AND the depth of the explanations, which is what the row promises.
  let onboarding = body.accessibility ? writePrefs(profile.onboarding, body.accessibility) : profile.onboarding;
  if (body.experience || body.focus) {
    const written = writeKaiProfile(onboarding, { experience: body.experience, focus: body.focus });
    onboarding = written.onboarding;
    if (written.explanationLevel && !body.explanation_level) {
      profilePatch.explanation_level = written.explanationLevel;
      profilePatch.experience = EXPERIENCE_TO_LEVEL[body.experience!];
    }
  }
  if (onboarding !== profile.onboarding) profilePatch.onboarding = onboarding;
  // Mode is the one financial-adjacent field this endpoint may touch: it
  // changes what Kai scans, not what the user is allowed to risk.
  if (body.mode) profilePatch.primary_mode = body.mode;

  if (Object.keys(profilePatch).length) {
    const { error } = await db.from('profiles').update(profilePatch).eq('user_id', ctx.user.id);
    if (error) {
      throw new ApiError('INTERNAL', 'We could not save that change. Please try again.', { detail: error.message });
    }
  }

  if (body.quiet_hours !== undefined || body.notifications) {
    const patch: Record<string, unknown> = { user_id: ctx.user.id };
    if (body.quiet_hours !== undefined) patch.quiet_hours = body.quiet_hours;
    if (body.notifications) patch.per_mode = body.notifications.per_mode;
    const { error } = await db.from('notification_prefs').upsert(patch as never, { onConflict: 'user_id' });
    if (error) {
      throw new ApiError('INTERNAL', 'We could not save that change. Please try again.', { detail: error.message });
    }
  }

  await emitUserEvent(
    ctx.user.id,
    'system',
    'profile',
    ctx.user.id,
    { event: 'settings_changed', fields: Object.keys(body) },
    ctx.requestId
  );

  const updated = await loadProfile(ctx.user.id);
  const np = await db
    .from('notification_prefs')
    .select('per_mode,quiet_hours')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  const row = (np.data as Record<string, unknown> | null) ?? null;

  return ok(
    SettingsResponse.parse({
      profile: {
        user_id: updated.user_id,
        handle: null,
        display_name: updated.display_name,
        primary_mode: updated.primary_mode,
        experience: updated.experience,
        involvement: updated.involvement,
        explanation_level: updated.explanation_level,
        memory_enabled: updated.memory_enabled,
        timezone: updated.timezone,
        onboarding: updated.onboarding,
      },
      prefs: {
        explanation_level: updated.explanation_level,
        quiet_hours: (row?.quiet_hours as never) ?? null,
        notifications: { per_mode: (row?.per_mode as Record<string, unknown>) ?? {} },
        accessibility: readPrefs(updated.onboarding).accessibility,
      },
      plain: 'Saved.',
    })
  );
});
