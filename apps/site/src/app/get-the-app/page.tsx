import Link from "next/link";
import type { Metadata } from "next";
import { PERSONAS, type PathId } from "@/sim/personas";
import { isPathId } from "@/sim/handoff";
import { validChoice } from "@/sim/journey";
import { KaiOrb } from "@/components/surfaces/kit";
import { EarlyAccessForm } from "./EarlyAccessForm";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "Get CheatCode AI",
  robots: { index: false },
};

/**
 * THE HANDOFF.
 *
 * This page holds the visitor's answers at the point where the website ends and
 * the product begins. What changed is what happens next.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT USED TO END AT AN EMAIL DRAFT
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21 (P1). Everything above the fold is unchanged and is deliberately
 * unchanged — the funnel is good, and the audit says so: "Keep the existing
 * conversational funnel." Only the ending moved. The button was a `mailto:`
 * with the three answers written into the body, which meant no record was
 * created anywhere, the app could not read the answers back, and in an in-app
 * browser with no mail client the tap did nothing and said nothing.
 *
 * Now it is a short native form (`EarlyAccessForm`) posting to this site's own
 * `/api/early-access`, which forwards to the API, which writes a lead and a
 * timeline event into the CRM that already exists. The old `mailto:` survives
 * as the fallback INSIDE the error state, where it belongs: a way out when the
 * request genuinely cannot be made, rather than the way the flow is meant to
 * work.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RECAP IS STILL THE POINT OF THIS PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Somebody arriving here has answered three questions and deserves to see them
 * repeated back before being asked for an address. The audit also asks that
 * people be able to change them, so every state of the form carries a link
 * back to the funnel — and a second submission is simply a second, later
 * request that the app resolves in preference to the first.
 *
 * WHEN THE APP HAS A PUBLIC SIGNUP URL, the confirmed state's "Open the app"
 * link becomes that URL with the same `?path=&intent=` on it, and nothing else
 * on this page changes.
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

  /**
   * The old email route, built exactly as it was, and handed to the form for
   * one job: the error state. It is never the primary action any more, because
   * an action that can fail without saying so is not an action.
   */
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

      <EarlyAccessForm
        path={path}
        interest={interest?.id}
        priority={priority?.id}
        emailHref={emailHref}
      />
    </main>
  );
}
