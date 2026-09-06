/**
 * WHERE THE UPLOAD CEILING ACTUALLY IS — measured, not assumed.
 *
 * `lib/media/limits.ts` sets the photo limit at 4 MiB and says the reason is
 * the platform's request-body cap. That is a claim about somebody else's
 * infrastructure, and this repo's rule is that a number in a comment has to
 * have been observed. So this posts real bodies of increasing size at a real
 * deployment and records, for each one, what came back.
 *
 * It also decides the video question with the same evidence: if a body of N MB
 * cannot reach the function, then a phone video cannot either, and no amount of
 * client-side care changes that.
 *
 * RUN, against the deployment you actually care about:
 *   API=https://cheatcode-ai-api.vercel.app npx tsx --env-file=.env.prod scripts/media-limits-proof.mts
 *   API=http://localhost:3000               npx tsx --env-file=.env.local scripts/media-limits-proof.mts
 *
 * It signs in as a throwaway account, so it needs SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY, and it deletes the account and
 * anything it managed to store before it exits.
 *
 * The bodies are junk bytes, not pictures, so every one that REACHES the
 * function is refused by the stripper. That is the point: a refusal in OUR
 * words means the request arrived; anything else means it did not.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API = process.env.API ?? 'http://localhost:3000';
const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL_ || !SERVICE || !ANON) {
  console.error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY. Run from apps/api.');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const SIZES_MB = [1, 3, 4, 4.4, 5, 8, 16, 25];

async function main() {
  console.log(`\nUPLOAD CEILING — measured against ${API}\n`);

  const email = `medialimit-${Date.now()}@cheatcode.test`;
  const password = 'Test-Passw0rd-media!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;

  try {
    const anon = createClient(URL_!, ANON!, { auth: { persistSession: false } });
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error(signed.error?.message);
    const token = signed.data.session.access_token;

    console.log('  body      status  what came back');
    console.log('  --------  ------  ------------------------------------------------');

    for (const mb of SIZES_MB) {
      const bytes = new Uint8Array(Math.round(mb * 1024 * 1024));
      // A JPEG signature at the front, so a body that arrives is refused by the
      // stripper for being a broken JPEG rather than for not being a picture —
      // which tells us it walked far enough into the code to matter.
      bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);

      const form = new FormData();
      form.append('purpose', 'message');
      form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'probe.jpg');

      let status = 0;
      let note = '';
      const started = Date.now();
      try {
        const res = await fetch(`${API}/api/v1/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        status = res.status;
        const text = await res.text();
        try {
          const j = JSON.parse(text);
          note = j?.error?.message ?? j?.plain ?? text.slice(0, 60);
        } catch {
          // Not JSON: this is the platform answering, not this app. That IS the
          // finding — the request never reached a line of our code.
          note = `NOT OUR RESPONSE — ${text.replace(/\s+/g, ' ').slice(0, 60)}`;
        }
      } catch (e) {
        note = `connection failed: ${e instanceof Error ? e.message : String(e)}`;
      }

      console.log(
        `  ${String(mb).padEnd(8)}  ${String(status || '-').padEnd(6)}  ${note}   (${Date.now() - started}ms)`
      );
    }

    console.log(
      '\n  READ IT LIKE THIS: a row whose message is one of our sentences arrived at\n' +
        '  the function. A row that is 413, a connection reset, or HTML did not — and\n' +
        '  nothing this app can do would let a file that size be checked or stripped.\n'
    );
  } finally {
    await admin.from('media_assets').delete().eq('owner_id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
