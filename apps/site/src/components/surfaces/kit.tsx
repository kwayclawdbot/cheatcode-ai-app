import type { ReactNode } from 'react';
import k from './kit.module.css';

/* ── ticker ────────────────────────────────────────────────────────────── */

/**
 * The mark carries the WHOLE symbol, mono bold, cyan on the cyan tint — never
 * the first two letters, because ARK is a different fund from ARKK. The app
 * fades a real logo in on top of exactly this; the letters are the resting
 * state, not a fallback.
 */
export function TickerMark({ symbol, size = 30 }: { symbol: string; size?: number }) {
  const inner = size * 0.82;
  const fontSize = Math.min(size * 0.32, inner / (0.62 * symbol.length));
  const cls =
    size >= 40 ? `${k.tickerMark} ${k.tickerMarkLg}` : size <= 22 ? `${k.tickerMark} ${k.tickerMarkSm}` : k.tickerMark;
  return (
    <span className={cls} aria-hidden="true">
      <span
        className={k.tickerGlyphs}
        style={{ fontSize: `${fontSize}px`, letterSpacing: `${-fontSize * 0.045}px` }}
      >
        {symbol}
      </span>
    </span>
  );
}

/** Mark plus name. The symbol is Space Grotesk — a ticker is a name, not data. */
export function Ticker({
  symbol,
  sub,
  size = 'md',
}: {
  symbol: string;
  sub?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'lg' ? 40 : size === 'sm' ? 22 : 30;
  return (
    <span className={k.ticker}>
      <TickerMark symbol={symbol} size={px} />
      <span>
        <span className={`${k.tickerSymbol} ${size === 'lg' ? k.tickerSymbolLg : ''}`}>{symbol}</span>
        {sub ? <span className={k.tickerSub}>{sub}</span> : null}
      </span>
    </span>
  );
}

/** A $TICKER living inside a sentence. */
export function Cashtag({ symbol }: { symbol: string }) {
  return <span className={k.cashtag}>{` $${symbol.toUpperCase()} `}</span>;
}

/* ── belt ──────────────────────────────────────────────────────────────── */

export type BeltName = 'white' | 'blue' | 'purple' | 'brown' | 'black';

const BELT_COLOR: Record<BeltName, string> = {
  white: '#FFF7E8',
  blue: '#7B9CC6',
  purple: '#BE9AC8',
  brown: '#C08C5E',
  black: '#D6DAE1',
};

/** The 0.50 edge each belt draws. White is the exception, at 0.20. */
const BELT_EDGE: Record<BeltName, string> = {
  white: 'rgba(255,247,232,0.20)',
  blue: 'rgba(123,156,198,0.50)',
  purple: 'rgba(190,154,200,0.50)',
  brown: 'rgba(192,140,94,0.50)',
  black: 'rgba(214,218,225,0.50)',
};

/**
 * The rung as a chip: a dyed bar, and the word in muted ink at every rung.
 * The hue belongs to the member's NAME — printing it twice would make the
 * chip compete with the person.
 */
export function BeltChip({ belt }: { belt: BeltName }) {
  return (
    <span className={k.belt} style={{ borderColor: BELT_EDGE[belt] }}>
      <span className={k.beltBar} style={{ background: BELT_COLOR[belt] }} aria-hidden="true" />
      {belt}
    </span>
  );
}

/** A member's name is printed in their belt's ink. That is the whole signal. */
export function MemberName({ name, belt }: { name: string; belt: BeltName }) {
  return (
    <span style={{ fontSize: 13.5, fontWeight: 700, color: BELT_COLOR[belt] }}>{name}</span>
  );
}

export { BELT_COLOR, BELT_EDGE };

/* ── Kai ───────────────────────────────────────────────────────────────── */

export function KaiOrb({ size = 26, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <span
      className={`${k.orb} ${glow ? k.orbGlow : ''}`}
      style={{ width: size, height: size, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

/* ── panels ────────────────────────────────────────────────────────────── */

export function Panel({
  tone = 'plain',
  children,
  className = '',
}: {
  tone?: 'plain' | 'kai' | 'volt' | 'gold';
  children: ReactNode;
  className?: string;
}) {
  const tones = { plain: '', kai: k.panelKai, volt: k.panelVolt, gold: k.panelGold };
  return <div className={`${k.panel} ${tones[tone]} ${className}`}>{children}</div>;
}

/* ── speech ────────────────────────────────────────────────────────────── */

export function KaiSays({ children }: { children: ReactNode }) {
  return (
    <div className={k.bubbleRow}>
      <KaiOrb size={30} glow={false} />
      <div className={`${k.bubble} ${k.bubbleKai}`}>{children}</div>
    </div>
  );
}

/** A second Kai turn keeps the gutter so the left edge holds. */
export function KaiSaysMore({ children }: { children: ReactNode }) {
  return (
    <div className={k.bubbleRow}>
      <span style={{ width: 30, flex: 'none' }} aria-hidden="true" />
      <div className={`${k.bubble} ${k.bubbleKai}`}>{children}</div>
    </div>
  );
}

export function YouSay({ children }: { children: ReactNode }) {
  return (
    <div className={`${k.bubbleRow} ${k.bubbleRowUser}`}>
      <div className={`${k.bubble} ${k.bubbleUser}`}>{children}</div>
    </div>
  );
}

/* ── the grade gauge ───────────────────────────────────────────────────── */

type Band = { ring: string; letter: string; wash: string; word: string };

/** Score wins over letter, exactly as the app bands it. */
export function gradeBand(score: number): Band {
  if (score >= 85)
    return { ring: '#FFD75E', letter: '#FFD75E', wash: 'rgba(255,215,94,0.20)', word: 'High quality' };
  if (score >= 80)
    return { ring: '#8B5CF6', letter: '#CBB2FF', wash: 'rgba(139,77,255,0.20)', word: 'Good quality' };
  if (score >= 70)
    return { ring: '#CBB2FF', letter: '#CBB2FF', wash: 'rgba(203,178,255,0.14)', word: 'Fair quality' };
  if (score >= 60)
    return { ring: '#FFC857', letter: '#FFC857', wash: 'rgba(255,200,87,0.16)', word: 'Weak quality' };
  return { ring: 'rgba(255,247,232,0.24)', letter: '#B9B0A8', wash: 'rgba(255,247,232,0.08)', word: 'Not qualified' };
}

/**
 * The medallion. The gauge sweeps 270 degrees with the gap at the BOTTOM,
 * starting at −135°, and the score sits in that gap — the bare number, no
 * "/100", because the gap is what makes it read as a reading rather than a
 * fraction.
 */
export function GradeMedallion({
  letter,
  score,
  size = 90,
}: {
  letter: string;
  score: number;
  size?: number;
}) {
  const band = gradeBand(score);
  const stroke = size * 0.062;
  const c = size / 2;
  const r = c - stroke / 2 - size * 0.02;
  const circ = 2 * Math.PI * r;
  const sweep = 0.75; // 270 of 360
  const track = circ * sweep;
  const fill = track * Math.max(0, Math.min(100, score)) / 100;
  const letterSize = letter.length > 1 ? size * 0.345 : size * 0.4;

  return (
    <span
      style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'inline-block' }}
      role="img"
      aria-label={`Grade ${letter}, ${score} out of 100, ${band.word}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`face-${size}-${score}`} cx="50%" cy="30%" r="78%">
            <stop offset="0%" stopColor={band.ring} stopOpacity={0.17} />
            <stop offset="100%" stopColor={band.ring} stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="#17171C" fillOpacity={0.62} />
        <circle cx={c} cy={c} r={r} fill={`url(#face-${size}-${score})`} />
        {/* the track: the full 270 arc, gap at the bottom */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="rgba(255,247,232,0.20)"
          strokeWidth={stroke * 0.42}
          strokeLinecap="round"
          strokeDasharray={`${track} ${circ - track}`}
          transform={`rotate(135 ${c} ${c})`}
        />
        {/* the reading */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={band.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ - fill}`}
          transform={`rotate(135 ${c} ${c})`}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          marginTop: -size * 0.085,
          fontSize: letterSize,
          fontWeight: 700,
          letterSpacing: -letterSize * 0.03,
          color: band.letter,
        }}
      >
        {letter}
      </span>
      <span
        className="num"
        style={{
          position: 'absolute',
          bottom: size * 0.085,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: Math.max(9, size * 0.155),
          fontWeight: 500,
          color: 'var(--muted)',
        }}
      >
        {score}
      </span>
    </span>
  );
}

/* ── small parts ───────────────────────────────────────────────────────── */

export function Chip({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'cyan' | 'green' | 'red' | 'gold' | 'violet';
  children: ReactNode;
}) {
  const tones = {
    plain: '',
    cyan: k.chipCyan,
    green: k.chipGreen,
    red: k.chipRed,
    gold: k.chipGold,
    violet: k.chipViolet,
  };
  return <span className={`${k.chip} ${tones[tone]}`}>{children}</span>;
}

/** No price without freshness. */
export function Freshness({ state = 'closed' }: { state?: 'live' | 'closed' }) {
  if (state === 'live') {
    return (
      <span className={`${k.fresh} ${k.freshLive}`}>
        <span className={k.freshDot} aria-hidden="true" />
        Live
      </span>
    );
  }
  return (
    <span className={`${k.fresh} ${k.freshClosed}`}>
      <span className={k.freshBar} aria-hidden="true" />
      Market closed
    </span>
  );
}

export function ScreenHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h2 className={k.screenTitle}>{title}</h2>
      {sub ? <p className={k.screenSub}>{sub}</p> : null}
    </>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className={k.stack}>{children}</div>;
}

export function StagedNote({ children }: { children: ReactNode }) {
  return <span className={k.staged}>{children}</span>;
}

export { k };
