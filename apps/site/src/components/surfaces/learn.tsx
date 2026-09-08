import { BeltChip, Chip, KaiSays, MemberName, Panel, ScreenHead, StagedNote, Stack, Ticker, k } from './kit';
import c from './learn.module.css';

/* ── 1. Kai asks where you are ─────────────────────────────────────────── */
/* This is the app's real first question, and the site asked its own version
   of it one screen ago — so the answer is already filled in. */

export function KaiIntro() {
  return (
    <>
      <ScreenHead
        title="Where are you right now?"
        sub="So the app meets you where you are. This changes as you learn — it is not a label you are stuck with."
      />
      <div className={c.choices}>
        <div className={`${c.choice} ${c.choiceOn}`}>
          <span className={c.choiceTitle}>I&rsquo;m brand new</span>
          <span className={c.choiceSub}>
            Never bought a stock, or close to it. Start me at the beginning.
          </span>
        </div>
        <div className={c.choice}>
          <span className={c.choiceTitle}>I invest but don&rsquo;t really trade</span>
          <span className={c.choiceSub}>
            I hold things long-term. Entries, stops and targets are not how I think yet.
          </span>
        </div>
        <div className={c.choice}>
          <span className={c.choiceTitle}>I swing trade</span>
          <span className={c.choiceSub}>
            I take positions for days or weeks and I can read a chart.
          </span>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <KaiSays>
          Answered from what you picked a moment ago. You can change it any time in Account.
        </KaiSays>
      </div>
      <StagedNote>
        A walkthrough with staged data. Nothing here is a live quote.
      </StagedNote>
    </>
  );
}

/* ── 2. the 7-day path ─────────────────────────────────────────────────── */

/** The path exactly as the app ships it — seven days, about five hours total. */
const DAYS = [
  { n: 1, title: 'Market Basics', meta: '4 lessons · 30 min', state: 'now' },
  { n: 2, title: 'Read the Chart', meta: '5 lessons · 40 min', state: 'locked' },
  { n: 3, title: 'Find the Setup', meta: '5 lessons · 45 min', state: 'locked' },
  { n: 4, title: 'Build the Trade', meta: '5 lessons · 50 min', state: 'locked' },
  { n: 5, title: 'Execute the Plan', meta: '5 lessons · 40 min', state: 'locked' },
  { n: 6, title: 'Trade With Kai', meta: '4 lessons · 60 min', state: 'locked' },
  { n: 7, title: 'Get Trade Ready', meta: '3 lessons · 60 min', state: 'locked' },
] as const;

export function SevenDayPath() {
  return (
    <>
      <ScreenHead
        title="Zero to Trade Ready in 7 Days"
        sub="Seven days. About 5 hours total. Kai with you the whole way."
      />
      <div className={c.pathHead}>
        <span className={k.eyebrow}>Day 1 of 7</span>
        <span className={c.pathProgress}>0%</span>
      </div>
      <div className={c.trainBar} aria-hidden="true">
        <span className={c.trainFill} style={{ width: '2%' }} />
      </div>
      <div className={c.days}>
        {DAYS.map((d) => (
          <div
            key={d.n}
            className={`${c.day} ${d.state === 'now' ? c.dayNow : ''} ${
              d.state === 'locked' ? c.dayLocked : ''
            }`}
          >
            <span className={c.dayNum}>{d.n}</span>
            <span className={c.dayBody}>
              <span className={c.dayTitle}>{d.title}</span>
              <span className={c.dayMeta}>{d.meta}</span>
            </span>
            {d.state === 'now' ? <Chip tone="violet">Start</Chip> : null}
          </div>
        ))}
      </div>
      <StagedNote>
        A walkthrough with staged data. Nothing here is a live quote.
      </StagedNote>
    </>
  );
}

/* ── 3. a 45-second lesson ─────────────────────────────────────────────── */

export function Lesson() {
  return (
    <>
      <div className={c.lessonMeta}>
        <Chip>Day 1 · Lesson 1</Chip>
        <Chip tone="violet">45 seconds</Chip>
      </div>
      <ScreenHead title="What a share actually is" />
      <div className={c.lessonBody}>
        <p>
          A share is a slice of a company that you own. Not a bet on a company &mdash; a{' '}
          <em>piece of it</em>. If a company is cut into a billion slices and you hold one, you own
          a billionth of everything it has and everything it earns.
        </p>

        <figure className={c.figure}>
          <SliceFigure />
          <figcaption className={c.figCap}>
            One company, cut into shares. Owning three of them is owning three billionths of the
            business &mdash; the same thing the largest holder owns, only less of it.
          </figcaption>
        </figure>

        <p>
          That is the whole idea, and it is why the price moves at all: people are constantly
          disagreeing about what a slice of that business is worth. Tomorrow we do the disagreeing
          part.
        </p>
      </div>
      <StagedNote>
        A walkthrough with staged data. Nothing here is a live quote.
      </StagedNote>
    </>
  );
}

/** A company as a bar of slices, three of them held. */
function SliceFigure() {
  const cols = 24;
  return (
    <svg viewBox="0 0 300 62" width="100%" role="img" aria-label="A company divided into shares, three of them owned">
      {Array.from({ length: cols }).map((_, i) => {
        const owned = i < 3;
        return (
          <rect
            key={i}
            x={i * 12.4 + 1}
            y={10}
            width={10}
            height={42}
            rx={2}
            fill={owned ? 'var(--volt)' : 'rgba(255,247,232,0.10)'}
            stroke={owned ? 'none' : 'rgba(255,247,232,0.06)'}
          />
        );
      })}
      <text x={1} y={6} fill="var(--volt)" fontSize={7} fontFamily="var(--font-mono-stack)">
        YOURS
      </text>
      <text x={300} y={6} fill="var(--dim)" fontSize={7} textAnchor="end" fontFamily="var(--font-mono-stack)">
        THE REST OF THE COMPANY
      </text>
    </svg>
  );
}

/* ── 4. a first investing idea ─────────────────────────────────────────── */

export function BeginnerPick() {
  return (
    <>
      <ScreenHead
        title="A first idea"
        sub="Beginner ideas are whole companies you can explain, not trades you have to time."
      />
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Ticker symbol="COST" sub="Costco Wholesale" size="lg" />
          <Chip tone="violet">Beginner</Chip>
        </div>
        <p style={{ fontSize: 14, lineHeight: '20px', marginTop: 12, color: 'var(--text)' }}>
          People pay Costco a yearly fee before they buy anything. That fee is most of the profit,
          and it renews whether or not the year was good.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Chip>Membership renews ~90%</Chip>
          <Chip>Pays a dividend</Chip>
          <Chip>Hold for years</Chip>
        </div>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <KaiSays>
          I picked this one because you can check whether the story is still true without reading a
          chart: are people still renewing? That is a beginner&rsquo;s advantage, not a limitation.
        </KaiSays>
      </div>
      <StagedNote>
        Staged example, not advice and not a live quote. Ideas in the app come with the reasoning
        written out like this.
      </StagedNote>
    </>
  );
}

/* ── 5. practice ───────────────────────────────────────────────────────── */

export function Practice() {
  return (
    <>
      <span className={k.eyebrow}>Check yourself</span>
      <p className={c.q} style={{ marginTop: 8 }}>
        A company is cut into 1,000,000 shares and you own 100. What do you own?
      </p>
      <Stack>
        <div className={`${c.choice} ${c.answerWrong}`}>
          <span className={c.choiceTitle}>A loan to the company</span>
        </div>
        <div className={`${c.choice} ${c.answerRight}`}>
          <span className={c.choiceTitle}>A ten-thousandth of the business</span>
          <span className={c.choiceSub}>Correct. 100 of 1,000,000 is 1/10,000.</span>
        </div>
        <div className={`${c.choice} ${c.answerWrong}`}>
          <span className={c.choiceTitle}>A promise the price will rise</span>
        </div>
      </Stack>
      <p className={c.verdict}>
        <strong>Right.</strong> And the third answer is the one worth remembering as wrong &mdash;
        owning a slice promises you nothing about the price. It only makes the company&rsquo;s
        results yours.
      </p>
      <StagedNote>
        A walkthrough with staged data. Nothing here is a live quote.
      </StagedNote>
    </>
  );
}

/* ── 6. belt progression ───────────────────────────────────────────────── */

export function BeltMove() {
  return (
    <>
      <ScreenHead
        title="You moved up"
        sub="Belts track what you have understood and done — not how much you have deposited."
      />
      <div className={c.beltMove}>
        <BeltChip belt="white" />
        <span className={c.beltArrow}>→</span>
        <BeltChip belt="blue" />
      </div>
      <Panel>
        <span className={k.eyebrow}>Blue belt</span>
        <p style={{ fontSize: 14, lineHeight: '20px', marginTop: 8 }}>
          You can say what a share is, why a price moves, and what you own when you own one. Next
          rung asks you to read a chart without guessing.
        </p>
        {/* Five discrete rungs, the way the app draws the ladder. */}
        <div className={c.rungs} aria-hidden="true">
          <span className={c.rung} style={{ background: '#FFF7E8' }} />
          <span className={c.rung} style={{ background: 'var(--ivory16)' }}>
            <span className={c.rungFill} style={{ width: '34%', background: '#7B9CC6' }} />
          </span>
          <span className={c.rung} style={{ background: 'var(--ivory06)' }} />
          <span className={c.rung} style={{ background: 'var(--ivory06)' }} />
          <span className={c.rung} style={{ background: 'var(--ivory06)' }} />
        </div>
        <p className={c.rungNote}>500 points for purple belt.</p>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <KaiSays>
          Your belt shows next to your name in the rooms. It is how someone answering you knows how
          much to explain.
        </KaiSays>
      </div>
      <StagedNote>
        A walkthrough with staged data. Nothing here is a live quote.
      </StagedNote>
    </>
  );
}

/* ── 7. the beginners room ─────────────────────────────────────────────── */

const POSTS = [
  {
    name: 'Marisol D.',
    belt: 'blue' as const,
    time: '2h',
    body: 'Finished day 1. The slice thing finally clicked — I had been thinking of it as betting on a company rather than owning part of one.',
    replies: 7,
  },
  {
    name: 'Ade O.',
    belt: 'purple' as const,
    time: '5h',
    body: 'For anyone on day 3: read the chart lesson twice before the practice. The second read is where it lands.',
    replies: 12,
  },
  {
    name: 'Priya R.',
    belt: 'white' as const,
    time: '1d',
    body: 'Starting today. Slightly intimidated, but the path being seven short days is the only reason I opened it.',
    replies: 21,
  },
];

export function BeginnersRoom() {
  return (
    <>
      <ScreenHead
        title="Beginners"
        sub="Everyone here started where you are. Belts are printed next to names so nobody has to guess how much to explain."
      />
      <div>
        {POSTS.map((p) => (
          <div key={p.name} className={c.post}>
            <div className={c.postHead}>
              <MemberName name={p.name} belt={p.belt} />
              <BeltChip belt={p.belt} />
              <span className={c.postTime}>{p.time}</span>
            </div>
            <p className={c.postBody}>{p.body}</p>
            <div className={c.postFoot}>
              <span>{p.replies} replies</span>
            </div>
          </div>
        ))}
      </div>
      <StagedNote>
        Staged posts written for this walkthrough, not real members.
      </StagedNote>
    </>
  );
}
