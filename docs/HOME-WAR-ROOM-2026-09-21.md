# Home in the War Room style — design note (2026-09-21)

Lane: `lane/home-warroom`, starting from `e95c940`.

This note comes before the build. It says what makes the old War Room app
look and feel the way it does, and how Home on the phone borrows that without
losing anything Home does today.

## What the reference does (read from its code and design docs)

The War Room app was not installed or run for this lane. Its code and design
documents were read in full, and these are the traits that make it look like
itself:

1. **Kai's brain is the centrepiece.** A glowing web of connected dots split
   into eight labelled regions: Memory, Market, Technicals, Alerts, Watchlist,
   Community, News, Options. A region lights up when Kai uses the tool behind
   it, so you can watch him think. When idle it breathes slowly. It never sits
   frozen.
2. **A heads-up-display frame.** Near-black background, small uppercase
   monospace labels ("KAI · BRAIN"), a caption line under the brain, and a
   status word under the mic ("listening…", "speaking", "hold to talk").
3. **The mic is the main control.** A large round button at the bottom, with
   typing as the backup.
4. **Panels are tabs.** Chart, quote, news, earnings and options open as tabs
   with a small symbol and the ticker. The chart stays loaded while you switch
   between tabs, and there is a "close all".
5. **Motion means something.** Panels settle in with a slight overshoot, chart
   levels draw one at a time in step with Kai's words, and a change of state
   washes the panel in its colour.

The reference draws the brain in 3D. That is too heavy for a phone in Expo Go,
so this build draws it as a light vector drawing instead.

## The phone layout

**Top bar.** "KAI · WAR ROOM" in small monospace capitals, then a status light
for Kai, then the member's stage. The existing conversations, panel and
new-conversation buttons stay where they are. The status light has five
states:

| State     | When                                                      | Colour |
|-----------|-----------------------------------------------------------|--------|
| Ready     | nothing is happening                                      | green  |
| Thinking  | Kai is writing a reply                                    | violet |
| Speaking  | Kai's voice is playing                                    | violet |
| Listening | the mic is recording or the words are being written down | volt   |
| Offline   | the member is out of credit, or the phone has no network | dim    |

Volt is the member's colour and violet is Kai's, so "Listening" is volt (the
member is talking) and "Thinking"/"Speaking" are violet (Kai is).

**At rest.** Under the bar, Kai's brain: about 180 points tall in its frame, violet, with
its eight region labels. It is a frame with a small "KAI · BRAIN" label and a
caption line under it that says what Kai is doing. Kai's greeting and the
stage-based opening card sit under the brain, then the conversation and the
message box exactly as today. The brain scrolls away with the greeting, so the
conversation is never squeezed by it.

**The brain follows the member's stage.** The regions that glow when Kai is
idle are the ones that matter most to this member:

- Beginner: Memory, News and Watchlist glow first — his notes and lessons, the
  news, and the few names being learned on.
- Developing: Technicals, Market and Watchlist.
- Trade Ready: Alerts, Technicals and Options — setups, alerts and the chart.

**When Kai uses a tool, its region lights.** A chart or a price lights Market
and Technicals; news lights News; earnings and options light Options; the
watchlist and positions light Watchlist; a room lights Community. While Kai is
writing, Memory is lit, because he is reading the conversation.

**When a panel or chart opens.** The big brain would push the panel off the
screen, so it shrinks to a small orb in the top bar (dimmed when Kai is
offline) and the panel takes a framed stage:

- monospace tabs, one per open panel, each with a small symbol and the ticker;
- a "close all" at the end of the tab row, and the existing close button for
  the one in front;
- the chart stays loaded behind the other tabs, so switching back to it does
  not reload it;
- the panel settles in with a slight overshoot when it opens;
- while Kai draws on the chart, his latest line shows as a caption over it.
  (The chart's full-screen view already had this; the chart on Home did not,
  so the panel stage now draws the same kind of caption itself.)

**Voice.** While the mic is listening, the brain's rings follow the volume of
the member's voice. While Kai speaks, they pulse. The voice code already
measures volume for the mic button; the one addition is that it now hands
that number back to Home.

**Kai offline.** When the member is out of credit, the brain dims to grey
lines, the status light reads "Kai offline", and the caption says why in one
honest line (for example "Today's credits are used up. They come back
overnight.", with the time taken from when the credits actually reset).
It still looks like the War Room; nothing is hidden or replaced with an error
screen. No network gives the same dim brain with "No connection".

## What does not change

- Every Home function stays: the greeting, the opening card, the briefing,
  saved conversations, the panel launcher, credit strip, offline banner, saved
  plan, drafts, retry, suggestions and the mic in the composer.
- Reduce motion (the phone's setting or the member's own toggle) stops all
  movement: the brain draws still, rings do not pulse, panels appear without
  the overshoot. Colours still change, because a colour change is not motion.
- Every colour comes from `src/ui/tokens.ts`. Nothing new is typed in as a
  raw colour.
- The brain is identity, so it is hand-drawn in `src/ui`, not built from the
  gluestack chrome set.

## What needs a real phone after the build

- How smoothly the brain animates in Expo Go.
- Whether the mic volume really moves the rings (the web preview has no
  microphone in the proof runs).

## As built (same day)

- Proof shots, from `apps/mobile/scripts/proof-home-warroom.mjs` in fixtures
  mode, are in `docs/home-warroom-proof/`: 390×844 at 100% and 130% text, and
  360×780. They cover a Trade Ready and a Beginner member at rest, Kai writing
  over a chart, two panels as tabs with "close all", Kai offline, a panel
  opened by the member at 360, and the mic as the main control, idle and
  listening.
- The rules (status, lit regions, captions) are in
  `apps/mobile/src/features/home/warroom.ts` and tested by
  `apps/mobile/scripts/war-room-test.mts`, which runs in `npm test`.
- Regions light from what is on screen and whether Kai is writing. The app is
  not yet told which tool Kai calls mid-answer, so a region lights when its
  panel opens rather than the instant the tool runs. When the server starts
  sending tool events, `litRegions` is the one place to feed them in.
- Fixtures mode gained `?stage=` (preview a stage) and a canned "chart" turn,
  so the stage-aware brain and the chart caption can be photographed. Neither
  does anything on a real stack.

## Polish pass (orchestrator review, same day)

- The "3/8 LIT" counter is gone; members read it as jargon. The regions still
  light.
- The brain adapts. At the design's text size on a tall phone it is a
  124-point drawing in its frame. At larger text (the member's setting or the
  phone's, 115% and up) or on a screen shorter than 800 points, it shrinks to
  80 points with tighter labels, drops the "KAI · BRAIN" label row (the bar
  above already says KAI · WAR ROOM) and keeps the caption to one line.
  Measured: the opening card's main button now sits above the message box at
  390×844 at 100% and 130%, at 360×780, and with the mic showing. The
  proof script checks this on every run.
- The mic is the main control when voice is live: a 52-point volt button
  beside the message box, with a status word under it (TAP TO TALK,
  LISTENING…, SPEAKING). The message box keeps its Send button and reads
  "Or type to Kai…". Without voice, nothing changes. The Kai sheet still has
  the smaller mic beside Send.
- Fixtures gained `?voice=on`, which draws the mic as if the server had said
  voice is live. It does nothing against a real API. The listening proof uses
  Chromium's test tone as the microphone, so the recording, the metering and
  the ring growing with the level are real, not stubbed.
- The canned chart reply now says "15-minute chart" and opens the chart on
  15 minutes, matching what the chart shows.
- The priority card's cut-off status row ("Approac…", "9:41 AM") is left alone
  on purpose: that card belongs to the alert-card lane.
