import Link from "next/link";
import type { Metadata } from "next";
import { PERSONAS, type PathId } from "@/sim/personas";
import { isPathId } from "@/sim/handoff";
import { validChoice } from "@/sim/journey";
import { KaiOrb } from "@/components/surfaces/kit";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "Get CheatCode AI",
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
  searchParams: Promise<{
    path?: string;
    interest?: string;
    priority?: string;
  }>;
}) {
  const {
    path: raw,
    interest: rawInterest,
    priority: rawPriority,
  } = await searchParams;
  const path: PathId = isPathId(raw) ? raw : "swing";
  const persona = PERSONAS[path];
  const interest = validChoice(path, rawInterest, "interest");
  const priority = validChoice(path, rawPriority, "priority", interest?.id);
  const body = [
    "I would like early access to CheatCode AI.",
    `Path: ${persona.title}`,
    interest ? `Interest: ${interest.label}` : "",
    priority ? `Priority: ${priority.label}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const emailHref = `mailto:support@cheatcode.com?subject=CheatCode%20AI%20early%20access&body=${encodeURIComponent(body)}`;

  return (
    <main className={s.wrap}>
      <Link className={s.back} href="/">
        ← Back
      </Link>

      <div className={s.orb}>
        <KaiOrb size={34} />
      </div>

      <h1 className={s.title}>Your next step starts here.</h1>
      <p className={s.lede}>
        Your path: <strong>{persona.title}</strong>.
        {interest && (
          <>
            {" "}
            Your interest: <strong>{interest.label}</strong>.
          </>
        )}
        {priority && (
          <>
            {" "}
            Your priority: <strong>{priority.label}</strong>.
          </>
        )}
      </p>

      <div className={s.card}>
        <span className={s.eyebrow}>Where the app is</span>
        <p className={s.body}>
          CheatCode AI is in private testing right now and is not on the App
          Store yet. Leave your email with the owner and you will get the
          TestFlight invite as soon as there is one.
        </p>
        <a className={s.cta} href={emailHref}>
          Ask for early access
        </a>
      </div>

      <p className={s.foot}>
        Your choices are included in your email draft. Send it to request an
        invitation. No account or subscription has been created.
      </p>
    </main>
  );
}
