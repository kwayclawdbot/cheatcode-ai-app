/**
 * WHAT THE APP CLAIMS ABOUT A PLAN MUST MATCH WHAT THE SERVER WILL ENFORCE.
 *
 * The bug this exists to prevent shipped once already. `account/subscription.tsx`
 * built its second list by filtering the capabilities the API had marked
 * `included: false`, and then decided what that list MEANT from the tier:
 *
 *     <Eyebrow>{onFree ? 'Not on your plan' : 'Also open to you'}</Eyebrow>
 *     {onFree ? null : <Check color={green} />}
 *
 * On any paid plan, every excluded capability was drawn with a green tick under
 * the words "Also open to you". A paying member was told a feature was theirs
 * immediately before the server refused them with `ENTITLEMENT_REQUIRED`.
 *
 * IT WAS NOT HYPOTHETICAL. `supabase/migrations/0031_community_moderation.sql`
 * runs `update entitlement_flags set value = 'false' where flag =
 * 'circles_create'` with no tier filter, so a premium account carries a false
 * flag today and saw exactly that tick. The paid-tier case below is that row.
 *
 * The same screen also read a FAILED `/me` as the free plan: `currentKey` fell
 * back to `'free'`, so a timeout drew "Your plan / Free" over a VIP account.
 * A fault at our end must never be rendered as a downgrade, and that is the
 * third block below.
 *
 * ── WHY A NODE TEST AND NOT A BROWSER PROOF ──────────────────────────────────
 * Reproducing it in Playwright means a paid account with a false flag on a
 * running stack — a database state, not a screen state, and one nobody would
 * think to set up. The rule itself is a pure function
 * (`src/features/account/entitlements.ts`), so the rule is what is checked
 * here, plus a static read of the three files that must not re-introduce the
 * shapes the rule replaced.
 *
 *     npx tsx scripts/entitlement-test.mts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The source with its comments taken out.
 *
 * These files argue with themselves in prose — that is the house style, and
 * the header of `subscription.tsx` quotes the exact wording of the bug it
 * fixed ("Also open to you") so the next person cannot reinstate it by
 * accident. A check that read the comments would fail on the explanation of
 * why the thing is gone, which would be an absurd reason to go red. So the
 * assertions below read CODE.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

const { buildEntitlementView } = await import('../src/features/account/entitlements.ts');
const { fixtureMe, fixtureCreditsPayload } = await import('../src/lib/fixtures.ts');

type Me = typeof fixtureMe;
type Flag = Me['entitlements'][number];

let failures = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
};
const head = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

console.log('entitlements');

/* ==================================================================== */
/* The flags, as the two tiers actually carry them                       */
/* ==================================================================== */

/** `supabase/seed.sql` + migration 0030, for a free account. */
const FREE_FLAGS: Flag[] = [
  { key: 'alerts_max_active', label: 'Alerts Kai watches at once', value_plain: '5 at a time', included: true },
  { key: 'community_post_scope', label: 'Where you can post', value_plain: 'Beginner rooms', included: true },
  { key: 'broker_connect', label: 'Connect a real broker', value_plain: 'Premium', included: false },
  { key: 'lms', label: 'Course library', value_plain: 'Premium', included: false },
  { key: 'circles_create', label: 'Circles create', value_plain: 'Premium', included: false },
  { key: 'trade_panel', label: 'Trade panel', value_plain: 'Premium', included: false },
];

/**
 * The same seed for a PAID account — and note `circles_create`, which
 * migration 0031 switched off for every tier without a `where tier =` clause.
 * This is the exact row that used to render as "Also open to you ✓".
 */
const PAID_FLAGS: Flag[] = [
  { key: 'alerts_max_active', label: 'Alerts Kai watches at once', value_plain: 'Unlimited', included: true },
  { key: 'community_post_scope', label: 'Where you can post', value_plain: 'All', included: true },
  { key: 'broker_connect', label: 'Connect a real broker', value_plain: 'Included', included: true },
  { key: 'lms', label: 'Course library', value_plain: 'Included', included: true },
  { key: 'circles_create', label: 'Circles create', value_plain: 'Premium', included: false },
  { key: 'trade_panel', label: 'Trade panel', value_plain: 'Included', included: true },
];

const accountOn = (tier: 'free' | 'premium', flags: Flag[]): Me => ({
  ...fixtureMe,
  subscription: { ...fixtureMe.subscription, tier },
  entitlements: flags,
});

const free = buildEntitlementView(accountOn('free', FREE_FLAGS), null);
const paid = buildEntitlementView(accountOn('premium', PAID_FLAGS), null);

/* ==================================================================== */

head('Every capability is rendered from its own `included` value');

for (const [name, view, flags] of [['free', free, FREE_FLAGS], ['paid', paid, PAID_FLAGS]] as const) {
  ok(
    `${name}: every flag lands in the strip its own value asks for`,
    flags.every((f) => view.state(f.key) === (f.included ? 'included' : 'excluded')),
    flags.filter((f) => view.state(f.key) !== (f.included ? 'included' : 'excluded')).map((f) => f.key).join(', '),
  );
  ok(
    `${name}: allows() and locked() are the same answer as the strip`,
    flags.every((f) => view.allows(f.key) === f.included && view.locked(f.key) === !f.included),
  );
  ok(
    `${name}: nothing appears in both lists, and nothing is left out of both`,
    view.included.length + view.excluded.length === flags.length
      && view.included.every((c) => !view.excluded.some((x) => x.key === c.key)),
  );
}

/**
 * THE HEART OF IT. Same flags, two tiers: the answers must be identical,
 * because a tier is a shorthand for a set of flags and the shorthand is the
 * thing that goes stale.
 */
const freeWithPaidFlags = buildEntitlementView(accountOn('free', PAID_FLAGS), null);
const paidWithPaidFlags = buildEntitlementView(accountOn('premium', PAID_FLAGS), null);
ok(
  'the tier changes no capability answer at all',
  PAID_FLAGS.every((f) => freeWithPaidFlags.state(f.key) === paidWithPaidFlags.state(f.key)),
);

head('A paid tier with an exclusion is not told it has the thing');

ok('the paid account really does carry an excluded capability', paid.excluded.length > 0);
ok('and it is the flag migration 0031 switched off', paid.excluded.some((c) => c.key === 'circles_create'));
ok('which is NOT in the "what your plan allows" strip', !paid.included.some((c) => c.key === 'circles_create'));
ok('and allows() refuses it', !paid.allows('circles_create'));
ok(
  'no excluded row carries a value that reads as availability',
  [...free.excluded, ...paid.excluded].every((c) => !/included|open to you|unlimited/i.test(c.value_plain)),
  [...free.excluded, ...paid.excluded].map((c) => `${c.key}=${c.value_plain}`).join(', '),
);

head('A service failure is not a downgrade to the free plan');

const down = buildEntitlementView(null, null);
ok('nothing is known', !down.known);
ok('there is no plan name — not even "Free"', down.planName === null);
ok('and no tier', down.tier === null);
ok('no capability is claimed', down.capabilities.length === 0 && down.included.length === 0);
ok('no capability is refused either', down.excluded.length === 0);
ok('every state is `unknown`', ['trade_panel', 'lms', 'anything_at_all'].every((k) => down.state(k) === 'unknown'));
ok('unknown never grants', ['trade_panel', 'lms'].every((k) => !down.allows(k)));
ok('unknown never locks — a padlock over a paying account is the same lie', ['trade_panel', 'lms'].every((k) => !down.locked(k)));
ok('and the Trade section is unknown, not closed', down.tradePanel === 'unknown');

/**
 * The partial failure: `/me` is down and `/credits` answered. The plan's NAME
 * is a real read and may be shown; what it covers is still unknown.
 */
const halfDown = buildEntitlementView(null, fixtureCreditsPayload);
ok('with only /credits answering, the plan name is read rather than guessed', halfDown.planName === fixtureCreditsPayload.credits?.plan_name);
ok('but its capabilities are still unknown', halfDown.capabilities.length === 0);
ok('and the tier is still unclaimed', halfDown.tier === null);

head('The Trade section: the enforcement path wins');

/**
 * `trade_panel` arrives twice — in `entitlement_flags`, which every
 * `/api/v1/trade` route reads, and in the credits block. `apps/api/src/lib/
 * kai/plans.ts` says the flag wins. If it did not, a stale plan row could
 * unlock a tab the server refuses.
 */
const flagSaysNo = buildEntitlementView(
  accountOn('premium', PAID_FLAGS.map((f) => (f.key === 'trade_panel' ? { ...f, included: false } : f))),
  { ...fixtureCreditsPayload, credits: { ...fixtureCreditsPayload.credits!, trade_panel: true } },
);
ok('a false flag beats a true credit block', flagSaysNo.tradePanel === 'excluded');
ok('and the plan list says the same thing', flagSaysNo.excluded.some((c) => c.key === 'trade_panel'));

const noFlag = buildEntitlementView(
  accountOn('premium', PAID_FLAGS.filter((f) => f.key !== 'trade_panel')),
  { ...fixtureCreditsPayload, credits: { ...fixtureCreditsPayload.credits!, trade_panel: true } },
);
ok('with no flag at all, the credit block answers', noFlag.tradePanel === 'included');

ok(
  'the Trade refusal and the plan list call the capability one thing',
  code('src/features/portal2/TradeLocked.tsx').includes('CAPABILITY_LABEL')
    && code('src/app/account/subscription.tsx').includes('features/account/entitlements'),
);

/* ==================================================================== */
/* The three files that must not grow the old shapes back                */
/* ==================================================================== */

head('The plan screen cannot re-derive an entitlement from the tier');

const sub = code('src/app/account/subscription.tsx');
ok('"Also open to you" is gone', !sub.includes('Also open to you'));
ok('the excluded strip is not chosen by the tier', !/onFree\s*\?\s*'Not on your plan'/.test(sub));
ok('and it never draws a tick', !/plan-excluded[\s\S]{0,600}<Check/.test(sub));
ok('the free plan is not a fallback for a failed read', !/\?\s*'vip'\s*:\s*'free'/.test(sub));
ok('a failed read has its own block instead', sub.includes('plan-unknown') && sub.includes('plan-retry'));
ok('every claim comes from the shared contract', sub.includes('useEntitlements'));

head('No setting on the Account board changes by being tapped');

const account = code('src/app/(tabs)/account.tsx');
const profileMod = code('src/features/account/profile.ts');
const useAccount = code('src/features/account/useAccount.ts');
ok('the cyclers are gone from the board', !/cycleMode|cycleExperience/.test(account));
ok('and from the hook that supplied them', !/const cycleMode|const cycleExperience/.test(useAccount));
ok('and the step functions they needed no longer exist', !/export function nextMode|export function nextExperience/.test(profileMod));
ok('the goal and guidance rows open a chooser', account.includes('setModeOpen(true)') && account.includes('setGuidanceOpen(true)'));
ok('guidance has an explicit selection sheet', account.includes('ChoiceSheet') && account.includes('sheet-guidance'));
ok('the board leads with Profile, Guidance, Practice account, Notifications, Plan', (() => {
  const order = ['PROFILE', 'GUIDANCE', 'PRACTICE ACCOUNT', 'NOTIFICATIONS', 'PLAN'];
  const at = order.map((s) => account.indexOf(`<Eyebrow>${s}</Eyebrow>`));
  return at.every((i) => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1]);
})());
ok('a failed settings write is reported and retryable', account.includes('SaveNote') && useAccount.includes('retry'));

head('The protections the audit asked to keep are still here');

ok('memory review and deletion', account.includes('nav-memory') && code('src/app/account/memory.tsx').includes('sheet-forget-all'));
ok('the trade-sharing switch and its promise', account.includes('toggle-share-trades') && account.includes('Size and dollars never are.'));
ok('the paper reset confirmation', code('src/app/account/paper.tsx').includes('sheet-reset'));
ok('the account deletion confirmation', account.includes('cta-delete-account-entry'));
ok('and the Ask Kai alternative when Trade is locked', code('src/features/portal2/TradeLocked.tsx').includes('trade-locked-ask'));

head('A release build cannot reach the simulated trade');

ok(
  'the developer action is behind __DEV__, not only an EXPO_PUBLIC flag',
  /DEV_BUILD\s*&&\s*env\.DEV_TOOLS/.test(account) && account.includes("typeof __DEV__ !== 'undefined'"),
);
ok(
  'and the button exists in exactly one place, inside that branch',
  (account.match(/cta-simulate-trade/g) ?? []).length === 1
    && account.indexOf('cta-simulate-trade') > account.indexOf('DEV_BUILD && env.DEV_TOOLS'),
);

console.log(failures ? `\n${failures} failed\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
