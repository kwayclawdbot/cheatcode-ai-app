'use client';

import { PATH_ORDER, PERSONAS, type PathId } from '@/sim/personas';
import { KaiOrb } from './surfaces/kit';
import s from './PathSelector.module.css';

/**
 * The first screen, and the only question the site asks. Everything after it
 * is personalized by the answer — the walkthrough, the plan, and the `path`
 * that carries into the app.
 */
export function PathSelector({
  onPick,
  inline = false,
  heading = 'What do you want CheatCode to help you do?',
  sub = 'Pick one and walk through the part of the app that does it. About a minute, and nothing to fill in.',
}: {
  onPick: (path: PathId) => void;
  inline?: boolean;
  heading?: string;
  sub?: string;
}) {
  return (
    <div className={`${s.wrap} ${inline ? s.inline : ''}`}>
      {!inline && (
        <div className={`${s.brand} ${s.enter}`}>
          <KaiOrb size={18} glow={false} />
          <span className={s.brandName}>CheatCode AI</span>
        </div>
      )}

      <h1 className={`${s.q} ${s.enter}`} style={{ animationDelay: '90ms' }}>
        {heading}
      </h1>
      <p className={`${s.qSub} ${s.enter}`} style={{ animationDelay: '180ms' }}>
        {sub}
      </p>

      <div className={s.doors}>
        {PATH_ORDER.map((id, i) => {
          const p = PERSONAS[id];
          return (
            <button
              key={id}
              type="button"
              className={`${s.door} ${s.enter}`}
              data-door={id}
              style={{ animationDelay: `${270 + i * 90}ms` }}
              onClick={() => onPick(id)}
            >
              <span className={s.doorTop}>
                <span className={s.doorMark}>{p.mark}</span>
              </span>
              <span className={s.doorTitle}>{p.title}</span>
              <span className={s.doorLine}>{p.line}</span>
              <span className={s.doorGo} aria-hidden="true">
                →
              </span>
            </button>
          );
        })}
      </div>

      {!inline && (
        <p className={s.foot}>
          A walkthrough of the real app with staged data. No account, no card, nothing to install
          yet.
        </p>
      )}
    </div>
  );
}
