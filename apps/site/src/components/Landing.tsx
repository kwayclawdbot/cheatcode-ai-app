'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { PathId } from '@/sim/personas';
import { getAppHref } from '@/sim/handoff';
import { PathSelector } from './PathSelector';
import { Walkthrough } from './Walkthrough';
import { KaiOrb } from './surfaces/kit';
import { AlertOpen } from './surfaces/swing';
import { ChartAnalyzed } from './surfaces/pro';
import { BeltMove } from './surfaces/learn';
import { Leaderboard } from './surfaces/pro';
import s from './Landing.module.css';

/** The seven things, in the order the app puts them in front of you. */
const INDEX = [
  {
    name: 'Learn',
    body: 'Seven days from nothing to reading a chart on your own, then a lesson a day. Kai explains any screen in plain English, at whatever level you are actually at.',
  },
  {
    name: 'Invest',
    body: 'Whole companies, with the reason written out — so you can check whether the story is still true without needing a chart to tell you.',
  },
  {
    name: 'Trade',
    body: 'A plan written before the trade: entry, stop, target, size, and the line that says how you would know you were wrong.',
  },
  {
    name: 'Alerts',
    body: 'Setups with the whole trade on one card, graded on what was measured about the setup — never on how it turned out.',
  },
  {
    name: 'Community',
    body: 'Rooms where the alert is the start of the argument. Everyone’s belt is printed next to their name, so nobody has to guess how much to explain.',
  },
  {
    name: 'Kai',
    body: 'Ask on the alert, on the chart, on your own position. Kai draws on the chart, names what it is unsure about, and never pretends a read is a guarantee.',
  },
  {
    name: 'Progression',
    body: 'Five belts, moved by graded decisions and what you give the room. Account size does not appear anywhere in it.',
  },
];

export function Landing() {
  const [path, setPath] = useState<PathId | null>(null);
  const finderRef = useRef<HTMLDivElement>(null);

  const toFinder = () => finderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <span className={s.navBrand}>
          <KaiOrb size={18} glow={false} />
          CheatCode AI
        </span>
        <span className={s.navSpacer} />
        <button type="button" className={s.navLink} onClick={toFinder}>
          Find your path
        </button>
        <Link className={s.navCta} href={getAppHref('swing')}>
          Get the app
        </Link>
      </nav>

      {/* ── hero ───────────────────────────────────────────────────────── */}
      <header className={s.hero}>
        <div>
          <h1 className={s.h1}>
            The market, <em>explained to you</em> while you trade it.
          </h1>
          <p className={s.heroSub}>
            Learn it, invest in it, or trade it with an AI that shows its reasoning. One app that
            meets you where you actually are.
          </p>
          <div className={s.heroCtas}>
            <button type="button" className={s.primary} onClick={toFinder}>
              Show me my version
              <span aria-hidden="true">→</span>
            </button>
            <Link className={s.secondary} href={getAppHref('swing')}>
              Get the app
            </Link>
          </div>
        </div>
        <div className={s.heroDevice}>
          <div className={s.heroDeviceInner}>
            <ChartAnalyzed onChart={false} />
          </div>
        </div>
      </header>

      {/* ── the index: seven things, as a list, not a grid of boxes ─────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>One app, seven things.</h2>
        <p className={s.sectionLede}>
          The same product underneath, whichever one you came for. What changes is where it starts
          you and how much it explains.
        </p>
        <div className={s.index}>
          {INDEX.map((it, i) => (
            <div key={it.name} className={s.idxRow}>
              <span className={s.idxNum}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className={s.idxName}>{it.name}</h3>
                <p className={s.idxBody}>{it.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── moment 1: the alert ────────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.moment}>
          <div>
            <h2 className={s.momentTitle}>The whole trade, on one card.</h2>
            <p className={s.momentBody}>
              Entry, stop and target are levels, not opinions — so they get their own colours and
              they never move once they are set. The grade measures the setup: how clean the level
              is, what the volume did, how much room there is to the target.
            </p>
            <p className={s.momentBody}>
              It is not a score for the outcome. A strong setup can still lose, and the card says
              so rather than quietly taking credit afterwards.
            </p>
          </div>
          <div className={s.render}>
            <AlertOpen />
          </div>
        </div>
      </section>

      {/* ── moment 2: Kai on the chart ─────────────────────────────────── */}
      <section className={s.section}>
        <div className={`${s.moment} ${s.momentFlip}`}>
          <div>
            <h2 className={s.momentTitle}>Ask on the chart. Get an answer on the chart.</h2>
            <p className={s.momentBody}>
              Kai draws what it is talking about — the level the market decided in cyan, the
              structure it is naming in gold — and then says which of the two it could be wrong
              about.
            </p>
            <p className={s.momentBody}>
              Everything Kai says is violet and everything you do is volt. After a day in the app
              you stop reading the labels and just know who is talking.
            </p>
          </div>
          <div className={`${s.render} ${s.renderWide}`}>
            <ChartAnalyzed />
          </div>
        </div>
      </section>

      {/* ── moment 3: progression + the board ──────────────────────────── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Ranked on being right. Never on profit.</h2>
        <p className={s.sectionLede}>
          Five belts, moved by decisions graded against the plan you wrote before the trade. No
          board in this app shows returns or account size, because ranking people by those rewards
          the biggest account and the luckiest month.
        </p>
        <div className={s.moment}>
          <div className={s.render}>
            <BeltMove />
          </div>
          <div className={s.render}>
            <Leaderboard />
          </div>
        </div>
      </section>

      {/* ── the path finder ────────────────────────────────────────────── */}
      <section className={s.finder} ref={finderRef}>
        {path ? (
          <div className={s.stage}>
            <Walkthrough path={path} framed onExit={() => setPath(null)} />
          </div>
        ) : (
          <PathSelector
            inline
            onPick={setPath}
            heading="So which one are you?"
            sub="Pick a door and walk through the part of the app that does it — about a minute, right here on the page."
          />
        )}
      </section>

      <footer className={s.footer}>
        <p className={s.footNote}>
          Every screen shown on this page is a rendition of the app running on staged data. Nothing
          here is a live quote, a real member, or a record of real trading. CheatCode AI is
          education and analysis software — it is not investment advice, and nothing in it is a
          recommendation to buy or sell anything.
        </p>
        <div className={s.footLinks}>
          <Link href="/get-the-app?path=swing">Get the app</Link>
        </div>
      </footer>
    </div>
  );
}
