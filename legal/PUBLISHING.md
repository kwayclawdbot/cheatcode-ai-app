# Where these documents have to live, and what asks for them

**Nothing here has been published.** These are files in a repository. Publishing is
the owner's call and needs a lawyer's read first.

---

## 1. What needs a public URL, and who asks for it

| Document | Who asks | Where it is entered |
|---|---|---|
| **Privacy Policy** | Apple, mandatory | App Store Connect → App Information → **Privacy Policy URL**. Cannot submit without it. |
| **Privacy Policy** | Apple, again | Reachable **from inside the app** — Guideline 5.1.1. The app reads it from `EXPO_PUBLIC_PRIVACY_URL`. |
| **Terms of Service** | Apple, for anything with a subscription | App Store Connect → App Information → **EULA / Licence Agreement URL** (optional field, but expected here), and inside the app via `EXPO_PUBLIC_TERMS_URL`. |
| **Community Policy** | Apple, Guideline 1.2 | No dedicated field. It must be reachable — either as its own page linked from the Terms, or as a section of the Terms with an anchor. |
| **Disclaimers** | Nobody asks for a URL | But it is part of the Terms and should be a page, because the in-app strings are short and the full text has to live somewhere. |

## 2. The two environment variables the app reads

`apps/mobile/src/features/legal/urls.ts` (written by another lane) reads exactly two
values, and **hides the links entirely if either is missing or is not `https://`** —
deliberately, because a dead "Privacy Policy" row fails review harder than an absent
one.

```
EXPO_PUBLIC_PRIVACY_URL=https://…
EXPO_PUBLIC_TERMS_URL=https://…
```

They must be set in **two places**:
1. `apps/mobile/.env` — for local runs.
2. The **EAS build profile's `env` block** in `eas.json` — a cloud build does not read
   the laptop's `.env` file. *(There is no `eas.json` yet. It is on the app lane's
   list.)*

**There is no environment variable for the Community Policy or the Disclaimers.**
Either add two more, or link them from the Terms page. Linking from Terms is less
work and is sufficient for Guideline 1.2.

## 3. Suggested addresses

The owner's site is **cheatcode.com** (DNS was outstanding as of the July notes —
**check it resolves before you paste a URL into App Store Connect**; Apple follows
the link, and a policy URL that does not load is a rejection).

```
https://cheatcode.com/privacy       ← EXPO_PUBLIC_PRIVACY_URL
https://cheatcode.com/terms         ← EXPO_PUBLIC_TERMS_URL
https://cheatcode.com/community     ← linked from /terms
https://cheatcode.com/disclaimers   ← linked from /terms
```

**A fallback if cheatcode.com is not ready.** Other web properties exist —
`family-investing-club.vercel.app`, `familyinvestingclub.com`, the marketing sites.
Do not use one of those: a privacy policy for Cheat Code AI served from a Family
Investing Club domain reads to a reviewer as the wrong company's document, and it
undermines the "who we are" section of the policy itself. If cheatcode.com is not
ready, put the four pages on a plain Vercel deployment under a Cheat Code name and
point the domain at it later — the URL can be changed in App Store Connect without a
new build **only if the app's copy is also updated**, which needs a build. So it is
cheaper to get the final domain right the first time.

## 4. Requirements for the pages themselves

- **Publicly reachable with no sign-in.** Apple's reviewer is not logged in.
- **No `noindex` needed**, but no login wall, no cookie wall that blocks the text.
- **Readable on a phone.** The reviewer opens them in an in-app browser sheet.
- **A visible "last updated" date.**
- **The same text as these files.** If the lawyer edits the published page and not
  this folder, the two drift and the next person reads the wrong one. Publish *from*
  these files.

## 5. Order of operations

1. A lawyer reads all four drafts and returns edits.
2. Fill in every `[SQUARE BRACKET]` — legal entity, address, contact emails,
   jurisdiction, minimum age, refund position.
3. **Remove or resolve every gap marked in the drafts.** In particular: do not
   publish a deletion right until account deletion works, and do not publish the
   blocking section of the Community Policy until blocking exists.
4. Publish the four pages.
5. Set `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` in `.env` and in
   `eas.json`, and rebuild.
6. Tap both links in the built app on a real device. Confirm they open.
7. Paste the Privacy Policy URL into App Store Connect.
8. Fill in the App Privacy labels from `PRIVACY-LABELS.md`, resolving the five
   judgement calls at the end of that document first.
