import { Funnel } from '@/components/Funnel';
import { Landing } from '@/components/Landing';
import s from './page.module.css';

export default function Home() {
  return (
    <>
      <div className={s.mobileOnly}>
        <Funnel />
      </div>
      <div className={s.desktopOnly}>
        <Landing />
      </div>
    </>
  );
}
