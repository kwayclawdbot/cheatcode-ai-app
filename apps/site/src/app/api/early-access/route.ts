/**
 * POST /api/early-access — the site's own door, forwarding to the API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SITE PROXIES INSTEAD OF THE BROWSER CALLING THE API DIRECTLY
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21's acceptance names the case that has to work: "including in social
 * in-app browsers with no configured mail client, which is where mailto fails
 * silently today". An in-app browser — Instagram's, TikTok's, a mail client's
 * preview pane — is exactly where a cross-origin POST is most likely to be
 * blocked, downgraded, or stripped of headers, and where the failure is least
 * likely to be reported to the page.
 *
 * A same-origin POST to the site's own origin has none of those problems, needs
 * no CORS grant on the API side, and works whether or not `ALLOWED_ORIGINS` was
 * configured on that deployment. The forward is server-to-server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CARRIES NO SECRET, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * `/api/v1/onboarding/intent` is public and rate limited. Giving this route an
 * internal secret would put a credential that can rewrite the CRM into a
 * marketing site's environment, in exchange for nothing the rate limit does not
 * already provide. What it does pass on is the VISITOR'S address in
 * `x-forwarded-for`, so the API's limit is keyed on the person and not on one
 * Vercel egress IP shared by everybody who ever fills this form.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WITHOUT `API_BASE` IT FAILS OUT LOUD
 * ─────────────────────────────────────────────────────────────────────────────
 * A deployment that has not been given the API's URL cannot take a request, and
 * the one thing it must not do is look like it did. It answers 503 with a
 * sentence, the form renders that sentence, and the email fallback underneath
 * the form is still there — clearly labelled as a fallback rather than as the
 * way this is meant to work. That is the audit's "a confirmed record OR a
 * recoverable error", and the error half is the half `mailto:` never had.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Payload = {
  path?: unknown;
  interest?: unknown;
  priority?: unknown;
  email?: unknown;
};

const PATHS = ["learn", "swing", "pro"];

function fail(status: number, plain: string) {
  return NextResponse.json({ error: { message_plain: plain } }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const base = (process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
  if (!base) {
    return fail(503, "We cannot take requests through this page right now. Use the email link below and we will get it.");
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return fail(400, "We could not read that. Please try again.");
  }

  const path = typeof body.path === "string" && PATHS.includes(body.path) ? body.path : null;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!path) return fail(400, "Something went wrong with your answers. Go back and pick a path.");
  // Deliberately loose — the API normalises and is the one that decides. A
  // second, stricter address rule here would reject addresses the CRM accepts
  // and there would be no way to tell which of the two said no.
  if (!email || !email.includes("@")) {
    return fail(400, "That does not look like an email address. Check it and try again.");
  }

  const forwarded =
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/v1/onboarding/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
      },
      body: JSON.stringify({
        path,
        interest: typeof body.interest === "string" ? body.interest : null,
        priority: typeof body.priority === "string" ? body.priority : null,
        email,
      }),
      cache: "no-store",
    });
  } catch {
    return fail(502, "We could not reach the service just now. Try again in a moment, or use the email link below.");
  }

  const text = await upstream.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return fail(502, "The service sent something we could not read. Try again in a moment.");
  }

  if (!upstream.ok) {
    const plain =
      (json as { error?: { message_plain?: string } } | null)?.error?.message_plain ??
      "We could not save that request. Please try again.";
    return fail(upstream.status, plain);
  }

  const ok = json as { intent_token?: string; plain?: string } | null;
  return NextResponse.json({
    intent_token: ok?.intent_token ?? null,
    plain: ok?.plain ?? "Request received.",
  });
}
