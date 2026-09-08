import {
  BELT_COLOR,
  BeltChip,
  Chip,
  KaiSays,
  KaiSaysMore,
  MemberName,
  Panel,
  ScreenHead,
  StagedNote,
  Ticker,
  YouSay,
  k,
} from './kit';
import c from './pro.module.css';

/* ── the chart ─────────────────────────────────────────────────────────── */

/** A staged series. Fixed, so the walkthrough is identical every time. */
const BARS: Array<[number, number, number, number]> = [
  // open, high, low, close
  [166, 169, 165, 168], [168, 170, 166, 167], [167, 172, 166, 171], [171, 173, 169, 170],
  [170, 174, 169, 173], [173, 178, 172, 177], [177, 178, 174, 175], [175, 177, 173, 174],
  [174, 178, 173, 177], [177, 179, 176, 178], [178, 182, 177, 181], [181, 183, 178, 179],
  [179, 181, 176, 177], [177, 180, 176, 179], [179, 184, 178, 183], [183, 186, 181, 185],
  [185, 187, 182, 183], [183, 185, 178, 179], [179, 181, 177, 180], [180, 184, 179, 183],
];

const LO = 163;
const HI = 190;
const W = 300;
const H = 150;

function y(v: number) {
  return H - ((v - LO) / (HI - LO)) * H;
}

/**
 * The chart, with structure optionally drawn on it. `marked` is what Kai adds
 * when asked to read it — the same levels the app draws, in the same colours:
 * cyan for a level the market decided, gold for the structure Kai named.
 */
function Chart({ marked = false }: { marked?: boolean }) {
  const step = W / BARS.length;
  const bw = step * 0.56;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Staged price chart">
      {marked && (
        <>
          {/* the level that capped it, then held it */}
          <line x1={0} x2={W} y1={y(178)} y2={y(178)} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="4 3" />
          <rect x={0} y={y(178) - 9} width={54} height={11} rx={2} fill="var(--cyan-tint)" />
          <text x={3} y={y(178) - 1.5} fontSize={7} fill="var(--cyan)" fontFamily="var(--font-mono-stack)">
            178.00 LEVEL
          </text>
          {/* the rising floor Kai named */}
          <line x1={step * 5} x2={W} y1={y(172)} y2={y(181)} stroke="var(--gold)" strokeWidth={1} />
          <text x={W - 2} y={y(181) - 4} fontSize={7} fill="var(--gold)" textAnchor="end" fontFamily="var(--font-mono-stack)">
            RISING FLOOR
          </text>
        </>
      )}
      {BARS.map(([o, h, l, cl], i) => {
        const up = cl >= o;
        const tone = up ? 'var(--green)' : 'var(--red)';
        const x = i * step + step / 2;
        const top = y(Math.max(o, cl));
        const bot = y(Math.min(o, cl));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(h)} y2={y(l)} stroke={tone} strokeWidth={1} />
            <rect
              x={x - bw / 2}
              y={top}
              width={bw}
              height={Math.max(1, bot - top)}
              fill={tone}
              opacity={up ? 0.9 : 0.85}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Kai answering ON the chart is a lower-third scrim, not a bubble and not a
 * card: full-bleed, no radius, no border, the page ground at 82% so the chart
 * is still visibly running underneath. The only "who" signal is the violet
 * speaker bar.
 */
function KaiLowerThird({ children }: { children: React.ReactNode }) {
  return (
    <div className={c.lowerThird}>
      <span className={c.liveMark}>
        <span className={c.liveDot} aria-hidden="true" />
        KAI
      </span>
      <span className={c.speakerBar} aria-hidden="true" />
      <p className={c.caption}>{children}</p>
    </div>
  );
}

function ChartFrame({ marked, saying }: { marked?: boolean; saying?: React.ReactNode }) {
  return (
    <div className={c.chartWrap} style={saying ? { position: 'relative', overflow: 'hidden' } : undefined}>
      <div className={c.chartHead}>
        <Ticker symbol="NVDA" sub="Nvidia" />
        <div className={c.tfRow}>
          <span className={c.tf}>1H</span>
          <span className={`${c.tf} ${c.tfOn}`}>1D</span>
          <span className={c.tf}>1W</span>
        </div>
      </div>
      <Chart marked={marked} />
      {marked ? (
        <div className={c.chartFoot}>
          <span className={c.legend}>
            <span className={c.swatch} style={{ background: 'var(--cyan)' }} /> LEVEL
          </span>
          <span className={c.legend}>
            <span className={c.swatch} style={{ background: 'var(--gold)' }} /> STRUCTURE
          </span>
        </div>
      ) : null}
      {saying ? <KaiLowerThird>{saying}</KaiLowerThird> : null}
    </div>
  );
}

/* ── 1. your chart ─────────────────────────────────────────────────────── */

export function ChartPlain() {
  return (
    <>
      <ScreenHead title="Chart" sub="Your own chart, with Kai one tap away on it." />
      <ChartFrame />
      <div style={{ marginTop: 12 }}>
        <YouSay>Read this for me.</YouSay>
      </div>
      <StagedNote>
        A staged series drawn for this walkthrough. Not a live chart and not a real session.
      </StagedNote>
    </>
  );
}

/* ── 2. Kai marks it ───────────────────────────────────────────────────── */

export function ChartAnalyzed({ onChart = true }: { onChart?: boolean }) {
  return (
    <>
      <ScreenHead title="Chart" />
      <ChartFrame
        marked
        saying={
          onChart
            ? '178 capped it for eleven sessions. It broke, came back, and held — so 178 changed sides.'
            : undefined
        }
      />
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <KaiSays>
          And the lows since have been rising into it, which is the part that makes it a setup
          rather than a level.
        </KaiSays>
        <KaiSaysMore>
          I have drawn both. The cyan line is the level the market decided. The gold line is the
          floor I am naming, and it is the one I could be wrong about.
        </KaiSaysMore>
      </div>
      <StagedNote>
        Kai draws on your chart in the app. This exchange is staged.
      </StagedNote>
    </>
  );
}

/* ── 3. the plan ───────────────────────────────────────────────────────── */

export function TradePlan() {
  return (
    <>
      <ScreenHead title="Plan" sub="Written before the trade, so there is something to grade afterwards." />
      <Panel tone="volt">
        <div className={c.planRow}>
          <span className={c.planLabel}>Entry</span>
          <span className={c.planValue} style={{ color: 'var(--cyan)' }}>
            178.40
          </span>
        </div>
        <div className={c.planRow}>
          <span className={c.planLabel}>Stop</span>
          <span className={c.planValue} style={{ color: 'var(--red)' }}>
            171.90
          </span>
        </div>
        <div className={c.planRow}>
          <span className={c.planLabel}>Target</span>
          <span className={c.planValue} style={{ color: 'var(--green)' }}>
            195.00
          </span>
        </div>
        <div className={c.planRow}>
          <span className={c.planLabel}>Size</span>
          <span className={c.planValue}>1% of account at risk</span>
        </div>
        <div className={c.planRow}>
          <span className={c.planLabel}>I am wrong if</span>
          <span className={c.planNote}>It closes back under 178 on heavy volume</span>
        </div>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <KaiSays>
          The last line is the one that gets graded hardest. A plan without a written way to be
          wrong is a wish with numbers on it.
        </KaiSays>
      </div>
      <StagedNote>
        A staged plan. Not advice and not a real position.
      </StagedNote>
    </>
  );
}

/* ── 4. graded ─────────────────────────────────────────────────────────── */

export function Graded() {
  return (
    <>
      <ScreenHead title="Debrief" />
      <div className={c.gradeTop}>
        <span className={c.gradeBig}>B</span>
        <span className={c.gradeWhat}>
          You followed the plan you wrote, and you sized it right. You also moved the stop once,
          which is the whole reason this is not an A.
        </span>
      </div>
      <Panel>
        <span className={k.eyebrow}>Against your own plan</span>
        <div className={c.gradeLines} style={{ marginTop: 8 }}>
          <span className={c.gradeLine}>
            <span className={c.tickOk}>✓</span>
            <span>Entered at your level, not above it</span>
          </span>
          <span className={c.gradeLine}>
            <span className={c.tickOk}>✓</span>
            <span>Risked 1%, as written</span>
          </span>
          <span className={c.gradeLine}>
            <span className={c.tickNo}>✕</span>
            <span>Moved the stop up mid-trade &mdash; the plan did not say to</span>
          </span>
          <span className={c.gradeLine}>
            <span className={c.tickOk}>✓</span>
            <span>Exited on the written invalidation, not on a feeling</span>
          </span>
        </div>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <KaiSays>
          The grade is about the decisions, not the money. You can be graded well on a losing trade
          and badly on a winning one &mdash; that is the point of grading it at all.
        </KaiSays>
      </div>
      <StagedNote>
        A staged debrief. The app grades your own trades against your own written plan.
      </StagedNote>
    </>
  );
}

/* ── 5. progression ────────────────────────────────────────────────────── */

const RUNGS = [
  { belt: 'white' as const, meta: 'done', state: 'done' },
  { belt: 'blue' as const, meta: 'done', state: 'done' },
  { belt: 'purple' as const, meta: 'done', state: 'done' },
  { belt: 'brown' as const, meta: '62%', state: 'now' },
  { belt: 'black' as const, meta: 'locked', state: 'next' },
];

export function Progression() {
  return (
    <>
      <ScreenHead
        title="Progression"
        sub="Belts move on graded decisions and what you contribute — never on account size."
      />
      <div className={c.ladder}>
        {RUNGS.map((r) => (
          <div
            key={r.belt}
            className={`${c.rung} ${r.state === 'now' ? c.rungNow : ''} ${
              r.state === 'done' ? c.rungDone : ''
            } ${r.state === 'next' ? c.rungNext : ''}`}
          >
            <span className={c.rungBar} style={{ background: BELT_COLOR[r.belt] }} aria-hidden="true" />
            <span className={c.rungName} style={{ color: BELT_COLOR[r.belt] }}>
              {r.belt} belt
            </span>
            <span className={c.rungMeta}>{r.meta}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <Panel>
          <span className={k.eyebrow}>Brown → black</span>
          <p style={{ fontSize: 13, lineHeight: '19px', marginTop: 8, color: 'var(--muted)' }}>
            Thirty graded trades at B or better, a plan written before every one of them, and
            enough answers in the rooms that other people&rsquo;s reads got better too.
          </p>
        </Panel>
      </div>
      <StagedNote>
        Staged progress for a walkthrough.
      </StagedNote>
    </>
  );
}

/* ── 6. leaderboard ────────────────────────────────────────────────────── */

const LB = [
  { rank: 1, name: 'Renata M.', belt: 'black' as const, meta: '48 graded · avg B+', score: '2,410' },
  { rank: 2, name: 'Dan K.', belt: 'brown' as const, meta: '39 graded · avg B', score: '2,105' },
  { rank: 3, name: 'You', belt: 'brown' as const, meta: '31 graded · avg B', score: '1,884', you: true },
  { rank: 4, name: 'Ade O.', belt: 'purple' as const, meta: '27 graded · avg B−', score: '1,650' },
];

export function Leaderboard() {
  return (
    <>
      <ScreenHead
        title="The board"
        sub="Ranked on being right. Never on profit, returns or account size."
      />
      <div>
        {LB.map((r) => (
          <div key={r.rank} className={`${c.lbRow} ${r.you ? c.lbYou : ''}`}>
            <span className={c.lbRank}>{r.rank}</span>
            <span className={c.lbBody}>
              <MemberName name={r.name} belt={r.belt} />
              <span className={c.lbMeta}>{r.meta}</span>
            </span>
            <BeltChip belt={r.belt} />
            <span className={c.lbScore}>{r.score}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <KaiSays>
          Nobody&rsquo;s profit is on this board. Ranking people by returns rewards the biggest
          account and the luckiest month, and neither one teaches anybody anything.
        </KaiSays>
      </div>
      <StagedNote>Staged standings written for this walkthrough.</StagedNote>
    </>
  );
}
