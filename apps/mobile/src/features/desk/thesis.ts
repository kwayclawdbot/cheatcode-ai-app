/**
 * Reading the structure the analyst already wrote.
 *
 * A thesis runs from about four thousand to eleven thousand characters and the
 * app used to render it as one block. It never needed summarising: the desk
 * writes every one of them in named sections, and all this does is find the
 * names it already used.
 *
 * Two ways of writing the same headings are in the live data, so both are
 * read:
 *
 *   · `## THE THEME`      — forty-three of the fifty-seven write-ups
 *   · `**THE THEME**` on a line of its own — the other fourteen
 *
 * Nothing here invents a section, renames one, reorders them or writes a
 * summary. If a write-up has no sections at all, this says so and hands back
 * the whole text — the screen then shows it whole and states plainly that it
 * was not filed in sections. Guessing at structure that is not there would be
 * the app putting words in the desk's mouth.
 */

export type ThesisSection = {
  /** The heading exactly as written. */
  name: string;
  /** Everything under it, up to the next heading. */
  body: string;
  /** Roughly how long it is — used to draw a length mark, never to rank. */
  words: number;
};

export type ParsedThesis = {
  /** The `# PDYN — Palladyne AI Corp.` line, if there is one. */
  title: string | null;
  /** Anything written before the first heading. Usually empty. */
  preamble: string;
  sections: ThesisSection[];
  /**
   * False when the write-up carries no headings of either kind. The screen
   * must say so rather than pretending it found structure.
   */
  sectioned: boolean;
};

const H1 = /^#\s+(.+?)\s*$/;
const HN = /^#{2,6}\s+(.+?)\s*$/;
/** A whole line that is nothing but bold text — the other way the desk writes a heading. */
const BOLD_LINE = /^\*\*([^*\n]{2,80})\*\*\s*$/;

const words = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Bold-line headings only count when the write-up has no `##` headings at all.
 *
 * Inside a `##` document a bold line is emphasis in the middle of an argument,
 * not a section — PDYN's WHAT THE NUMBERS SAY opens every paragraph with one.
 * Promoting those would shred a section into eight fragments and put headings
 * on the page the analyst never wrote.
 */
export function parseThesis(text: string | null | undefined): ParsedThesis {
  const raw = (text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) {
    return { title: null, preamble: '', sections: [], sectioned: false };
  }

  const lines = raw.split('\n');
  const hasHashSections = lines.some((l) => HN.test(l.trim()));

  const isHeading = (line: string): string | null => {
    const t = line.trim();
    const hn = t.match(HN);
    if (hn) return hn[1].trim();
    if (!hasHashSections) {
      const b = t.match(BOLD_LINE);
      if (b) return b[1].trim();
    }
    return null;
  };

  let title: string | null = null;
  const preamble: string[] = [];
  const sections: ThesisSection[] = [];
  let current: { name: string; body: string[] } | null = null;

  const close = () => {
    if (!current) return;
    const body = current.body.join('\n').trim();
    sections.push({ name: current.name, body, words: words(body) });
    current = null;
  };

  for (const line of lines) {
    const t = line.trim();

    // The document title, taken once, only before any section has opened.
    if (!current && title === null && !sections.length && H1.test(t) && !HN.test(t)) {
      title = t.match(H1)![1].trim();
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      close();
      current = { name: heading, body: [] };
      continue;
    }

    if (current) current.body.push(line);
    else preamble.push(line);
  }
  close();

  // A heading with nothing under it is a heading the desk wrote and then did
  // not fill. It stays — an empty section is information about the write-up.
  return {
    title,
    preamble: preamble.join('\n').trim(),
    sections,
    sectioned: sections.length > 0,
  };
}

/**
 * Which section a reader should land on.
 *
 * The verdict, when the write-up reached one. Otherwise the first section,
 * because opening nothing leaves a person looking at an index of headings with
 * no argument attached to any of them.
 */
export function openingSection(sections: ThesisSection[]): number {
  if (!sections.length) return -1;
  const call = sections.findIndex((s) => /\bTHE CALL\b/i.test(s.name));
  return call >= 0 ? call : 0;
}

/**
 * A short, plain-English gloss of what a section is for.
 *
 * These are labels on the desk's OWN eight recurring headings — the ones it
 * writes on every single write-up — and nothing else. A heading this does not
 * recognise gets no gloss rather than a guessed one, because a wrong
 * explanation of someone else's section is worse than none.
 */
const SECTION_GLOSS: Record<string, string> = {
  'THE THEME': 'the claim about the world',
  'WHAT THEY ACTUALLY DO': 'the business, in plain terms',
  'WHY THIS ONE': 'and the companies it beat',
  'COULD IT LEAD': 'or is it a passenger',
  'THE CONNECTION': 'how tightly it fits the theme',
  'WHAT THE NUMBERS SAY': 'straight off the filings',
  'WHAT WOULD HAVE TO BE TRUE': 'the conditions, listed',
  'THE CALL': 'the verdict',
  'THE TECHNICAL READ': 'what the chart adds',
  'WHAT THE TECHNICAL SAYS': 'what the chart adds',
};

export const sectionGloss = (name: string): string | null =>
  SECTION_GLOSS[name.trim().toUpperCase()] ?? null;
