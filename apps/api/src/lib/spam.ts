/**
 * Community spam precheck (03 Unit 1: "spam precheck = heuristics + efficient-
 * model screen on structured ideas only").
 *
 * The heuristics are here; the model screen is not in this round (documented as
 * a gap). These target the specific harms this product cares about — pump
 * language, off-platform signal selling, and guaranteed-return claims — rather
 * than generic profanity, which is a moderation matter, not a spam one.
 */

export type SpamVerdict = { ok: true } | { ok: false; reason: string; plain: string };

const LINK_RE = /https?:\/\/\S+/gi;

const PATTERNS: { re: RegExp; reason: string; plain: string }[] = [
  {
    re: /\b(guaranteed|guarantee[ds]?)\s+(returns?|profits?|gains?|wins?)\b|\b100%\s*(win|accurate|guaranteed)\b|\bcan'?t lose\b|\brisk[- ]free\b/i,
    reason: 'guaranteed-return claim',
    plain: 'Nothing in markets is guaranteed, and posts that say so are not allowed here. Say what you think and what would prove you wrong.',
  },
  {
    re: /\b(dm|pm) me\b|\bwhats ?app\b|\btelegram\b|\bsignals? group\b|\bjoin my\b|\bvip (group|room|signals)\b/i,
    reason: 'off-platform solicitation',
    plain: 'Pointing people off the platform for signals or paid groups is not allowed here.',
  },
  {
    re: /\b(pump|moon(ing|shot)?|to the moon|10x|100x)\b.*\b(now|today|buy)\b|\bbuy (now|before it)\b/i,
    reason: 'pump language',
    plain: 'Urgency posts like that are not what this place is for. What is the level, and what would prove you wrong?',
  },
];

export function spamPrecheck(body: string, previous?: string | null): SpamVerdict {
  const text = body.trim();

  if (text.length < 2) {
    return { ok: false, reason: 'too short', plain: 'Say a little more than that.' };
  }
  if (previous && previous.trim() === text) {
    return { ok: false, reason: 'duplicate', plain: 'You just posted that. Try adding something new.' };
  }

  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20 && letters === letters.toUpperCase()) {
    return { ok: false, reason: 'all caps', plain: 'All caps reads as shouting. Try it in normal case.' };
  }
  if (/(.)\1{9,}/.test(text)) {
    return { ok: false, reason: 'repeated characters', plain: 'That looks like a stuck key. Try again.' };
  }
  const links = text.match(LINK_RE) ?? [];
  if (links.length > 2) {
    return { ok: false, reason: 'too many links', plain: 'Two links is the limit in one post.' };
  }

  for (const p of PATTERNS) {
    if (p.re.test(text)) return { ok: false, reason: p.reason, plain: p.plain };
  }

  return { ok: true };
}
