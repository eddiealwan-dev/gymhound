---
name: GymHound
description: A local-first gym log that runs a progression rule in plain words, on a warm dark palette with one red wordmark.
colors:
  bg-dark: "#100f0c"
  surface-dark: "#1a1814"
  surface-raised-dark: "#232019"
  border-dark: "#2e2a23"
  border-strong-dark: "#736c60"
  text-dark: "#f1ece2"
  text-muted-dark: "#a39d90"
  text-faint-dark: "#6d675c"
  bg-light: "#f6f3ec"
  surface-light: "#ffffff"
  surface-raised-light: "#efebe3"
  border-light: "#ddd7cb"
  border-strong-light: "#8a8478"
  text-light: "#15130f"
  text-muted-light: "#6b665c"
  text-faint-light: "#8f897d"
  wordmark-red: "#E10600"
typography:
  wordmark:
    fontFamily: "BarlowCondensed_800ExtraBold"
    fontSize: "38px"
    fontWeight: 800
    letterSpacing: "-0.5px"
  date:
    fontFamily: "BarlowCondensed_800ExtraBold"
    fontSize: "56px"
    fontWeight: 800
  headline:
    fontFamily: "BarlowCondensed_800ExtraBold"
    fontSize: "32px"
    fontWeight: 800
  display:
    fontFamily: "BarlowCondensed_700Bold"
    fontSize: "28px"
    fontWeight: 700
  title:
    fontFamily: "BarlowCondensed_700Bold"
    fontSize: "22px"
    fontWeight: 700
  greeting:
    fontFamily: "BarlowCondensed_700Bold"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "0.5px"
  number:
    fontFamily: "BarlowCondensed_700Bold"
    fontSize: "24px"
    fontWeight: 700
    fontFeature: "tnum"
  body:
    fontFamily: "Inter_400Regular"
    fontSize: "16px"
    fontWeight: 400
  body-strong:
    fontFamily: "Inter_600SemiBold"
    fontSize: "16px"
    fontWeight: 600
  caption:
    fontFamily: "Inter_400Regular"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Inter_600SemiBold"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.5px"
  column-label:
    fontFamily: "Inter_600SemiBold"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.3px"
rounded:
  field: "8px"
  segment: "9px"
  row: "10px"
  control: "12px"
  card: "16px"
  pill: "18px"
  round: "999px"
spacing:
  hairline: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  section: "32px"
  block: "28px"
components:
  button-primary:
    backgroundColor: "{colors.text-dark}"
    textColor: "{colors.bg-dark}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-dark}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-compact:
    backgroundColor: "transparent"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-dark}"
    rounded: "{rounded.card}"
    padding: "16px"
  segmented-control:
    backgroundColor: "{colors.surface-raised-dark}"
    rounded: "{rounded.control}"
    padding: "4px"
  segment-selected:
    backgroundColor: "{colors.text-dark}"
    textColor: "{colors.bg-dark}"
    rounded: "{rounded.segment}"
    height: "44px"
  set-field-entered:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.field}"
    height: "44px"
  set-field-suggested:
    backgroundColor: "transparent"
    textColor: "{colors.text-faint-dark}"
    rounded: "{rounded.field}"
    height: "44px"
  tick:
    backgroundColor: "{colors.text-dark}"
    textColor: "{colors.bg-dark}"
    rounded: "{rounded.round}"
    size: "40px"
  sheet:
    backgroundColor: "{colors.surface-dark}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Design System: GymHound

## Overview

**Creative North Star: "The Bench-Side Logbook"**

GymHound is a training log you glance at between sets: phone on the bench, chalk on the hands, music in the ears. The system behaves like a well-kept logbook on warm, iron-dark paper. Numbers are set in a tall condensed face so they read at arm's length; sentences are set in a plain sans so the rule reads like a person said it. Everything else steps back. There is one loud thing on the whole screen, the red GYMHOUND wordmark beside the hound, and it never moves, never grows and never shares its red with anything that is not the active tab or a personal record.

Density is a working density, not a dashboard density. Every target is at least 44pt because hands are sweaty and the phone may be lying flat. Rows wrap rather than truncate when the phone's text size goes up, because the person reading may have turned it up for exactly this screen. Depth comes from three warm tonal steps and hairline borders, never from shadow. Light and dark are both first-class; dark is the gym-floor default most lifters will see, light is the same paper in daylight.

What a set shows is what it logs, so suggestion and fact look different on sight: a suggested value is faint, light and dashed; an entered value is bold, solid and filled. That distinction is the system's signature and it outranks decoration everywhere.

**Key Characteristics:**
- Warm near-black and warm paper, never neutral grey; every neutral carries a little brown.
- Barlow Condensed for titles and every number (tabular figures); Inter for anything that reads as a sentence.
- One red, three uses: the wordmark, the active tab, PR marks.
- Flat surfaces in three tonal steps with 1px borders; no shadows.
- Primary actions are filled with the text colour; ticks are filled with the text colour.
- 44pt targets, 16pt gutters, content capped at 512px and centred.

## Colors

A warm, almost monochrome palette of iron-black and chalk-paper neutrals with a single signal red reserved for the brand.

### Primary
- **Wordmark Red** (wordmark-red): the GYMHOUND wordmark in the header, the focused dock tab's icon and label, and PR marks. Nothing else, including errors, warnings, flags and destructive actions.

### Neutral
- **Iron Black / Chalk Paper** (bg-dark / bg-light): the page, the header, the dock and the session header.
- **Rubber Mat / Clean Sheet** (surface-dark / surface-light): cards, sheets, the rest row, entered set fields and the selected bar choice.
- **Raised Plate / Warm Stone** (surface-raised-dark / surface-raised-light): segmented-control wells, the done-set tint, the docked rest and music bars.
- **Seam** (border-dark / border-light): card, sheet and dock edges, the set-number chip, regular secondary buttons.
- **Strong Seam** (border-strong-dark / border-strong-light): set-field edges, compact pill outlines and the off track of a switch only: the edges a control needs to be seen at all. It holds 3:1 on bg, surface and surfaceRaised.
- **Chalk / Ink** (text-dark / text-light): text, primary-button fill, tick fill, the progress line, the superset bar, the selected segment.
- **Worn Chalk / Worn Ink** (text-muted-dark / text-muted-light): secondary lines, labels, the rule line, previous results, open tick rings.
- **Ghost Chalk / Ghost Ink** (text-faint-dark / text-faint-light): suggested values in empty set fields only. It holds 3:1 on bg and surface.

### Named Rules
**The One Red Rule.** Red #E10600 appears in exactly three places: the GYMHOUND wordmark, the active tab, and PR marks. A flagged day, an invalid number or a destructive button never borrows it; an invalid number gets a heavier muted underline instead.

**The Filled-With-Ink Rule.** Emphasis is made by filling with the text colour and labelling in the background colour (primary button, selected segment, done tick), not by adding a hue.

## Typography

**Display Font:** Barlow Condensed 600/700/800 (bundled; system font fallback while loading)
**Body Font:** Inter 400/500/600 (bundled)

**Character:** A tall, tight condensed face for the things you read at a distance (the date, exercise names, every number) against a neutral, highly legible sans for the sentences. The pairing reads like a stencilled plate number next to a handwritten note.

### Hierarchy
- **Wordmark** (Barlow 800, 38px, -0.5 tracking, uppercase): GYMHOUND only. Fixed size: it does not follow the phone's text size.
- **Date** (Barlow 800, 56px, uppercase by content): Train's date, one line, shrinks to fit.
- **Headline** (Barlow 800, 32px): the workout name on Train's Resume card. Up next's title uses Barlow 700 at 24px.
- **Display** (Barlow 700, 28px): screen titles (Routines, Settings) and sheet questions.
- **Title** (Barlow 700, 22px): exercise names and the session header's workout name (the header caps at 1.3x).
- **Greeting** (Barlow 700, 20px, 0.5 tracking, muted): GOOD MORNING over the date.
- **Number** (Barlow 600-800, tabular figures): stat numbers at 44px, the rest countdown at 32px (40px in the docked bar), set fields at 20px (600 suggested, 800 entered), previous results at 17px, the per-exercise count at 16px.
- **Body** (Inter 400, 16px): sentences. **Body strong** (Inter 600, 16px): button labels, list item names, field labels.
- **Caption** (Inter 400, 14px, muted): secondary lines, the rule line, Up next's scheme column, the + Note and Something off controls.
- **Label** (Inter 600, 14px, 0.5 tracking, upper case, muted; `Label` in src/ui/Text.tsx, read as a heading): the state label on Train's cards (UP NEXT, IN PROGRESS) and the group headings on Settings (APPEARANCE, UNITS, BAR, REST TIMER, BACKUPS, EXPORT) and Routines (PREMADE).
- **Column label** (Inter 600, 10px, 0.3 tracking, upper case, muted): the set table's column headers; the rest row's REST label is the same role at 11px.

### Named Rules
**The Text-Size Rule.** All text follows the phone's text size except the wordmark (fixed) and the session header's name, progress line and Finish label (capped at 1.3x so the header stays one row). Rows wrap instead of capping or truncating.

**The Tabular Rule.** Every number that can sit above or beside another number uses tabular figures.

## Layout

A single centred column, 16px gutters, capped at 512px, on every screen including sheets, the header, the dock and the docked bars. Pages scroll; the header and dock stay. On Train, History, Stats, Fuel and Settings a flexible spacer of at least 32px pins the GruntHound footer to the bottom of a short page and lets it follow a long one.

Spacing runs on 4px steps: 4 inside tight pairs (a title and its subtitle, a label and its value), 8 between items of a group, 12 between the two stat cards and between a row's text and its action, 16 between cards, inside cards and between the fields of a Settings group, 24 under a screen title, 32 between Settings groups, 28 between exercise blocks in a session. A field's name sits 8 over its control, so it is closer to its own control than to the one above it. Interactive rows are at least 44pt tall; a compact pill is 36pt tall with a 4pt hit slop so its target is still 44pt.

Wrapping is structural: when the phone's text grows, a row's trailing group drops to its own line as a unit and then wraps among itself, rather than squeezing the leading text.

## Elevation & Depth

Flat by default. Depth is three tonal steps (bg, surface, surfaceRaised) separated by 1px borders in the border colour. There are no shadows anywhere. Sheets rise over a 50% black scrim and are separated from it by their own surface colour and a top border, not by a shadow. A done set is marked by tinting its row surfaceRaised, not by lifting it.

### Named Rules
**The No-Shadow Rule.** If something needs to stand forward, it moves one tonal step and takes a hairline border. A shadow is never the answer.

## Shapes

Softly squared. Cards and sheets take 16px corners; regular buttons and segmented wells 12px; rows that tint (a done set, the rest row) 10px; selected segments 9px so they nest inside a 12px well with 4px padding; set fields and the set-number chip 8px. Compact pills are fully rounded (18px on a 36px height). The tick is a 40px circle, and the header's Settings button a 40px circle. A superset is a 3px bar in the text colour running down the left edge of its members, the only straight-edged accent in the system.

## Components

### Buttons
Plain, confident and quiet about it.
- **Shape:** gently rounded rectangle (12px) at 48pt, or a full pill (18px) at 36pt for compact.
- **Primary:** filled with the text colour, labelled in the background colour, Inter 600 16px, 20px side padding. One per sheet or card.
- **Secondary:** transparent with a 1px border (Seam at regular size, Strong Seam at compact size), labelled in the text colour.
- **Quiet:** no chrome, label only (+ Set, + Warmup, Discard workout). A row of quiet buttons steps back by their 12px padding so the first label lines up with the content edge.
- **Compact for a row's own action:** an action that belongs to one row of a list (Set active on a routine, the rest pills, Finish in the session header) is a compact secondary pill; full-size buttons are for a card's or a sheet's main answers.
- **A state is not a button:** a row's current state (the routine in use) is a text-colour checkmark and a word, with no edge or fill.
- **Pressed / disabled:** pressed drops opacity to 0.8; disabled to 0.4 and ignores presses.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** surface, with a 1px Seam border.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Internal Padding:** 16px.

### Segmented control
A well in surfaceRaised (12px corners, 4px padding, 4px gaps) holding 44pt segments; the chosen segment is filled with the text colour and labelled in the background colour. Used for Appearance, units, bell sound, bell volume and (wrapping in rows of three) rest length.

### Switch
The platform switch, themed: on, a text-colour track under a background-colour thumb; off, a Strong Seam track (on iOS through its background colour too), so the off state is as visible as the on state in both themes. Its row is 44pt tall with the setting's name on the left.

### Settings groups
Each group is an upper-case Label heading 8pt over its items; items sit 16pt apart; a field is its name 8pt over its control; groups are 32pt apart, the first 24pt under the title. Helper lines ("Used by the plate calculator.") are muted.

### Inputs / Fields
- **Suggested set field:** no fill, 1px dashed Strong Seam edge, Ghost text in Barlow 600 at 20px. A suggestion never looks like a value.
- **Entered set field:** surface fill, 1px solid Strong Seam edge, text in Barlow 800 at 20px.
- **Invalid:** a 2px muted bottom edge and the line "Check this number" above the row. Never red.
- **Focus:** the platform caret and keyboard; fields keep returnKeyType "done".

### Navigation
- **Header:** the hound mark (48px) and the red GYMHOUND wordmark on one line, 10px apart, with a 40px round Settings button (Close on Settings) on the right.
- **Dock:** four tabs (Train, History, Stats, Fuel), 56pt tall, icon over a 12px Inter 600 label; the focused tab is red, the rest muted.
- **Session header:** back chevron, the workout name with its progress and time under it, Music on a phone, and a compact Finish pill; a 2px text-colour line along the bottom fills with the share of sets ticked.

### The tick (signature)
A 40px circle in a 44pt column. Open, it is a 1.5px muted ring; on the next set to do it is a 2.5px ring in the text colour; while not ready the ring is dashed. Done, it fills with the text colour and shows a background-colour checkmark, and the row behind it tints surfaceRaised.

### The exercise name row (signature)
The exercise name (Barlow 700, 22px) with ⋯ alone at the right edge, a 44pt box centred on the name's first line and over the tick column. The count, + Note and Something off are one quiet group that follows the name: beside it when both fit, otherwise under it as a 24pt line left-aligned with the name. + Note and Something off are a 14px muted icon and 14px muted words with a 10pt hit slop above and below (44pt targets) and 6pt to the sides (half the 12pt gap), so the dropped line costs 26pt instead of a 44pt row; the whole header is 53pt on a phone. Flagged, Something off shows its reason, still muted. At large text the name wraps, the group wraps among itself 20pt apart, and words wrap rather than truncate. Whatever sits under the row (the saved note line, the note field) starts 10pt down, clear of the hit slop.

### The rest row (signature)
Under the set that started it: a surface panel with a Strong Seam edge, a REST label over a Barlow 800 countdown, then −15s, +15s and Skip as compact pills, over a 3px text-colour track that drains with the time left. At zero it holds a check and "Rest's up" at the same height.

## Do's and Don'ts

### Do:
- **Do** keep the hound mark and the GYMHOUND wordmark on one line at every width, the wordmark at a fixed 38px. Use the owner's mark files; never redraw the dog.
- **Do** use the theme tokens from `src/ui/theme.ts` for every colour, in both themes.
- **Do** set numbers in Barlow Condensed with tabular figures, and sentences in Inter.
- **Do** keep every target at least 44pt, counting a compact pill's 4pt hit slop.
- **Do** let rows wrap at large text: trailing groups drop to their own line together, then wrap among themselves.
- **Do** keep suggestions faint and dashed, and entered values bold and solid.

### Don't:
- **Don't** use red #E10600 for anything but the wordmark, the active tab and PR marks.
- **Don't** add shadows, gradients or glass; move a tonal step instead.
- **Don't** use textFaint for anything but suggested set values, or borderStrong for anything but set-field edges, compact pill outlines and a switch's off track.
- **Don't** put the footer on the session or the finish summary, or the hound in the footer.
- **Don't** add motivational quotes, flames or skulls.
- **Don't** truncate a row's text at large text sizes when it can wrap.
