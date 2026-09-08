import {
  BeltChip,
  Chip,
  Freshness,
  GradeMedallion,
  KaiSays,
  KaiSaysMore,
  MemberName,
  Panel,
  ScreenHead,
  StagedNote,
  Ticker,
  YouSay,
  gradeBand,
  k,
} from './kit';
import c from './swing.module.css';

/* ── 1. the board ──────────────────────────────────────────────────────── */

const BOARD = [
  {
    symbol: 'NVDA',
    name: 'Nvidia · swing · long',
    grade: 'A',
    score: 91,
    line: 'Held the level it broke, on rising volume',
    state: 'Ready',
    tone: 'volt' as const,
  },
  {
    symbol: 'SOFI',
    name: 'SoFi · swing · long',
    grade: 'B',
    score: 78,
    line: 'Base is tight but volume has not shown up yet',
    state: 'Watching',
    tone: 'plain' as const,
  },
  {
    symbol: 'AMD',
    name: 'AMD · swing · long',
    grade: 'B',
    score: 72,
    line: 'Second attempt at the same level — first one failed',
    state: 'Watching',
    tone: 'plain' as const,
  },
];

export function AlertsBoard() {
  return (
    <>
      <ScreenHead title="Alerts" />
      <div className={c.boardHead}>
        <span className={c.session}>
          <span className={c.dot} aria-hidden="true" />
          Swing · 3 today
        </span>
        <span className={k.eyebrow}>Staged</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {BOARD.map((a) => (
          <div
            key={a.symbol}
            className={c.row}
            style={{
              borderColor: gradeBand(a.score).ring,
              background: `linear-gradient(160deg, ${gradeBand(a.score).wash} 0%, rgba(23,23,28,0.70) 100%)`,
            }}
          >
            <GradeMedallion letter={a.grade} score={a.score} size={46} />
            <span className={c.rowBody}>
              <Ticker symbol={a.symbol} sub={a.name} />
              <span className={c.rowLine}>{a.line}</span>
            </span>
            <span className={c.rowRight}>
              <Chip tone={a.tone === 'volt' ? 'gold' : 'plain'}>{a.state}</Chip>
            </span>
          </div>
        ))}
      </div>
      <StagedNote>
        A walkthrough with staged data. These are not today&rsquo;s alerts and nothing here is a
        live quote.
      </StagedNote>
    </>
  );
}

/* ── 2. the alert, opened ──────────────────────────────────────────────── */

export function AlertOpen() {
  return (
    <>
      {/* identity row */}
      <div className={c.alertTop}>
        <Ticker symbol="NVDA" sub="Nvidia · swing · long" size="lg" />
        <span className={c.stateCol}>
          <span className={c.stateWhen}>Triggered 9:47 AM</span>
          <span className={c.stateWord} style={{ color: 'var(--green)' }}>
            Ready
          </span>
        </span>
      </div>

      {/* quality + what changed */}
      <div className={c.qualityRow}>
        <GradeMedallion letter="A" score={91} size={90} />
        <span>
          <span className={c.headline}>The level that capped it is now holding it up</span>
          <span className={c.whatChanged}>
            Came back to 178 on the third day and stopped there, with more volume on the hold than
            on the break.
          </span>
        </span>
      </div>

      <Panel>
        <span className={k.eyebrow}>The trade</span>
        <div className={c.levels}>
          <span className={`${c.level} ${c.levelNow}`}>
            <span className={c.levelLabel}>Current</span>
            <span className={c.levelValue}>178.62</span>
          </span>
          <span className={`${c.level} ${c.levelEntry}`}>
            <span className={c.levelLabel}>Entry</span>
            <span className={c.levelValue}>178.40</span>
          </span>
          <span className={`${c.level} ${c.levelStop}`}>
            <span className={c.levelLabel}>Stop</span>
            <span className={c.levelValue}>171.90</span>
          </span>
          <span className={`${c.level} ${c.levelTarget}`}>
            <span className={c.levelLabel}>Target</span>
            <span className={c.levelValue}>195.00</span>
          </span>
        </div>

        <div className={c.freshLine}>
          <Freshness state="closed" />
        </div>

        <div className={c.rail}>
          <TradeRail />
          <div className={c.railCaption}>
            <span>RISK 6.50</span>
            <span>REWARD 16.60</span>
          </div>
        </div>
      </Panel>

      <div style={{ marginTop: 10 }}>
        <Panel>
          <span className={k.eyebrow}>What was measured</span>
          <div className={c.bars} style={{ marginTop: 10 }}>
            <Bar label="Trend strength" pct={86} read="Strong" tone="var(--grade-gold)" />
            <Bar label="Risk : reward" pct={74} read="1 : 2.6" tone="var(--grade-gold)" />
            <Bar label="Options activity" pct={68} read="Above normal" tone="var(--grade-gold)" />
          </div>
          <div className={c.holdPlan}>
            <span className={c.barLabel}>Hold plan</span>
            <span className={c.barRead}>3&ndash;10 days</span>
          </div>
          <p style={{ fontSize: 11, lineHeight: '16px', color: 'var(--dim)', marginTop: 12 }}>
            These measure the setup, not the outcome. A strong setup can still lose.
          </p>
        </Panel>
      </div>

      {/* progress to trigger — violet, because it is Kai's reading, not a user action */}
      <div className={c.trigger}>
        <span className={c.barLabel}>To trigger</span>
        <span className={c.barTrack}>
          <span className={c.barFill} style={{ width: '96%', background: 'var(--violet)' }} />
        </span>
        <span className={c.barRead}>0.22 away</span>
      </div>

      {/* the one filled primary on the screen */}
      <button type="button" className={c.cta}>
        Open the trade plan
      </button>

      <StagedNote>
        Staged numbers for a walkthrough. Not advice, not a live quote, and not a record of a real
        trade.
      </StagedNote>
    </>
  );
}

/**
 * The trade as a distance rather than a percentage: stop, entry and target on
 * one axis, with the risk side and the reward side shaded so the shape of the
 * trade is legible before any number is read.
 */
function TradeRail() {
  // 171.90 stop · 178.40 entry · 195.00 target, mapped onto 0–100.
  const lo = 171.9;
  const hi = 195;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const entry = at(178.4);
  return (
    <svg viewBox="0 0 300 40" width="100%" role="img" aria-label="Stop 171.90, entry 178.40, target 195.00">
      {/* risk side */}
      <rect x={0} y={16} width={(entry / 100) * 300} height={8} rx={4} fill="var(--red-tint)" stroke="var(--red40)" strokeWidth={1} />
      {/* reward side */}
      <rect
        x={(entry / 100) * 300}
        y={16}
        width={300 - (entry / 100) * 300}
        height={8}
        rx={4}
        fill="var(--green-tint)"
        stroke="var(--green40)"
        strokeWidth={1}
      />
      {/* entry marker */}
      <rect x={(entry / 100) * 300 - 1.5} y={9} width={3} height={22} rx={1.5} fill="var(--cyan)" />
      <text x={0} y={7} fontSize={8} fill="var(--red)" fontFamily="var(--font-mono-stack)">
        171.90
      </text>
      <text
        x={(entry / 100) * 300}
        y={7}
        fontSize={8}
        fill="var(--cyan)"
        textAnchor="middle"
        fontFamily="var(--font-mono-stack)"
      >
        178.40
      </text>
      <text x={300} y={7} fontSize={8} fill="var(--green)" textAnchor="end" fontFamily="var(--font-mono-stack)">
        195.00
      </text>
    </svg>
  );
}

function Bar({ label, pct, read, tone }: { label: string; pct: number; read: string; tone: string }) {
  return (
    <span className={c.bar}>
      <span className={c.barTop}>
        <span className={c.barLabel}>{label}</span>
        <span className={c.barRead}>{read}</span>
      </span>
      <span className={c.barTrack}>
        <span className={c.barFill} style={{ width: `${pct}%`, background: tone }} />
      </span>
    </span>
  );
}

/* ── 3. ask Kai ────────────────────────────────────────────────────────── */

export function AskKai() {
  return (
    <>
      <ScreenHead title="Ask Kai" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <YouSay>Why this trade?</YouSay>
        <KaiSays>
          Nvidia spent eleven sessions under 178. It broke above, came back down to it, and stopped
          there instead of falling through &mdash; that is the part that matters. The level that
          used to cap it is now holding it up.
        </KaiSays>
        <KaiSays>
          The stop sits at 171.90 because that is under the low of the day it came back. If price
          goes there, the thing I just described did not happen and the reason to be in it is gone.
        </KaiSays>
        <YouSay>What would make you drop it?</YouSay>
        <KaiSays>
          A close back under 178 on heavy volume. That is the same evidence in reverse, and I would
          rather be out and wrong than in and hoping.
        </KaiSays>
      </div>
      <StagedNote>
        A staged exchange. In the app Kai answers on the alert, on the chart, and on your own
        positions.
      </StagedNote>
    </>
  );
}

/* ── 4. the room ───────────────────────────────────────────────────────── */

const ROOM = [
  {
    name: 'Dan K.',
    belt: 'brown' as const,
    time: '18m',
    body: 'Took a half at 178.60. Adding only if it closes over 181 — the first push had thin volume behind it.',
  },
  {
    name: 'Renata M.',
    belt: 'black' as const,
    time: '32m',
    body: 'Fair, but the retest held on higher volume than the break did. That is the opposite of thin. I am full size with the same stop.',
  },
  {
    name: 'Toby A.',
    belt: 'blue' as const,
    time: '41m',
    body: 'Question — why the stop under the retest low rather than under 178 flat?',
  },
  {
    name: 'Renata M.',
    belt: 'black' as const,
    time: '39m',
    body: 'Because 178 flat is where everyone else is. Under the low is where the idea is actually wrong.',
  },
];

export function Room() {
  return (
    <>
      <ScreenHead title="Swing room" sub="The alert is the start of the argument, not the end of it." />
      <div>
        {ROOM.map((m, i) => (
          <div key={i} className={c.msg}>
            <div className={c.msgHead}>
              <MemberName name={m.name} belt={m.belt} />
              <BeltChip belt={m.belt} />
              <span className={c.msgTime}>{m.time}</span>
            </div>
            <p className={c.msgBody}>{m.body}</p>
          </div>
        ))}
      </div>
      <StagedNote>Staged discussion written for this walkthrough, not real members.</StagedNote>
    </>
  );
}

/* ── 5. tracked ────────────────────────────────────────────────────────── */

export function Tracked() {
  return (
    <>
      <ScreenHead title="Tracking Nvidia" sub="You will be told what it does. You do not have to watch it." />
      <Panel tone="volt">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Ticker symbol="NVDA" sub="Nvidia" />
          <Chip tone="gold">Tracked</Chip>
        </div>
        <div className={c.trackList}>
          <span className={c.trackItem}>
            <span className={c.trackTick}>→</span>
            <span>Entry touched at 178.40</span>
          </span>
          <span className={c.trackItem}>
            <span className={c.trackTick}>→</span>
            <span>Stop taken out, or target reached</span>
          </span>
          <span className={c.trackItem}>
            <span className={c.trackTick}>→</span>
            <span>The reason changes &mdash; a close back under the level</span>
          </span>
        </div>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <KaiSays>
          When it resolves, either way, you get the debrief: what the setup said, what happened, and
          which part of the read was actually doing the work.
        </KaiSays>
      </div>
      <StagedNote>
        A walkthrough with staged data. Nothing here is a live quote.
      </StagedNote>
    </>
  );
}
