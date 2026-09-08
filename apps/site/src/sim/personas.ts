/**
 * The three paths the selector offers, and everything downstream that changes
 * because of the answer: the walkthrough beats, the plan shown after the
 * walkthrough, and the `path` value that carries into app signup.
 *
 * The `param` values here ARE the wire contract. See docs/SITE-APP-PARAM-CONTRACT.md.
 */

export type PathId = 'learn' | 'swing' | 'pro';

export type Beat = {
  /** Stable id — also the screenshot name in proof/. */
  id: string;
  /** Caption on the progress rail while this beat is on screen. */
  caption: string;
  /** The label on the control that advances to the next beat. */
  cue: string;
};

export type Persona = {
  id: PathId;
  /** The selector row. */
  mark: string;
  title: string;
  /** First person, the way the owner wrote it in the spec. */
  line: string;
  /** Accent that leads this path's walkthrough. */
  accent: 'volt' | 'violet' | 'mixed';
  /** Roughly how long the walkthrough runs, shown before it starts. */
  seconds: number;
  beats: Beat[];
  plan: {
    name: string;
    price: number;
    /** Why this plan, in the persona's own terms. */
    pitch: string;
    /** What they get, phrased as what they will do — not a feature matrix. */
    gets: string[];
  };
  /** The button at the end of the walkthrough. */
  cta: string;
};

export const PERSONAS: Record<PathId, Persona> = {
  learn: {
    id: 'learn',
    mark: 'Learn',
    title: 'Learn investing and trading',
    line: "I'm new, or still building confidence.",
    accent: 'violet',
    seconds: 60,
    beats: [
      { id: 'kai-intro', caption: 'Kai asks where you are', cue: 'Answer' },
      { id: 'path', caption: 'Your 7-day path', cue: 'Open day 1' },
      { id: 'lesson', caption: 'A 45-second lesson', cue: 'Got it' },
      { id: 'pick', caption: 'A first investing idea', cue: 'Why this one?' },
      { id: 'practice', caption: 'Your turn', cue: 'Check answer' },
      { id: 'belt', caption: 'You moved a belt', cue: 'See who else is here' },
      { id: 'community', caption: 'Beginners room', cue: 'See my plan' },
    ],
    plan: {
      name: 'Beginner',
      price: 29,
      pitch: 'Enough to learn on, without the tools you would not touch yet.',
      gets: [
        'The 7-day path, then a lesson a day',
        'Kai explains anything on any screen, in plain English',
        'Beginner ideas with the reasoning written out',
        'The beginners room and belt progression',
      ],
    },
    cta: 'Start learning',
  },
  swing: {
    id: 'swing',
    mark: 'Swing',
    title: 'Find better swing trades',
    line: 'I already trade. I want alerts, analysis and a room to check my thinking.',
    accent: 'volt',
    seconds: 75,
    beats: [
      { id: 'alerts', caption: "Today's alerts", cue: 'Open the Nvidia alert' },
      { id: 'alert', caption: 'The whole trade on one card', cue: 'Ask Kai why' },
      { id: 'ask-kai', caption: 'Kai answers for this trade', cue: 'Take it to the room' },
      { id: 'room', caption: 'The room is already on it', cue: 'Track this setup' },
      { id: 'track', caption: 'Tracked — you get told what happens', cue: 'See my plan' },
    ],
    plan: {
      name: 'Intermediate',
      price: 59,
      pitch: 'The alerts, the reasoning behind them, and the room that argues with you.',
      gets: [
        'Swing alerts with entry, stop and target on the card',
        'Ask Kai why — on the alert, on the chart, on your own trade',
        'The rooms, and the debriefs after a setup resolves',
        'Track a setup and get told when it does something',
      ],
    },
    cta: 'Get my alerts',
  },
  pro: {
    id: 'pro',
    mark: 'Pro',
    title: 'Trade with an AI copilot',
    line: 'I want advanced tools, charting, and my performance developed.',
    accent: 'mixed',
    seconds: 90,
    beats: [
      { id: 'chart', caption: 'Your chart', cue: 'Ask Kai to read it' },
      { id: 'analysis', caption: 'Kai marks the structure', cue: 'Build a plan on it' },
      { id: 'plan', caption: 'The plan, before the trade', cue: 'Run it' },
      { id: 'graded', caption: 'The trade, graded', cue: 'What that did to my belt' },
      { id: 'belt', caption: 'Progression toward black', cue: 'Where I stand' },
      { id: 'leaderboard', caption: 'Standing in the room', cue: 'See my plan' },
    ],
    plan: {
      name: 'Pro',
      price: 99,
      pitch: 'Everything, plus the tooling and the grading that develops how you trade.',
      gets: [
        'Kai on the chart — structure, levels, and answers drawn on it',
        'Trade plans written before the trade, graded after it',
        'Every alert family, including day trade',
        'Belt progression to black, and standing in the room',
      ],
    },
    cta: 'Trade with Kai',
  },
};

export const PATH_ORDER: PathId[] = ['learn', 'swing', 'pro'];
