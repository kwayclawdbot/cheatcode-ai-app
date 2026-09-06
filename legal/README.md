# legal/ — App Store submission documents

**Everything in this folder is a DRAFT written by an AI agent, not by a lawyer.**
It is grounded in what the code and the database actually do — every claim in
these documents was checked against the source or against a live query on
2026-09-06 — but being accurate is not the same as being legally sufficient.

A trading-adjacent app, with user-generated content, and an AI that talks about
money, entries, stops and position sizes, is close to three regulated areas at
once. Get a lawyer to read these before they go on a website. The section
"What I most want a lawyer to read" at the bottom of each document says where.

## What is here

| File | What it is |
|---|---|
| `PRIVACY-LABELS.md` | The App Privacy answers for App Store Connect, derived from the schema and the code. Read this first — it is the evidence the privacy policy rests on. |
| `PRIVACY-POLICY.md` | Draft privacy policy. Names the real subprocessors and the real data. |
| `TERMS-OF-SERVICE.md` | Draft terms. Private, registration-only service; subscriptions bought on the website. |
| `COMMUNITY-POLICY.md` | Draft UGC policy for Guideline 1.2 — filtering, reporting, blocking, and the 24-hour commitment. |
| `DISCLAIMERS.md` | Draft financial disclaimers, plus the exact short strings the app should show in-line. |
| `APPLE-REVIEW-READINESS.md` | The demo account, and a blunt screen-by-screen account of what a reviewer sees today. |
| `PUBLISHING.md` | Where these have to live on the web, and what App Store Connect asks for. |

## Credentials

The Apple review demo account's credentials are **not in this repository** —
this repo is public. They are at:

    ~/.openclaw/secrets/cheatcode_ai_app_apple_review    (chmod 600)

following the same pattern as `cheatcode_ai_app_owner`.
