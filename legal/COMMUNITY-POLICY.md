# Community Policy — Cheat Code AI

> ## ⚠ THIS IS A DRAFT, NOT A LEGAL DOCUMENT
> Written by an AI agent from what the code actually does. **A lawyer must read it
> before it is published**, and — more urgently than that — **parts of it describe
> things the product cannot do yet.** Those parts are marked. Publishing a promise
> the product cannot keep is worse than publishing nothing, and in App Review it is
> the difference between one rejection and a pattern of them.

**Last updated:** [DATE OF PUBLICATION]

---

## Why this document exists

Apple's App Review Guideline 1.2 requires four specific things of any app with
user-generated content:

1. a method for **filtering objectionable content**;
2. a mechanism for users to **report** offensive content;
3. the ability to **block abusive users**; and
4. **published contact information** so users can reach the developer.

Apple's own wording asks developers to act on objectionable content reports **within
24 hours** by removing the content and ejecting the user who provided it. That
commitment is stated in section 5 below.

**Read section 6 before submitting.** As of 6 September 2026, two of the four
requirements are not met by the shipped product.

---

## 1. What the community is

Cheat Code AI has two kinds of member spaces:

- **Rooms** — one per mode: Day Trade, Swing, Investing. These are permanent.
- **Circles** — a short-lived room attached to one specific setup, which opens when
  the setup is published and closes when the setup expires, usually within a week.

Both are private to members. Nothing posted in them is public, indexed, or visible
without an account.

## 2. What is not allowed

**About other people**

- Harassment, bullying, threats, or targeting someone because of who they are.
- Hate speech, or slurs of any kind.
- Sexual content, or anything involving minors.
- Doxxing — posting someone's personal information.
- Impersonating another member, a member of staff, or Kai.

**About money — this part matters more here than in most communities**

- **Claiming a guaranteed return.** Nothing in markets is guaranteed. Posts that say
  otherwise are blocked automatically.
- **Pump language** — urgency posts telling people to buy now before it runs.
- **Selling signals, or pointing people off the platform** to a paid group, a
  Telegram channel, a WhatsApp group, or a DM.
- **Posting an idea you hold without saying you hold it.** The app requires a
  position disclosure on any structured idea, and it will refuse the post without
  one.
- Giving personalised investment advice to another member. Say what you think and
  what would prove you wrong. Do not tell someone else what to do with their money.

**General**

- Illegal content, or anything that infringes someone else's rights.
- Spam, flooding, repeated identical posts, shouting in all capitals.
- Attempting to break the service or get round its limits.

## 3. What we expect instead

The house style is: **say what you think, say what would prove you wrong.** A post
that names a level and an invalidation is worth more than a post that names a
target. If you are in a position, say so.

## 4. What happens when someone breaks the rules

We have four responses, and we use the smallest one that works:

| | What it means |
|---|---|
| **Automatic refusal** | The post never appears. Used for guaranteed-return claims, pump language, off-platform solicitation, duplicates, shouting, and link spam. The person is told plainly why. |
| **Removal** | A moderator takes the post down. Other members stop seeing it; we keep a copy so we can answer a dispute. |
| **Mute** | A moderator silences someone in one room for a period — 24 hours by default. A mute lifts itself. |
| **Ban** | Removal from the community. Used for the serious things: threats, hate, sexual content, targeting a person. |

Every moderation action is recorded with who did it and why.

## 5. Reporting, and our 24-hour commitment

**Any member can report any post.** Open the post, choose Report, and say why. The
report goes to us immediately. Reporting does not delete the post — a member cannot
remove another member's post, because that would itself be a way to abuse the
community.

> ### Our commitment
> **We review every report of objectionable content within 24 hours of receiving it.**
> Where a report is upheld, we remove the content and take action against the account
> that posted it — up to and including removing that person from the service.
> Where a report is not upheld, we tell the person who reported it.

**This is a promise about the product, not just about the document.** Honouring it
requires four things to be true, and they are listed in section 7 as work items,
because at least two of them are not true today.

You can also reach us directly at **[MODERATION CONTACT EMAIL]** — for anything
urgent, and for anything you would rather not report in public.

## 6. Blocking someone

**[GAP — THIS SECTION CANNOT BE PUBLISHED AS WRITTEN UNTIL THE FEATURE EXISTS.]**

If another member is making the community worse for you, you can block them. You stop
seeing their posts, and they stop seeing yours.

> **What is actually true on 6 September 2026:** there is **no user-to-user block in
> this product.** `POST /rooms/:id/mute` mutes *yourself* in a room — it turns off
> your own notifications — and the source file says so explicitly. The only mute that
> silences another person is a **moderator** action
> (`POST /rooms/:id/moderate`, staff-only, `room_members.moderation_muted_until`).
> A member has no way to block another member.
>
> **Apple Guideline 1.2 requires this.** It is not optional and it is not something a
> policy document can substitute for. It has to be built.

## 7. What the product must do to honour this policy

This is the engineering list behind the words above. It is here, in the policy
itself, so that nobody publishes the policy and assumes the work is done.

| # | What is needed | Status on 6 Sep 2026 | Guideline |
|---|---|---|---|
| 1 | **A user-to-user block.** A member can block another member; blocked posts disappear from their view in every room and circle. | **MISSING. Blocker.** | 1.2 |
| 2 | **A filter that catches objectionable content**, not only market spam. The current filter (`apps/api/src/lib/spam.ts`) catches guaranteed-return claims, pump language, off-platform solicitation, duplicates, all-caps and link spam. It does **not** catch profanity, hate speech, harassment or sexual content — the file says so in its own header, and this was verified live: an abusive message posted successfully. | **PARTIAL. Blocker for 1.2 as written.** | 1.2 |
| 3 | **A report button on every post**, wired to `POST /api/v1/messages/:id/report`. The endpoint exists and works (rate-limited to 10 reports per hour, deduplicated per reporter). | Endpoint exists. **Confirm the button is on screen in the build being submitted.** | 1.2 |
| 4 | **Somebody who actually looks at reports within 24 hours.** There is a `reports` table and a moderation route; there is no alert, no queue view, and no rota. A commitment nobody is paged for is not a commitment. | **MISSING — operational, not code.** | 1.2 |
| 5 | **Published contact information** the user can reach from inside the app. | Needs the legal links and a support address. | 1.2 |
| 6 | **A published EULA or terms the user agrees to before posting.** | The Terms cover it; the link has to be in the app. | 1.2 |

**Items 1, 2 and 4 are submission blockers.** An app with user-generated content and
no block function is a known, routine Guideline 1.2 rejection.

## 8. Your content

You keep ownership of what you post. You give us permission to display it to other
members and to keep a copy for moderation. If your account is closed, your posts may
remain visible with your name removed, so that conversations other members took part
in do not fall apart. **[LAWYER: confirm this is the position the owner wants, and
that it is compatible with the deletion right in the privacy policy.]**

## 9. Appeals

If you think a moderation decision was wrong, write to
**[MODERATION CONTACT EMAIL]**. Tell us what happened and we will look again.

---

## What I most want a lawyer to read

1. **Section 5, the 24-hour commitment.** This is a public undertaking. Once
   published it can be held against the operator. A lawyer should confirm the owner
   wants to make it, and that "review within 24 hours" — rather than "remove within
   24 hours" — is the right framing. Apple's guideline asks for removal and ejection;
   a review commitment is honest but weaker, and the difference matters.
2. **Section 6, and whether a policy can describe a blocking feature that does not
   exist.** My answer is no, which is why it is marked as a gap rather than written
   as prose. Confirm.
3. **Section 8, whether posts survive account deletion** — this is the same
   collision as in the privacy policy, and the two documents must agree.
4. **The line between moderating a community and being responsible for what is said
   in it**, in a community specifically about money. Members will post things that
   look like advice. A lawyer should say what the operator's exposure is and whether
   the disclaimers cover member-to-member statements as well as Kai's.
5. **Whether "no personalised investment advice between members" is enforceable in
   practice**, and what the operator must do when a member ignores it.
