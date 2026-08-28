/**
 * Kai's voice, per experience level.
 *
 * The prototype (`design/prototype-logic.js`, `__voice`) makes this concrete:
 * the SAME sentence is delivered three ways. `new` gets the sentence plus a
 * glossary note the first time a term appears. `some` gets it plain. `pro` gets
 * it with the preamble stripped — no "Good morning", straight to the levels.
 *
 * Two things this file is careful about:
 *
 * 1. The glossary is a FIRST-USE mechanism, not a decoration. A beginner should
 *    meet "volume" with its meaning attached once, and then be trusted with the
 *    word. Repeating the definition every time is the tone of a product that
 *    thinks its user is not learning anything.
 *
 * 2. The definitions live here, in code, and are appended verbatim. They are
 *    not generated per turn, so "volume" means the same thing on Monday as it
 *    did on Friday. The model is told to USE the glossary, not to write one.
 */
import { EXPERIENCE_VOICE_LINE, type Experience } from '@shared/api';

/** The prototype's six terms plus the ones the alert card leans on. */
export const GLOSSARY: Record<string, string> = {
  confirmed: 'Confirmed means the move Kai was waiting for actually happened — not just a guess.',
  cleared: 'Cleared the level means price moved above a price that had been holding it back.',
  drift: 'Drift is how far your mix has wandered from the split you chose.',
  volume: 'Volume is how many shares changed hands — more of it makes a move more believable.',
  invalidating: 'Invalidating means price is close to proving the idea wrong, so Kai would drop it.',
  invalidation: 'The invalidation is the price that proves the idea wrong, not just losing.',
  thesis: 'A thesis is the reason you own something and what would make you stop.',
  trigger: 'The trigger is the price that turns a watched idea into an actionable one.',
  stop: 'A stop is the price where you get out because the idea was wrong.',
  target: 'A target is where the plan takes profit, decided before you enter.',
  entry: 'The entry is the price you plan to get in at, decided before you are in it.',
  support: 'Support is a price where buyers have stepped in before.',
  resistance: 'Resistance is a price where sellers have stepped in before.',
  atr: 'Average true range is how far this stock usually moves in a day.',
  rsi: 'Relative strength index is a 0–100 reading of how one-sided the recent buying or selling has been.',
  'risk-reward': 'Reward against risk compares what you stand to make with what you stand to lose.',
  bracket: 'A bracket is the stop and the target submitted together with the entry.',
  'paper trading': 'Paper trading is practice with simulated money — nothing here touches a real account.',
};

export function experienceOf(value: unknown): Experience {
  if (value === 'new' || value === 'some' || value === 'pro') return value;
  if (value === 'beginner') return 'new';
  if (value === 'intermediate') return 'some';
  if (value === 'advanced') return 'pro';
  return 'some';
}

export function voiceLine(exp: Experience): string {
  return EXPERIENCE_VOICE_LINE[exp];
}

/**
 * The paragraph appended to the system prompt. It carries the whole glossary
 * for `new`, so the model has the exact words to use rather than inventing a
 * definition, and it carries the terms already spent in this conversation so a
 * definition is not repeated.
 */
export function voicePromptBlock(exp: Experience, alreadyExplained: string[] = []): string {
  const spent = alreadyExplained.filter((t) => GLOSSARY[t]);
  switch (exp) {
    case 'new':
      return `HOW THIS USER WANTS TO BE TALKED TO — "New to this"
${EXPERIENCE_VOICE_LINE.new}

The FIRST time you use one of these terms in this conversation, add its
definition to the same sentence, using the wording below and no other. After
that, use the term plainly — do not define it again, and do not apologise for
using it. You are teaching someone, not talking down to them.

${Object.entries(GLOSSARY)
  .map(([term, def]) => `  ${term}: ${def}`)
  .join('\n')}

${spent.length ? `Already explained earlier in this conversation, so use them plainly now: ${spent.join(', ')}.` : 'Nothing has been explained yet in this conversation.'}`;

    case 'pro':
      return `HOW THIS USER WANTS TO BE TALKED TO — "Trades actively"
${EXPERIENCE_VOICE_LINE.pro}

No greeting, no preamble, no "let me explain". Open with the level, the number
or the state. Never define a term. Keep the honesty rules — freshness, risk and
the execution boundary are not preamble and they stay.`;

    default:
      return `HOW THIS USER WANTS TO BE TALKED TO — "Some experience"
${EXPERIENCE_VOICE_LINE.some}

Assume they know what an entry, a stop and a target are. Do not define basics.
Do explain anything genuinely uncommon, once.`;
  }
}

/**
 * Terms this text used that are in the glossary. Used to remember what has
 * already been explained, so the FIRST-USE rule survives across turns.
 */
export function termsUsed(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.keys(GLOSSARY).filter((term) => lower.includes(term));
}

/**
 * Whether a `new`-voice reply actually carried a glossary note.
 *
 * Matched on the DISTINCTIVE TAIL of each definition rather than its opening,
 * because the model reliably keeps the explanation and just as reliably
 * re-frames the front of it — "volume (how many shares changed hands — more of
 * it makes a move more believable)" is the definition doing its job, and a
 * prefix match would score it as a miss and re-teach the term next turn.
 */
export function containsGlossaryNote(text: string): boolean {
  const said = text.toLowerCase().replace(/\s+/g, ' ');
  return Object.values(GLOSSARY).some((def) => said.includes(glossaryTail(def)));
}

/** The half of a definition that no ordinary sentence would contain by accident. */
export function glossaryTail(definition: string): string {
  const parts = definition.split(' — ');
  const tail = parts.length > 1 ? parts[parts.length - 1] : definition;
  return tail.toLowerCase().replace(/\s+/g, ' ').replace(/[.]$/, '').trim();
}

/**
 * Server-composed copy (the portal's opening line, a card's interpretation)
 * gets the same treatment without a model in the loop: `pro` loses the
 * pleasantry, `new` gains the note for one named term.
 */
export function speak(text: string, exp: Experience, term?: keyof typeof GLOSSARY | string): string {
  if (exp === 'pro') return text.replace(/^Good (morning|afternoon|evening)[^.]*\.\s*/i, '');
  if (exp !== 'new' || !term) return text;
  const note = GLOSSARY[String(term)];
  return note ? `${text} — ${note}` : text;
}
