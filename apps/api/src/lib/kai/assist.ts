/**
 * Kai's structured-idea review — the engine behind both assist routes.
 *
 * `POST /messages/:id/structured-assist` reviews a draft that has already been
 * posted; `POST /rooms/:id/structured-assist` reviews one that has not been
 * written to the database at all. 08 §7 puts the review BEFORE publication, so
 * the second is the one the composer actually uses — and neither publishes
 * anything. `published:false` is a literal in the response type, not a flag,
 * because 08 §7 is explicit: Kai "never silently rewrites a member, claims
 * endorsement, or converts a post into a trade without explicit action." The
 * member's own words come back untouched alongside the suggestion.
 *
 * The draft is the member's own text, but it still enters the prompt inside the
 * untrusted-content block and the answer is still scanned — a member can be
 * injected against just as easily as anyone else.
 */
import { StructuredAssistResponse, StructuredIdea } from '@shared/api';
import { log } from '../log';
import { loadProfile } from './context';
import { buildSystemPrompt } from './system-prompt';
import { anthropicConfigured, completeOnce } from './stream';
import { wrapUntrusted, scanPayload } from './guard';

export type AssistInput = {
  userId: string;
  /** The structured fields as the member has them so far. */
  original: Record<string, unknown>;
  /** Free text alongside the fields — the posted body, or the composer's. */
  draftText: string;
  /** The room's mode, so the review speaks in the room's register. */
  roomMode: string | null;
  /** An id for the untrusted block. A draft with no row still needs one. */
  draftId: string;
  requestId: string;
};

/** The floor: the member's own draft, parsed, with nothing added. */
export function draftFloor(original: Record<string, unknown>, draftText: string): StructuredIdea {
  return StructuredIdea.parse({
    direction: (original.direction as 'long' | 'short') ?? 'long',
    thesis: (original.thesis as string) ?? (draftText.slice(0, 2000) || 'No thesis written yet.'),
    entry_condition: (original.entry_condition as string) ?? null,
    invalidation: (original.invalidation as string) ?? null,
    risk_and_size: (original.risk_and_size as string) ?? null,
    target_and_horizon: (original.target_and_horizon as string) ?? null,
    evidence: (original.evidence as string) ?? null,
    symbol: (original.symbol as string) ?? null,
  });
}

/** The 08 §7 fields still empty, named the way a member would name them. */
const GAP_LABELS: [keyof StructuredIdea, string][] = [
  ['entry_condition', 'What has to happen before this is actionable'],
  ['invalidation', 'What would prove it wrong'],
  ['risk_and_size', 'What is at risk, and how much'],
  ['target_and_horizon', 'Where it is going, and over what period'],
  ['evidence', 'The chart, catalyst or source behind it'],
];

export function gapsIn(idea: StructuredIdea): string[] {
  return GAP_LABELS.filter(([k]) => {
    const v = idea[k];
    return v === null || v === undefined || String(v).trim() === '';
  }).map(([, label]) => label);
}

const OFFLINE_PLAIN = 'I could not look at this just now. Your draft is untouched.';

export async function runStructuredAssist(input: AssistInput): Promise<StructuredAssistResponse> {
  const floor = draftFloor(input.original, input.draftText);

  const degraded = (note: string): StructuredAssistResponse =>
    StructuredAssistResponse.parse({
      original: input.original,
      improved: floor,
      notes: [note],
      plain: OFFLINE_PLAIN,
      published: false,
      degraded: true,
    });

  if (!anthropicConfigured()) {
    return degraded('Kai is offline right now, so this is your draft unchanged.');
  }

  const profile = await loadProfile(input.userId);
  const block = wrapUntrusted('member draft', [
    { id: input.draftId, author: 'the member', at: new Date().toISOString(), text: input.draftText },
  ]);

  try {
    const text = await completeOnce({
      system: buildSystemPrompt({
        displayName: profile.display_name,
        experience: profile.experience,
        involvement: profile.involvement,
        explanationLevel: profile.explanation_level,
        mode: input.roomMode ?? profile.primary_mode,
      }),
      messages: [
        {
          role: 'user',
          content: `A member wrote this trade idea and asked you to make it decision-ready before they post it.

${block}

Their structured fields so far: ${JSON.stringify(input.original)}

Return ONLY JSON, no fence:
{
  "direction": "long|short",
  "thesis": "what they expect and why, in their voice, tightened",
  "entry_condition": "what must happen before this is actionable, or null",
  "invalidation": "what would prove it wrong, or null",
  "risk_and_size": "what is at risk, or null",
  "target_and_horizon": "where it is going and over what period, or null",
  "evidence": "the chart, catalyst or source they named, or null",
  "symbol": "TICKER or null",
  "notes": ["what you changed and why — one short line each"]
}

Rules: keep their idea, do not replace it with yours. Never invent a price, a level or a catalyst they did not write — if a field is missing, say so in notes and leave it null. Do not endorse the idea. Do not tell them to trade it.`,
        },
      ],
      maxTokens: 900,
    });

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

    const improved = StructuredIdea.safeParse({
      direction: parsed.direction ?? floor.direction,
      thesis: parsed.thesis ?? floor.thesis,
      entry_condition: parsed.entry_condition ?? null,
      invalidation: parsed.invalidation ?? null,
      risk_and_size: parsed.risk_and_size ?? null,
      target_and_horizon: parsed.target_and_horizon ?? null,
      evidence: parsed.evidence ?? null,
      symbol: parsed.symbol ?? null,
    });
    if (!improved.success) throw new Error('shape');

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 6)
      : [];

    const scan = scanPayload({ ...improved.data, notes });
    if (!scan.ok) {
      log('warn', input.requestId, 'structured_assist.INJECTION_SCAN_BLOCKED', { findings: scan.findings });
      throw new Error('scan');
    }

    return StructuredAssistResponse.parse({
      original: input.original,
      improved: improved.data,
      notes,
      plain: 'Here is a tighter version. Nothing is posted — keep yours or take this one.',
      published: false,
      degraded: false,
    });
  } catch (e) {
    log('warn', input.requestId, 'structured_assist.failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return degraded('I could not rework this one just now.');
  }
}
