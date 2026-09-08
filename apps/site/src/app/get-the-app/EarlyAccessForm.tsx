"use client";

import { useState } from "react";
import Link from "next/link";
import type { PathId } from "@/sim/personas";
import { appLinkWithIntent } from "@/sim/handoff";
import s from "./page.module.css";

/**
 * THE END OF THE FUNNEL — a form, not a mail client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21 (P1). This page used to build an email body out of the visitor's
 * three answers and hand them a `mailto:` link. The most engaged person in the
 * product — somebody who had just walked a persona, a value reveal, two
 * branching demos and a personalised recap — was asked to leave the flow,
 * switch app, and send a message by hand. Nothing was recorded, so the app then
 * asked them everything again (F01).
 *
 * And it did not even fail honestly. In a social in-app browser with no
 * configured mail client, tapping that link does nothing at all: no error, no
 * new window, no clue. The audit's acceptance names that case specifically —
 * "a completed request produces a confirmed record or a recoverable error,
 * including in social in-app browsers with no configured mail client".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE STATES, AND WHY THE THIRD ONE MATTERS MOST
 * ─────────────────────────────────────────────────────────────────────────────
 *   idle   the recap, the address field, one button
 *   done   a confirmed request, in the server's own words, with the app link
 *   error  the server's sentence, the button still live, and the old email
 *          route underneath — now clearly a FALLBACK rather than the design
 *
 * The error state is the one that had no equivalent before. A request that
 * cannot be saved says so and stays recoverable; nothing here can fail quietly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ANSWERS ARE CHANGEABLE, WHICH THE AUDIT ASKS FOR BY NAME
 * ─────────────────────────────────────────────────────────────────────────────
 * "Let users change their answers." The recap above the field is not decorative
 * — every line of it links back to the funnel that produced it, and a second
 * submission is a second, later request that the app's claim resolves in
 * preference to the first. Nothing has to be undone.
 *
 * WHAT THE TOKEN IS FOR. A confirmed request hands back an opaque token, and
 * the app link carries it so that a device which installs the app picks the
 * answers up instead of asking again. It is intent and never identity: see
 * `apps/api/src/lib/crm/intent.ts`. Somebody who opens the app on a different
 * device needs no token at all — signing in with the same address finds the
 * same request.
 */
export function EarlyAccessForm({
  path,
  interest,
  priority,
  emailHref,
}: {
  path: PathId;
  interest?: string;
  priority?: string;
  /** The old mailto, kept only as the labelled fallback in the error state. */
  emailHref: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, interest, priority, email }),
      });
      const body = (await res.json().catch(() => null)) as
        | { intent_token?: string | null; plain?: string; error?: { message_plain?: string } }
        | null;
      if (!res.ok) {
        setState("error");
        setMessage(body?.error?.message_plain ?? "We could not save that request. Please try again.");
        return;
      }
      setToken(body?.intent_token ?? null);
      setMessage(body?.plain ?? "Request received.");
      setState("done");
    } catch {
      // A network failure the browser refused to explain — the in-app-browser
      // case. It gets a sentence and a live button, which is the entire point.
      setState("error");
      setMessage("We could not reach the service just now. Try again, or use the email link below.");
    }
  }

  if (state === "done") {
    return (
      <div className={s.card} role="status" aria-live="polite">
        <span className={s.eyebrow}>Request received</span>
        <p className={s.body}>{message}</p>
        <p className={s.body}>
          Your answers are saved against that address. When you open the app and sign in with it,
          it picks up where you left off instead of asking again.
        </p>
        <a className={s.cta} href={appLinkWithIntent(path, token)}>
          Open the app
        </a>
        <p className={s.foot}>
          Nothing has been charged and no account exists yet. That link only works on a device that
          already has the app.{" "}
          <button
            type="button"
            className={s.linkButton}
            onClick={() => {
              setState("idle");
              setMessage("");
            }}
          >
            Use a different address
          </button>
        </p>
      </div>
    );
  }

  return (
    <form className={s.card} onSubmit={submit}>
      <span className={s.eyebrow}>Where the app is</span>
      <p className={s.body}>
        CheatCode AI is in private testing and is not on the App Store yet. Leave your address and
        you will get the invite as soon as there is one.
      </p>

      <label className={s.label} htmlFor="early-access-email">
        Email address
      </label>
      <input
        id="early-access-email"
        className={s.input}
        type="email"
        name="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={state === "error" ? "early-access-error" : undefined}
      />

      <button className={s.cta} type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Ask for early access"}
      </button>

      {state === "error" && (
        <div className={s.error} id="early-access-error" role="alert">
          <p>{message}</p>
          <p>
            If it keeps failing,{" "}
            <a href={emailHref} className={s.errorLink}>
              send it by email instead
            </a>{" "}
            — your answers are already in the draft.
          </p>
        </div>
      )}

      <p className={s.foot}>
        We use the address to send the invite. No account or subscription is created by this, and
        nothing is charged.{" "}
        <Link href="/" className={s.errorLink}>
          Change your answers
        </Link>
      </p>
    </form>
  );
}
