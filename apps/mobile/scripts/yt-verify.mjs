#!/usr/bin/env node
/**
 * CURATED-VIDEO VERIFIER.
 * ===========================================================================
 *
 * The belt curriculum assigns SEGMENTS of other people's videos ("watch
 * 4:12–10:35"). A segment is a factual claim about a video, and the two ways to
 * get it wrong are both bad: a made-up timestamp sends a member to the wrong
 * part of a lesson, and a dead link sends them nowhere at all.
 *
 * Fetching a YouTube watch page does not answer either question — the page
 * arrives as a shell with none of the rendered metadata on it, which is exactly
 * how a curation pass ends up guessing. `yt-dlp -j` answers both from the
 * player response: real duration, real chapter markers, and the availability
 * flag that says whether the video is still public.
 *
 * USE
 *   node scripts/yt-verify.mjs <url|id> [<url|id> …]
 *   node scripts/yt-verify.mjs --file urls.txt
 *
 * Prints one compact block per video. `chapters: none` is a real answer and
 * means the segment has to be justified some other way (description, or
 * watching it) — it is not permission to invent one.
 *
 * This is also the link-rot check: re-run it over the matrix's URLs and
 * anything that comes back `UNAVAILABLE` needs its backup promoted.
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

const mmss = (s) => {
  if (s == null) return '?';
  const n = Math.round(s);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

const toUrl = (arg) =>
  arg.startsWith('http') ? arg : `https://www.youtube.com/watch?v=${arg}`;

async function verify(url) {
  try {
    const { stdout } = await run(
      'yt-dlp',
      ['-j', '--no-warnings', '--no-playlist', url],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const j = JSON.parse(stdout);
    const chapters = Array.isArray(j.chapters) ? j.chapters : [];
    return {
      ok: true,
      id: j.id,
      title: j.title,
      channel: j.channel ?? j.uploader,
      duration: j.duration,
      availability: j.availability ?? 'public',
      uploadDate: j.upload_date,
      viewCount: j.view_count,
      chapters: chapters.map((c) => ({
        start: c.start_time,
        end: c.end_time,
        title: c.title,
      })),
      // The description is where a creator who did not use chapter markers
      // usually still lists timestamps by hand.
      timestampLines: String(j.description ?? '')
        .split('\n')
        .filter((l) => /\b\d{1,2}:\d{2}\b/.test(l))
        .slice(0, 25),
    };
  } catch (err) {
    const msg = String(err.stderr ?? err.message ?? err).split('\n').find(Boolean) ?? 'failed';
    return { ok: false, url, error: msg.slice(0, 200) };
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/yt-verify.mjs <url|id> [...]   |   --file <path>');
  process.exit(2);
}

let targets;
if (args[0] === '--file') {
  targets = readFileSync(args[1], 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
} else {
  targets = args;
}

let unavailable = 0;

for (const t of targets) {
  const url = toUrl(t);
  const r = await verify(url);
  console.log('─'.repeat(72));
  if (!r.ok) {
    unavailable += 1;
    console.log(`UNAVAILABLE  ${url}`);
    console.log(`  error: ${r.error}`);
    continue;
  }
  console.log(`${r.title}`);
  console.log(`  channel:      ${r.channel}`);
  console.log(`  url:          https://www.youtube.com/watch?v=${r.id}`);
  console.log(`  length:       ${mmss(r.duration)}  (${r.duration}s)`);
  console.log(`  availability: ${r.availability}`);
  if (r.uploadDate) console.log(`  uploaded:     ${r.uploadDate}`);
  if (r.chapters.length > 0) {
    console.log(`  chapters:     ${r.chapters.length}`);
    for (const c of r.chapters) {
      console.log(`     ${mmss(c.start)}–${mmss(c.end)}  ${c.title}`);
    }
  } else {
    console.log('  chapters:     none');
  }
  if (r.timestampLines.length > 0) {
    console.log('  description timestamps:');
    for (const l of r.timestampLines) console.log(`     ${l.trim().slice(0, 110)}`);
  }
}

console.log('─'.repeat(72));
console.log(`${targets.length} checked, ${unavailable} unavailable`);
