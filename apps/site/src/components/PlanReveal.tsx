import Link from 'next/link';
import { PATH_ORDER, PERSONAS, type PathId } from '@/sim/personas';
import { getAppHref } from '@/sim/handoff';
import s from './PlanReveal.module.css';

/**
 * Price is shown once, at the end, and only the visitor's own plan is the
 * offer — the other two are a quiet line underneath so nobody feels sold the
 * middle column of a table.
 *
 * The button goes to the app handoff, never to a checkout.
 */
export function PlanReveal({ path }: { path: PathId }) {
  const persona = PERSONAS[path];
  const { plan } = persona;
  const others = PATH_ORDER.filter((p) => p !== path).map((p) => PERSONAS[p]);

  return (
    <div className={s.wrap}>
      <h2 className={s.lead}>That is the part you would use.</h2>
      <p className={s.sub}>
        Same app underneath, whichever door you came through. This is the plan that fits what you
        just walked through.
      </p>

      <div className={s.card}>
        <span className={s.planName}>{plan.name}</span>
        <div className={s.priceRow}>
          <span className={s.price}>${plan.price}</span>
          <span className={s.per}>a month</span>
        </div>
        <p className={s.pitch}>{plan.pitch}</p>
        <div className={s.gets}>
          {plan.gets.map((g) => (
            <span key={g} className={s.get}>
              <span className={s.getTick} aria-hidden="true">
                ✓
              </span>
              <span>{g}</span>
            </span>
          ))}
        </div>
        <Link className={s.cta} href={getAppHref(path)}>
          {persona.cta}
        </Link>
        <Link className={s.secondary} href={getAppHref(path)}>
          Or just get the app first
        </Link>
      </div>

      <div className={s.others}>
        <span className={s.othersHead}>The other two doors</span>
        {others.map((o) => (
          <div key={o.id} className={s.otherRow}>
            <span>{o.title}</span>
            <span className={s.otherPrice}>${o.plan.price}</span>
          </div>
        ))}
      </div>

      <p className={s.foot}>
        Prices are per month and shown here on the website. Cancel any time. Nothing you walked
        through was a live market or a record of real trading.
      </p>
    </div>
  );
}
