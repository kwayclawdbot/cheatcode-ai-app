# Building this app for real

Plain English. This app has **only ever run in Expo Go**. There is no native
binary of it, there never has been, and no build has been run — a build costs
money and needs decisions that have not been made. This file is the
configuration's instruction manual, not a record of anything that happened.

---

## 1. THE BUNDLE IDENTIFIER — YOUR DECISION, AND IT IS PERMANENT

**Proposed: `com.cheatcode.ai`** — set in `app.json` for both iOS
(`ios.bundleIdentifier`) and Android (`android.package`).

**It is a proposal. Nothing should be built until you say yes to this exact
string.**

### Why this one

Apple's convention is reverse DNS of a domain you own. `cheatcode.com` reverses
to `com.cheatcode`, and the product is Cheat Code AI, so `com.cheatcode.ai`.
Using a domain you control is what guarantees the identifier is globally unique
and is not something somebody else could reasonably claim.

The alternative considered was `com.cheatcode.app`, because the trailing `ai` in
`com.cheatcode.ai` reads at a glance like a domain suffix rather than a product
name. Matching the product name exactly won.

iOS and Android are deliberately set to the **same string**: one identity for
one product, one fewer thing to get wrong later.

### Why it cannot be changed later

Once the app is published, the bundle identifier is the app, permanently. It
cannot be edited — not by you, not by Apple. Changing it means creating a
**second app**: a new App Store record, a new listing, zero reviews, zero
ranking history, and every existing install stranded on a version that will
never get another update. Google Play is the same.

### Two things to check before you say yes

1. **You control `cheatcode.com`.** If a bundle id is built on a domain that
   turns out to belong to somebody else, that surfaces years later and cannot be
   undone.
2. **Nothing already occupies it.** Bundle ids are unique across the entire App
   Store, including apps that have been pulled. Registering the App ID in the
   Apple Developer portal is what actually proves it is free.

---

## 2. WHAT YOU HAVE TO SUPPLY BEFORE A FIRST BUILD

Nothing below can be done from this side.

| | What | Why |
|---|---|---|
| 1 | **Confirm the bundle identifier** above | Permanent. Everything else depends on it |
| 2 | **An Apple Developer Program account — $99/year** | Without it no iOS build can be signed and nothing can be submitted. Its existence has not been confirmed |
| 3 | **A published Privacy Policy URL and Terms URL** | Required. Without them the app draws no legal links and review fails on guideline 5.1.1. Set as `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` |
| 4 | **A demo account for App Review** | The app is sign-in-only. A reviewer who cannot get in rejects it on 2.1. Credentials go in the App Store Connect review notes |
| 5 | **The App Store Connect app record** | Produces the `ascAppId` that `eas submit` needs |
| 6 | **The EAS environment variables** | Below |
| 7 | **Answers to Apple's App Privacy questions** | What is collected, whether it is linked to identity, whether it is used for tracking |

### The EAS environment variables

A cloud build does **not** read the laptop's `.env`. Every one of these has to
exist in EAS or the built app points at nothing:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_API_BASE
EXPO_PUBLIC_VAPID_PUBLIC_KEY
EXPO_PUBLIC_PRIVACY_URL      <- does not exist yet
EXPO_PUBLIC_TERMS_URL        <- does not exist yet
```

Set with `eas env:create` per environment. **None of them go in `eas.json` —
this repository is public.**

---

## 3. THE PROFILES IN `eas.json`

| Profile | What it is | When |
|---|---|---|
| `development` | Dev client on a registered device. Replaces Expo Go | To develop against a real binary |
| `preview` | A real Release build, installed internally | **Build this one first** |
| `production` | Store build, auto-incrementing build number | Submission |

**Build `preview` before `production`.** It is the same code path as the store
build, and it is where the problems in §4 surface. Finding one there costs a
rebuild. Finding one after submission costs a review cycle.

`production` pins `EXPO_PUBLIC_FIXTURES=0` and `EXPO_PUBLIC_DEV_TOOLS=0` rather
than leaving them unset. Fixtures mode draws sample balances and sample alerts
that look exactly like real ones; shipping it on by accident would put invented
data in front of a reviewer.

---

## 4. WHAT WILL PROBABLY BREAK ON THE FIRST NATIVE BUILD

Expo Go is not the app. It is a different app, with its own bundle identifier,
its own Info.plist, its own entitlements and its own push certificates, that
loads this JavaScript. Everything below is hidden by that and only appears once
there is a real binary.

**Push notifications are the big one.** In Expo Go, push runs on *Expo Go's*
push credentials. A standalone build needs an **APNs key from the Apple
Developer account**, which does not exist yet. Until it does, `expo-notifications`
will register and then never deliver — and it will fail quietly, because a token
that is accepted and never used looks identical to one that works. The app has
four live crons that push. **Verify a real push arrives on a `preview` build
before believing any of it.**

**Permission prompts fire for the first time.** Expo Go has already been granted
notification permission by whoever installed it, so this app's own request has
probably never actually run. First launch of a real build is the first time that
code path executes.

**Deep links change shape.** `scheme: "cheatcodeai"` is ignored in Expo Go,
which serves links under its own `exp://`. Every route reached by a link —
alerts opening a chart, `/join/[code]`, the magic-link sign-in — is untested
under the real scheme. **The magic link is the one to watch**: it is an email
link that has to reopen the app and land on a session.

**Fonts, splash and icons.** Three Google font families, a splash screen and an
icon set are all loaded through Expo Go's asset pipeline today. A native build
bundles them itself, and a missing or mis-sized asset shows up as a blank splash
or a fallback font.

**`react-native-webview` and the chart.** The chart runs in a WebView
(`chart-web/`). Local asset loading and the JavaScript bridge behave differently
in a signed build than under the Expo Go dev server, and the chart is central to
the app.

**Reanimated 4 / worklets.** Worklets are compiled by a Babel plugin. Expo Go
ships a prebuilt runtime; a native build compiles its own. Version skew here
produces a crash on launch, not a warning.

**Release-only failures.** `production` and `preview` build in Release, which
minifies. Anything relying on a function or class *name* at runtime breaks only
in Release, never in development.

**The microphone permission, already fixed.** The bare `expo-audio` plugin was
adding `NSMicrophoneUsageDescription` and Android `RECORD_AUDIO` for a
microphone this app never opens. `app.json` now says no to both. **Still open:**
that plugin also declares `UIBackgroundModes: audio`. It is left on in case Kai
Live needs to keep talking while the phone is locked — if it does not, turn it
off. A declared background mode the app does not use is a documented rejection.

---

## 5. THE ONE THING TO KEEP CHECKING

**The app must contain no price and no way to buy anything.** That is the
condition attached to App Store rule 3.1.3(b), which is what lets people buy on
the website and simply sign in here without In-App Purchase.

It is enforced on the server rather than trusted to a screen — see
`apps/api/src/lib/storefront.ts` — but a future screen can still put a figure
back on its own. Before every submission, search the app for a `$`, for the word
"upgrade", and for anything that opens a browser at a checkout.
