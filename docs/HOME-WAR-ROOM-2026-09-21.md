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

**At rest.** Under the bar, Kai's brain: about 200 points tall, violet, with
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
screen, so it shrinks to a small orb in the top bar (which keeps the status
light's colour) and the panel takes a framed stage:

- monospace tabs, one per open panel, each with a small symbol and the ticker;
- a "close all" at the end of the tab row, and the existing close button for
  the one in front;
- the chart stays loaded behind the other tabs, so switching back to it does
  not reload it;
- the panel settles in with a slight overshoot when it opens;
- while Kai draws on the chart, his latest line shows as a caption over it
  (the chart already has a caption slot for this).

**Voice.** While the mic is listening, the brain's rings follow the volume of
the member's voice. While Kai speaks, they pulse. The voice code already
measures volume for the mic button; the one addition is that it now hands
that number back to Home.

**Kai offline.** When the member is out of credit, the brain dims to grey
lines, the status light reads "Kai offline", and the caption says why in one
honest line (for example "Out of credit today. Back tomorrow morning.").
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
