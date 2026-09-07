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
import { handleForStorage } from '@/lib/handles';
import { avatarForStorage } from '@/lib/avatars';

export const dynamic = 'force-dynamic';

export const PUT = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, SettingsRound4Request);
  const db = serviceClient();
  const profile = await loadProfile(ctx.user.id);

  const profilePatch: Record<string, unknown> = {};
  if (body.explanation_level) profilePatch.explanation_level = body.explanation_level;

  /**
   * WHO THIS PERSON IS.
   *
   * `handle` is validated and its availability checked BEFORE anything else in
   * this request is written, so a taken username never half-saves a settings
   * change. `handleForStorage` throws the sentence the member should read.
   *
   * `null` clears it. `undefined` — the field simply absent — leaves it alone,
   * which is what every other field in this route does and what a PATCH means.
   *
   * The database has the same rules in `profiles_identity_guard` (0034) and
   * gets the last word, because the phone can write `profiles` directly.
   */
  if (body.handle !== undefined) {
    profilePatch.handle = body.handle === null ? null : await handleForStorage(body.handle, ctx.user.id);
  }
  if (body.display_name !== undefined) {
    const name = body.display_name === null ? null : body.display_name.trim();
    profilePatch.display_name = name ? name : null;
  }
  /**
   * The address of an image the media lane has already stored. This route does
   * NOT upload anything and must not grow an upload — `POST /api/v1/media`
   * with purpose `avatar` is the one upload path in this app. All that happens
   * here is that the address is checked to be ours and written down.
   *
   * THE REQUEST'S OWN ORIGIN IS PASSED IN because that upload returns an
   * address on THIS API (`<origin>/api/v1/media/<id>`), not on Supabase. Read
   * the header of `lib/avatars.ts`: without this argument the check rejected
   * the exact URL the upload had just handed the member.
   */
  if (body.avatar_url !== undefined) {
    profilePatch.avatar_url = body.avatar_url === null
      ? null
      : avatarForStorage(body.avatar_url, new URL(req.url).origin);
  }

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

  /**
   * SHARING IS RETROACTIVE AND THAT IS THE POINT. Switching this off does not
   * merely stop new trades being shown — every existing `trade_shares` row
   * stops being readable, because the one read path in this app joins this
   * column (see the header of `lib/social/shares.ts`). The rows are kept rather
   * than deleted so switching it back on restores the record instead of
   * starting a suspiciously clean new one.
   */
  if (body.share_trades !== undefined) profilePatch.share_trades = body.share_trades;
  // Mode is the one financial-adjacent field this endpoint may touch: it
  // changes what Kai scans, not what the user is allowed to risk.
  if (body.mode) profilePatch.primary_mode = body.mode;

  if (Object.keys(profilePatch).length) {
    const { error } = await db.from('profiles').update(profilePatch).eq('user_id', ctx.user.id);
    if (error) {
      throw new ApiError('INTERNAL', 'We could not save that change. Please try again.', { detail: error.message });
    }
  }

  const touchesNotifications =
    body.quiet_hours !== undefined ||
    body.notifications !== undefined ||
    body.push_enabled !== undefined ||
    body.notification_categories !== undefined;

  if (touchesNotifications) {
    const patch: Record<string, unknown> = { user_id: ctx.user.id };
    if (body.quiet_hours !== undefined) patch.quiet_hours = body.quiet_hours;
    if (body.notifications) patch.per_mode = body.notifications.per_mode;
    if (body.push_enabled !== undefined) patch.push_enabled = body.push_enabled;
    // Round 5: categories are MERGED, never replaced. Two switches flipped from
    // two screens must not clobber each other, and an absent key means "on" —
    // so a patch of `{community:false}` has to leave the other four absent
    // rather than writing four `true`s that would then have to be maintained.
    if (body.notification_categories) {
      const { data: existing } = await db
        .from('notification_prefs')
        .select('categories')
        .eq('user_id', ctx.user.id)
        .maybeSingle();
      const current = ((existing as { categories?: Record<string, boolean> } | null)?.categories ?? {}) as Record<
        string,
        boolean
      >;
      patch.categories = { ...current, ...body.notification_categories };
    }
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
    .select('per_mode,quiet_hours,push_enabled,categories')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  const row = (np.data as Record<string, unknown> | null) ?? null;

  // Read back separately because `loadProfile` does not select it: this column
  // arrived with 0038 and `ProfileRow` belongs to the Kai context lane.
  const sharing = await db.from('profiles').select('share_trades').eq('user_id', ctx.user.id).maybeSingle();
  const shareTrades = (sharing.data as Record<string, unknown> | null)?.share_trades === true;

  return ok(
    SettingsResponse.parse({
      profile: {
        user_id: updated.user_id,
        handle: updated.handle,
        avatar_url: updated.avatar_url,
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
        // No row yet means the user has never said no: 0024's column default is
        // `true` and the absence of a row means the same thing.
        push_enabled: row ? row.push_enabled !== false : true,
        notification_categories: (row?.categories as Record<string, boolean>) ?? {},
        // ALWAYS SENT, never left to the schema default. `share_trades` defaults
        // to `false` in the contract, so an omitted field would tell a member
        // who has sharing ON that it is off — and the switch they are looking at
        // would flip back under them on the next save.
        share_trades: shareTrades,
      },
      plain: 'Saved.',
    })
  );
});
