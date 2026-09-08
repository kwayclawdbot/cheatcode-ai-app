import Link from 'next/link';
import type { Metadata } from 'next';
import { PERSONAS, type PathId } from '@/sim/personas';
import { START_ANSWER_FOR, isPathId } from '@/sim/handoff';
import { KaiOrb } from '@/components/surfaces/kit';
import s from './page.module.css';

export const metadata: Metadata = {
  title: 'Get CheatCode AI',
  robots: { index: false },
};

/**
 * THE HANDOFF.
 *
 * This page exists because the answer has to survive the jump. The app is not
 * on a public URL yet, so rather than send the visitor to a dead link or a
 * checkout that does not exist, we hold their answer here and say plainly
 * where things stand.
 *
 * When the app has a signup URL, the two buttons below become that URL with
 * `?path=` appended and nothing else on this page changes.
 */
export default async function GetTheApp({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const { path: raw } = await searchParams;
  const path: PathId = isPathId(raw) ? raw : 'swing';
  const persona = PERSONAS[path];

  return (
    <main className={s.wrap}>
      <Link className={s.back} href="/">
        ← Back
      </Link>

      <div className={s.orb}>
        <KaiOrb size={34} />
      </div>

      <h1 className={s.title}>You are set up as {persona.mark.toLowerCase()}.</h1>
      <p className={s.lede}>
        When you open the app, &ldquo;Where are you right now?&rdquo; will already be answered
        &mdash; <strong>{persona.title.toLowerCase()}</strong>. You can change it in Account at any
        time; it is not a label you are stuck with.
      </p>

      <div className={s.card}>
        <span className={s.eyebrow}>Where the app is</span>
        <p className={s.body}>
          CheatCode AI is in private testing right now and is not on the App Store yet. Leave your
          email with the owner and you will get the TestFlight invite as soon as there is one.
        </p>
        <a className={s.cta} href="mailto:support@cheatcode.com?subject=CheatCode%20AI%20early%20access">
          Ask for early access
        </a>
      </div>

      <div className={s.detail}>
        <span className={s.eyebrow}>Already testing?</span>
        <p className={s.body}>
          Open the app from this device and your answer travels with the link.
        </p>
        <code className={s.code}>cheatcodeai://start?path={path}</code>
      </div>

      <p className={s.foot}>
        Your answer is carried as <code className={s.inlineCode}>?path={path}</code>, which the app
        reads as <code className={s.inlineCode}>{START_ANSWER_FOR[path]}</code>. Nothing about you
        is stored on this page and no account has been created.
      </p>
    </main>
  );
}
