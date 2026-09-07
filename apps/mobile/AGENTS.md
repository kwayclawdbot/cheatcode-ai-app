# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

This app is on **SDK 57** (React Native 0.86, React 19.2.3, react-native-web 0.21).
It was on 54 until 4 September; the URL above was pointing at v54 and is now correct.
Expo Go for iOS only ever runs the NEWEST SDK, so the number moves on its own — check
`api.expo.dev/v2/versions` rather than trusting this line.

---

# Two UI layers: gluestack for chrome, hand-rolled for identity

This app has **two** styling systems on purpose. Before you build a screen, decide
which one it belongs to, because using the wrong one is the kind of mistake that
looks fine in isolation and makes the product feel assembled from parts.

### Identity — hand-rolled, `StyleSheet`, `src/ui/*`

Anything a member sees and would recognise as *this product*: the alert card, the
chart, the desk, the Kai surfaces, setups, positions, the tab bar, prices and
levels. These are built from the components in `src/ui/` (`Panel`, `Text`/`T`,
`Price`, `Ticker`, `SetupObject`, `KaiOrb`, …) using values imported from
`src/ui/tokens.ts`.

Do **not** rebuild these on a component library. They are the product's face, they
carry rules a generic library has no concept of (a ticker always appears with its
logo; prices always go through `Num`; volt means the user acted and violet means
Kai did), and every one of them has signed-off pixels in `apps/mobile/proof/`.

### Chrome — gluestack-ui v5 + uniwind, Tailwind classNames

The furniture around the product: sheets, popovers, menus, forms and inputs,
toasts, tables. This is work with no identity in it — a select is a select — and
hand-rolling it has been costing time and producing subtly inconsistent controls.

**This applies to controls that do not exist yet, not to re-skinning ones that
do.** The admin boards under `src/app/(admin)/` are the case worth naming: they
are operator surfaces, so by the letter of the rule above they are chrome — but
all five of them already share a house shell (`Board`, `Section`, `ChipRail` in
`src/features/admin/components.tsx`) and they sit in one nav rail together. A
sixth board built on gluestack would be the odd one out in a row of six. So **new
admin boards keep using `Board`/`Section`**, and gluestack earns its way in there
only when a board needs a control the hand-rolled set genuinely lacks. A
consistent surface beats a tidy rule.

Chrome is written with `className` strings against **semantic** tokens only
(`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`). Never write a
raw colour, and never reach for a Tailwind palette utility (`bg-zinc-800`,
`text-red-500`) — those are not the house colours and they bypass everything
below.

**The line between the layers is the member.** If a member sees it and it says
something about who we are, it is identity. If it is a control that gets them to
the next thing, it is chrome. When genuinely unsure, hand-roll it: a hand-rolled
control that should have been chrome costs an afternoon, chrome that should have
been identity is visible to customers.

## The palette has exactly one source

`src/ui/tokens.ts`. Nothing else. Both layers read from it, by different routes:

```
                      src/ui/tokens.ts          <-- edit colours ONLY here
                       /                \
        (imported directly)          scripts/gen-theme.mts
                     /                        \
            src/ui/*.tsx                src/ui/theme.generated.css   <-- GENERATED
          (hand-rolled layer)                     |
                                              global.css
                                                  |
                                        gluestack chrome (className)
```

Rules that follow from that diagram, all enforced by
`scripts/theme-bridge-test.mts` in `npm test`:

- **Never hand-edit `src/ui/theme.generated.css`.** It is a build artifact that
  happens to be committed (Metro needs it on disk). Change `tokens.ts`, then run
  `npx tsx scripts/gen-theme.mts`.
- **Never write hex values into `global.css`.** A second copy of the palette has
  no way of knowing when the first one changes, and the two halves of the app
  would drift apart one token at a time without anything failing.
- The mapping keeps the house grammar intact: `primary` is **volt** (the user
  acting), `accent` is **violet** (Kai), `destructive` is the same red the P&L
  uses. An accent-coloured control therefore reads as "Kai did this" in chrome
  exactly as it does on a hand-rolled card. `border` is genuinely an *alpha*
  colour — ivory at 12%, not a flat grey.

## `global.css` has no preflight, deliberately

`global.css` imports Tailwind in three pieces (`theme.css`, `utilities.css`) and
**leaves out `preflight.css`**. Do not "fix" this back to a single
`@import 'tailwindcss'`.

Preflight is a document-wide DOM reset written for hand-authored HTML. On web
every screen here is rendered by react-native-web, which ships its own reset;
stacking a second one changes `svg { display: block }`, `* { border: 0 solid }`
and the form-control defaults across the whole live build — silently, with no
error, against ~60 screens whose pixels are already signed off in `proof/`.
gluestack components are React Native components that must also render on iOS and
Android where no preflight exists, so they cannot depend on it anyway.

The full argument is in the header of `global.css`, and the absence is asserted
by the theme-bridge test — restoring preflight turns `npm test` red with an
explanation rather than shipping a silent visual regression.

## Adding a chrome screen

1. Confirm it is chrome, not identity (see the line above).
2. Use semantic tokens only. If you need a colour that has no semantic name, add
   the name to `tokens.ts` and the mapping in `scripts/gen-theme.mts` — do not
   inline the value.
3. Fonts are **families, not weights**. React Native has no synthetic bolding for
   a custom face, so use `font-ui-semibold`, never `font-semibold`, and
   `font-num` for anything numeric.
4. Run `npm test` — the theme bridge check runs first and fails loudly on drift.
