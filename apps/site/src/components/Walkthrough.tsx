'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PERSONAS, type PathId } from '@/sim/personas';
import { renderBeat } from './surfaces/registry';
import { PlanReveal } from './PlanReveal';
import s from './Walkthrough.module.css';

type Props = {
  path: PathId;
  onExit: () => void;
  /** Desktop shows the walkthrough inside a phone; mobile IS the phone. */
  framed?: boolean;
};

/**
 * Runs one persona's beats. Everything is advanced by the visitor — nothing
 * plays on a timer — because the claim being made is "this is what using it is
 * like", and a video would not be that claim.
 */
export function Walkthrough({ path, onExit, framed = false }: Props) {
  const persona = PERSONAS[path];
  const total = persona.beats.length;
  /** index === total means the walkthrough is done and the plan is showing. */
  const [step, setStep] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const done = step >= total;
  const beat = done ? null : persona.beats[step];

  const next = useCallback(() => setStep((n) => Math.min(n + 1, total)), [total]);

  // A new beat starts at its own top — the visitor should never land mid-screen.
  useEffect(() => {
    surfaceRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const body = (
    <div className={s.stage} data-path={path}>
      <div className={s.rail}>
        <div className={s.railTop}>
          <span className={s.railCaption}>
            {done ? 'Your plan' : beat!.caption}
          </span>
          <button type="button" className={s.railExit} onClick={onExit}>
            {done ? 'Start over' : 'Exit'}
          </button>
        </div>
        <div className={s.ticks} aria-hidden="true">
          {persona.beats.map((b, i) => (
            <span
              key={b.id}
              className={`${s.tick} ${i < step ? s.tickDone : ''} ${i === step ? s.tickNow : ''}`}
            >
              <span className={s.tickFill} />
            </span>
          ))}
        </div>
      </div>

      <div className={s.surface} ref={surfaceRef}>
        <div className={s.beat} key={done ? 'plan' : beat!.id}>
          {done ? <PlanReveal path={path} /> : renderBeat(path, beat!.id)}
        </div>
      </div>

      {!done && (
        <div className={s.cueBar}>
          <button type="button" className={s.cue} data-cue onClick={next}>
            {beat!.cue}
            <span className={s.cueArrow} aria-hidden="true">
              →
            </span>
          </button>
        </div>
      )}
    </div>
  );

  if (!framed) return body;

  return (
    <div className={s.device}>
      <div className={s.deviceInner}>{body}</div>
    </div>
  );
}
