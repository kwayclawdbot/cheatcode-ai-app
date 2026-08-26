# Palette lock — "Palette #1 · Volt + Violet" (locked in Claude Design, 2026-08-26)

Extracted from the owner's Claude Design project export (`Cheat Code AI - Core Screens`). This SUPERSEDES the charcoal/navy/ivory/gold line in the v3 docx §11 and D7 in RECONCILIATION_DECISIONS.md.

## Colour roles (from the canvas legend: User action · Kai intelligence · Market data · Financial semantics)
| Role | Hex | Use |
|---|---|---|
| Background | `#0B0B0E` | App base (dark-first; no light theme in the locked set) |
| Surface | `#1C1C22` · `#17171C` · `#111117` | Raised panels, inputs, rows |
| Text | `#FFF7E8` | Primary text (warm ivory) |
| Text muted | `#B9B0A8` | Secondary text, labels |
| Text dim | `#6E675F` | Tertiary, disabled |
| **Volt** | `#C8FF00` (hover/alt `#D6FF3D`, `#DEFF66`) | USER ACTION only: primary buttons, active nav, mode chip, "slide to confirm" |
| **Violet** | `#8B4DFF` / `#8B5CF6` | KAI INTELLIGENCE: Kai avatar, Kai messages, Kai buttons ("Build plan", "Ask Kai") |
| Violet light | `#CBB2FF` / `#C4B5FD` | Kai text accents, grades |
| Violet deep | `#3B1685` / `#6D28D9` | Kai panel fills |
| **Cyan** | `#32D6FF` | MARKET DATA: prices, chart lines, live freshness dot, "Market open" |
| Cyan tint | `#0F2733` | Market-data panel fill |
| **Green** | `#35D07F` | Confirmed positive / target / healthy — semantic only |
| Green tint | `#122A1E` | Positive panel fill |
| **Red** | `#FF5A5F` | Invalidation / stop / loss / destructive — semantic only |
| Red tint | `#2E1517` | Risk panel fill |
| **Gold** | `#FFC857` | Grade badges, "needs attention", caution |
| Danger deep | `#B00020` | Moderation remove / hard danger |

## Type
- UI: **Space Grotesk** 400/500/600/700
- Numbers/prices/times: **IBM Plex Mono** 400/500/600 (Core Screens) — the earlier palette file used JetBrains Mono; Core Screens is the later file, so IBM Plex Mono is the lock unless the owner says otherwise.
- Body ≥16px on mobile, tabular numerals for prices.

## Rules carried over from the locked screens
- Volt is never used for Kai; violet is never used for a user action. This is the one-glance grammar: volt = you, violet = Kai, cyan = the market.
- Green/red/gold remain financial semantics only.
- Status = label + shape + colour.
- Fake iOS status bar/frame in the mockups is presentation chrome, not product UI.

## Approved-flow screen set (canvas tier "APPROVED FLOW — build from these screens")
V3-A1 Alerts (glance-first decision inbox) · V3-P1 Positions (health at a glance) · V3-K1 Research (object first, depth behind Why?) · V3-H1 Home (Kai chat wall, morning report on first open) · V3-T1 Trade plan (numbers first, one slide to commit) · V3-T2 Debrief (receipt as icons, lesson in one line) · V3-C1 Setup room (Kai's structured summary replaces the scroll) · V3-C0 Community home (channels + live) · V3-AC1 Account (rules, brokers, Kai involvement) · V3-O1 Onboarding (tap the level that would confirm this setup) · V3-O0 Conversational onboarding.
V2-* screens = reference explorations. S01–S86 tier = "ARCHIVE — superseded explorations, reference only, do not build from these".

## Nav as drawn in the approved screens
Home · Alerts · Positions · Community · Account — see the open nav decision in RECONCILIATION_DECISIONS.md D10.
