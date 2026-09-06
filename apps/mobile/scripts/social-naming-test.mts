/**
 * A MEMBER'S NAME IS SAID ONCE.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. Found by publishing a real call against a real API
 * rather than against fixtures. A member who has picked a handle but never set
 * a display name comes back from `/community/calls` with
 * `display_name: "@proofcaller"` — the server's fallback, and the right one,
 * because the alternatives it is avoiding are leaking an email address or a raw
 * uuid. But the author line then printed the name AND the handle beneath it:
 *
 *     @proofcaller
 *     @proofcaller
 *
 * `features/community/ui/Message.tsx` already refuses to do this, in a comment
 * worth quoting because this is the second place it came up: the handle line
 * "never repeats the display name with an @ in front of it, because that would
 * be a mention nobody can type."
 *
 * EVERY FIXTURE IN THIS APP HAS A DISPLAY NAME, so the browser proof cannot see
 * this and never will — the case only exists on a real account that skipped the
 * name step. That is exactly what a unit test is for.
 *
 * THE OTHER HALF, which is the half a first attempt got wrong: suppressing too
 * much. "Jordan" with the handle `jordan` is NOT a repeat. Those two strings do
 * different jobs — one is what he is called, the other is how you type him into
 * a room — and the handle line is the only place a member learns the mention
 * exists. A helper that hides it has made the screen worse, not tidier.
 */
import { secondaryHandle } from '../src/features/social/naming';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

console.log('\nThe bug: a name that is already the handle');
{
  ok(
    'a display name that IS the @handle prints no second line',
    secondaryHandle('@proofcaller', 'proofcaller') === null,
    secondaryHandle('@proofcaller', 'proofcaller'),
  );
  ok(
    'and case does not rescue it — handles are unique case-insensitively',
    secondaryHandle('@ProofCaller', 'proofcaller') === null,
  );
  ok(
    'nor does surrounding whitespace',
    secondaryHandle('  @proofcaller  ', 'proofcaller') === null,
  );
}

console.log('\nThe over-correction: a real name beside its handle');
{
  ok(
    'a real name keeps its handle line',
    secondaryHandle('Jordan', 'jordan') === '@jordan',
    secondaryHandle('Jordan', 'jordan'),
  );
  ok(
    'even when the name matches the handle exactly but for the @',
    secondaryHandle('jordan', 'jordan') === '@jordan',
  );
  ok('a normal pair is untouched', secondaryHandle('Dee Okafor', 'dee') === '@dee');
  ok('and one with punctuation', secondaryHandle('Marcus T.', 'marcusk') === '@marcusk');
}

console.log('\nNothing to say');
{
  ok('no handle means no line', secondaryHandle('Jordan', null) === null);
  ok('an empty handle is not a handle', secondaryHandle('Jordan', '   ') === null);
  ok('and a missing name does not crash the line off', secondaryHandle(null, 'dee') === '@dee');
  ok('nor an undefined one', secondaryHandle(undefined, 'dee') === '@dee');
  ok('neither present is still nothing', secondaryHandle(null, null) === null);
}

console.log('\nThe function is PURE');
{
  const a = secondaryHandle('Jordan', 'jordan');
  const b = secondaryHandle('Jordan', 'jordan');
  ok('the same input gives the same answer', a === b);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
