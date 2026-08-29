/**
 * Whose workspace does a SHOW draw into?
 *
 * `chart_annotations.user_id` is NOT NULL and is the OWNER of the mark, not its
 * author (0021 §3 says so explicitly, and gives the reason: a nullable owner
 * cannot express "hidden by A but not by B" without a second table). A show has
 * no user. So the show gets one: a stage account, created once, whose workspace
 * every Kai-drawn show annotation lives in.
 *
 * WHY THIS AND NOT A NULLABLE OWNER OR A SEPARATE TABLE.
 *  - A nullable `user_id` would reopen the decision 0021 made deliberately, and
 *    would make every show mark either globally visible or globally invisible.
 *  - A `live_annotations` table would be a second annotation model, which is the
 *    thing the round-4 brief spent a migration avoiding — and LIVE-3's "open
 *    this in my Trade Portal, with Kai's marks already on it" would then have to
 *    translate between two shapes.
 *  - A stage account is just a workspace. The show's marks are ordinary
 *    annotations with `provenance: 'kai'`, carried inline on every `ChartFrame`
 *    so a viewer renders them without reading anybody's rows, and LIVE-3 copies
 *    them into the viewer's own workspace when they tap "open in Trade Portal".
 *
 * The account is created with a random password and is never signed into. It
 * exists to satisfy a foreign key and to give the show's marks somewhere to
 * live that the RLS model already understands.
 */
import { serviceClient } from '@/lib/db';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/errors';
import { log } from '@/lib/log';

const EMAIL = () => env('LIVE_STAGE_USER_EMAIL') ?? 'stage@kai-live.local';

let cachedId: string | null = null;

/** The stage account's user id, creating the account the first time. */
export async function stageUserId(): Promise<string> {
  if (cachedId) return cachedId;
  const db = serviceClient();
  const email = EMAIL();

  const existing = await db.from('profiles').select('user_id').eq('display_name', 'Kai Live').maybeSingle();
  if (existing.data?.user_id) {
    cachedId = String(existing.data.user_id);
    return cachedId;
  }

  const created = await db.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { display_name: 'Kai Live', kind: 'stage' },
  });

  if (created.error || !created.data?.user) {
    // Already there under a different display name (a re-run after the profile
    // trigger changed, say). Find it by listing rather than failing the show.
    const list = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list.data?.users?.find((u) => u.email === email);
    if (!found) {
      throw new ApiError('INTERNAL', 'The show has nowhere to draw its marks.', {
        detail: created.error?.message,
      });
    }
    cachedId = found.id;
  } else {
    cachedId = created.data.user.id;
    log('info', '-', 'live.stage_user_created', { user_id: cachedId });
  }

  // `handle_new_user` creates the profile row; make the display name legible so
  // anyone reading the table can see what this account is for.
  await db.from('profiles').update({ display_name: 'Kai Live' }).eq('user_id', cachedId);
  return cachedId;
}

/** Test seam — the smoke and contract runners create and drop stage accounts. */
export function resetStageUserCache(): void {
  cachedId = null;
}
