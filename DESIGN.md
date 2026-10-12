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
- **Wordmark Red** (wordmark-red): the GYMHOUND wordmark in the header, the focused dock tab's icon and label, and PR marks: the "PR" mark on each personal best row of the finish summary, and the personal best card's GYMHOUND and PERSONAL BEST. Nothing else, including errors, warnings, flags, destructive actions, the Share pill and the chart.

### Neutral
- **Iron Black / Chalk Paper** (bg-dark / bg-light): the page, the header, the dock and the session header.
- **Rubber Mat / Clean Sheet** (surface-dark / surface-light): cards, sheets, the rest row, entered set fields and the selected bar choice.
- **Raised Plate / Warm Stone** (surface-raised-dark / surface-raised-light): segmented-control wells, the done-set tint, the docked rest and music bars, and the track under a 3pt progress bar (macro bars, water).
- **Seam** (border-dark / border-light): card, sheet and dock edges, the set-number chip, regular secondary buttons.
- **Strong Seam** (border-strong-dark / border-strong-light): set-field edges, compact pill outlines, the rest row's edge, the Short on food banner's bottom edge and the off track of a switch only: the edges a control or a passing prompt needs to be seen at all. It holds 3:1 on bg, surface and surfaceRaised.
- **Chalk / Ink** (text-dark / text-light): text, primary-button fill, tick fill, the progress line, the superset bar, the selected segment, the fill of the macro and water bars, the paywall's checkmarks.
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
- **Label** (Inter 600, 14px, 0.5 tracking, muted; `Label` in src/ui/Text.tsx): the state label on Train's cards (UP NEXT, IN PROGRESS) and the group headings on Settings and Routines. It renders its words in upper case: the source says "Premade" or "Rest timer" and the screen shows PREMADE or REST TIMER (APPEARANCE, UNITS, BAR, PLATES, PROGRESSION, REST TIMER, FUEL, BACKUPS, EXPORT, GYMHOUND PRO on Settings; BODY and MEASUREMENTS on Stats; WATER, SET YOUR TARGETS, CALORIES LEFT, PROTEIN LEFT, FOOD and TRENDS on Fuel; RECENT on Add food; TRAINING DAY and REST DAY on Targets; SAVED WORKOUTS on Routines; PERSONAL BESTS on the finish summary). Every Label is a VoiceOver heading, so a screen-reader user can jump group to group; VoiceOver reads the words as written, not spelled out.
- **Column label** (Inter 600, 10px, 0.3 tracking, upper case, muted): the set table's column headers; the rest row's REST label is the same role at 11px.
- **Chart label** (Inter 400, 12px, muted, tabular figures): a line chart's y labels and the dates under its axis. The one place numbers are not in Barlow, as R116 sets them: the labels are the chart's scaffolding, quieter than the values a screen shows in Barlow beside it.

### Named Rules
**The Text-Size Rule.** All text follows the phone's text size except the wordmark (fixed), the session header's name, progress line and Finish label (capped at 1.3x so the header stays one row), the body number field (capped at 1.5x so "182.5" stays whole) and the personal best card (an image, so every text on it is fixed). Rows wrap instead of capping or truncating.

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

Softly squared. Cards and sheets take 16px corners; regular buttons and segmented wells 12px; rows that tint (a done set, the rest row) 10px; selected segments 9px so they nest inside a 12px well with 4px padding; set fields and the set-number chip 8px. Compact pills are fully rounded (18px on a 36px height). The tick is a 40px circle, and the header's Settings button a 40px circle. A superset is a 3px bar in the text colour running down the left edge of its members, the only straight-edged accent in the system. Its first block carries a quiet muted "Superset" label (Inter 500, 13px) above the name, beside the bar, so the bar is never the only sign (R100).

## Components

### Buttons
Plain, confident and quiet about it.
- **Shape:** gently rounded rectangle (12px) at 48pt, or a full pill (18px) at 36pt for compact.
- **Primary:** filled with the text colour, labelled in the background colour, Inter 600 16px, 20px side padding. One per sheet or card.
- **Secondary:** transparent with a 1px border (Seam at regular size, Strong Seam at compact size), labelled in the text colour.
- **Quiet:** no chrome, label only (+ Set, + Warmup, Discard workout). The session's + Set / + Warmup row steps back by the buttons' 12px padding so "+ Set" lines up with the set column; Discard workout stays centred.
- **Compact for a row's own action:** an action that belongs to one row of a list (Set active on a routine, the rest pills, Finish in the session header) is a compact secondary pill; full-size buttons are for a card's or a sheet's main answers.
- **A state is not a button:** a row's current state (the routine in use) is a text-colour checkmark and a word, with no edge or fill.
- **Pressed / disabled:** pressed drops opacity to 0.8; disabled to 0.4 and ignores presses.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** surface, with a 1px Seam border.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Internal Padding:** 16px.

### Segmented control
A well in surfaceRaised (12px corners, 4px padding, 4px gaps) holding 44pt segments; the chosen segment is filled with the text colour and labelled in the background colour. Used for Appearance, units, bell sound, bell volume, (wrapping in rows of three) rest length, the default increment on Settings → Progression, a body chart's range: 3M, 1Y and All, under the chart, read as "3M, last 3 months" and so on, and from phase 5 Search / Quick add on Add food and the Fuel trends' two controls.
- **Fuel trends** use their own ranges, **1M** (default), **3M** and **1Y**, under the chart, read "1M, last month", "3M, last 3 months", "1Y, last year"; the measure control above the chart (Calories, Protein, Carbs, Fat) is laid out by measured width: four in a row when the longest word fits each segment, else two, else one, so a word never breaks. An empty range says "Nothing logged in this range." (a body chart says "No entries in this range.").
- **Body charts** keep 3M (default), 1Y and All.
- Three copies of the control exist (Settings, Add food, Fuel trends) with the same look; merging them is an open minor (spec §18.10).

### Switch
The platform switch, themed (`switchColors`, R131, R171): on, a text-colour track under a background-colour thumb; off, a Strong Seam track (on iOS through its background colour too) under a text-colour thumb, so on and off never look alike in either theme (Round 7: one dark thumb on both made on hard to tell in dark mode). The thumb takes its state's colour in the browser build too (react-native-web would otherwise turn an on thumb teal). Never red. Its row is 44pt tall with the setting's name on the left.

### Settings groups
Each group is an upper-case Label heading 8pt over its items; items sit 16pt apart; a field is its name 8pt over its control; groups are 32pt apart, the first 24pt under the title. Helper lines ("Used by the plate calculator.") are muted.

### Inputs / Fields
- **Suggested set field:** no fill, 1px dashed Strong Seam edge, Ghost text in Barlow 600 at 20px. A suggestion never looks like a value.
- **Entered set field:** surface fill, 1px solid Strong Seam edge, text in Barlow 800 at 20px.
- **Invalid:** a 2px muted bottom edge and the line "Check this number" above the row. Never red.
- **Needed (a tick tapped before it was ready):** the field it asks for takes the same 2px muted bottom edge, and the line ("Add a weight to tick") sits above the row in the text colour at body size, led by an alert-circle-outline icon inside the text. The tap buzzes a warning and focuses nothing, so the keyboard stays down and the person taps the field (R99). "Check this number" draws the same way. Never red.
- **Body number field** (Stats and the body screens): a surface field with a 1px Strong Seam edge and 8px corners, at least 112pt wide and 44pt tall, the number centred in Barlow 700 at 20px with tabular figures, followed by its unit in muted body text. A number out of bounds takes the invalid field's 2px muted bottom edge, with "Check this number" muted under the row. Never red.
- **Focus:** the platform caret and keyboard; fields keep returnKeyType "done".

### Navigation
- **Header:** the hound mark (48px) and the red GYMHOUND wordmark on one line, 10px apart, with a 40px round Settings button (Close on Settings) on the right.
- **Dock:** four tabs (Train, History, Stats, Fuel), 56pt tall, icon over a 12px Inter 600 label; the focused tab is red, the rest muted.
- **Session header:** back chevron, the workout name with its progress and time under it, Music on a phone, and a compact Finish pill; a 2px text-colour line along the bottom fills with the share of sets ticked.

### The tick (signature)
A 40px circle in a 44pt column. Open, it is a 1.5px muted ring; on the next set to do it is a 2.5px ring in the text colour; while not ready the ring is dashed. Done, it fills with the text colour and shows a background-colour checkmark, and the row behind it tints surfaceRaised.

### The exercise name row (signature)
The exercise name (Barlow 700, 22px) with ⋯ alone at the right edge, a 44pt box centred on the name's first line and over the tick column. The count, + Note and Something off are one quiet group that follows the name: beside it when both fit, otherwise under it as a 24pt line left-aligned with the name. + Note and Something off are a 14px muted icon and 14px muted words with a 10pt hit slop above and below (44pt targets) and 6pt to the sides (half the 12pt gap), so the dropped line costs 26pt instead of a 44pt row; the whole header is 53pt on a phone. Flagged, Something off shows its reason, still muted. The name ends in a 16px muted ⓘ inside its text (joined by a no-break space), the same glyph as the picker's info button, so it reads as "this opens the form demo" and wraps and scales with the last word. At large text the name wraps, the group wraps among itself 20pt apart, and words wrap rather than truncate. Whatever is drawn under the row (the saved note line, the note field, the rule line) starts 10pt down, clear of the hit slop: drawn later, it would otherwise win the hit test where they overlap.

### The rest row (signature)
Under the set that started it: a surface panel with a Strong Seam edge, a REST label over a Barlow 800 countdown, then −15s, +15s and Skip as compact pills, over a 3px text-colour track that drains with the time left. At zero it holds a check and "Rest's up" at the same height.

### Personal bests (finish summary)
After the next-time lines, across a Seam hairline 16pt above: a PERSONAL BESTS Label, then one row per personal best. A row is a red "PR" (Barlow 800, 14px), 8pt before the line in body text ("Bench press — heaviest: 185 lb × 5"), baseline-aligned; the mark and the line are one element read as "Personal best. {line}". On a phone that can share, a compact secondary **Share** pill ends the row, 12pt after the line, and drops under it as a unit at large text. Rows are 8pt apart. A failed share puts "Couldn't make the image. Try again." in muted body text 4pt under its row. The pill is never red; only the mark is.

### The personal best card
The image Share makes (R106): 360 × 450 points, captured at 1080 × 1350. It is **always dark** (bg-dark, text-dark, text-muted-dark), whatever the app's theme, because a shared image has no theme, and every text is a **fixed size**. 28px padding all round. Top: the header lockup, the owner's dark hound mark image (`mark-dark.png`, 48px, never redrawn) 10px from GYMHOUND in red (Barlow 800, 38px, -0.5 tracking). Centred in the space under it: PERSONAL BEST in red (Barlow 800, 22px, 1 tracking), the exercise name (Barlow 700, 32px, up to two lines), the value (Barlow 800, 64px, tabular, one line, shrinking to fit) and the caption (Inter 400, 18px, muted). At the bottom the day in muted Barlow 700 at 20px ("SUN 11 OCT 2026"). No footer, no quote, no other red.

### The line chart
Hand-drawn SVG (R116), never red. A 2px line in the text colour with round joins, a dot at each point (r = 2, filled with the text colour), and a 1px border-colour grid line at each y tick. The y labels sit on the left in the chart label style (Inter 12px, muted, tabular), centred on their ticks and taking at most 30% of the width; the first and last dates sit under the axis in the same style (one date centred when there is one day). The plot is 180pt tall by default. One point is a dot only; with nothing in the range the screen says "No entries in this range." in muted body text instead. Under a body or lift chart, 12pt below it, the change across the range shown in muted body text (R175): "Down 2 cm since Aug 3.", "Up 1.5 kg since 12 Jul." or "No change since 3 Aug." (none with fewer than two points). The range control (3M, 1Y, All) is a segmented control 12pt under that line (under the chart when there is no line). The whole chart is one image element that reads the series in words.

Marked points (phase 6, R173, R191), on a lift's chart: a session with something off is a **hollow** point, a ring (r = 3.5) with a 1.5px text-colour stroke filled with the colour behind the chart (the card's surface by default), never red. A point may carry a **mark label** (its reason, such as "Rough sleep", or "Stall") in the chart label style, centred over its dot with its bottom 6pt above it and kept inside the plot; when any label is placed the plot keeps one label line clear above the top tick. Labels are placed newest first: one is skipped when its dot is within 56pt of a placed label's dot or when its measured span comes within 8pt of a placed label's span. A skipped label still shows in the lift's Sessions list and in the chart's spoken label ("2 sessions marked. Stall from 3 Oct."). Body charts have no marked points. On Fuel the chart sits in a Trends card, with "Average 2,140 kcal a day over 24 logged days." in muted body text under it (R160), not a drawn average line, and no target line.

### Fuel (phase 5)
Nothing on Fuel is red: not "over", not water, not the pitch.
- **Day header:** Display "Fuel", then a row of a 44pt **‹**, the day in Display (Barlow 700, 28px; "Today", "Yesterday", "Sat, Oct 10") centred and taking the rest of the row, and a 44pt **›**. The arrows are Barlow 700 at 32px; › on today is drawn at 0.3 opacity and ignores presses; pressed drops to 0.6. Under it, 2pt down, muted body "Training day" or "Rest day" when targets apply.
- **Water card:** a card (surface, Seam edge, 16px corners and padding, 12pt gaps) with the WATER Label; the total in Barlow (number style) followed by muted body " of 2,000 ml" when a goal is set, over a 3pt progress bar (text-colour fill on a surfaceRaised track, square ends, capped full); without a goal a quiet **Set a daily goal** under the total. Then a wrapping row of compact secondary pills, "+250 ml", "+500 ml" (or "+8 fl oz", "+16 fl oz") and **Other**, 8pt apart; then a quiet **Entries ›**. Quiet buttons step back by their 20px padding so their words line up with the card's text.
- **Summary:** exactly two numbers side by side, each Barlow at 44px over its Label (CALORIES LEFT, PROTEIN LEFT), 4pt apart, each at least 120pt wide, 16pt between them; they sit side by side down to a 320pt screen at default text and wrap only at large text. Each pair is one VoiceOver element ("Protein left, 86 grams"). Past a target the value reads "120 over" / "12 g over" in the same colour. Under them, muted body "Target: 2,400 kcal · 180 g protein" (the day header already says Training day or Rest day).
- **Macro bars:** one per macro with a target, 12pt apart: body "Protein 94 / 180 g" 6pt over a 3pt bar, text-colour fill on a surfaceRaised track, capped full (never past it, never red). A macro without a target is one muted line, "Carbs 210 g · Fat 64 g". Each bar is one VoiceOver element ("Protein 94 of 180 grams").
- **Entries:** the FOOD Label; rows of at least 44pt that wrap: the name in body strong, a muted line "1.5 × 1 scoop · 180 kcal · 36 g protein", then a smaller muted line (14px) "Carbs 12 g · Fat 3 g"; a muted total row across a Seam hairline. Filled **Add food** over secondary **Quick add**; a quiet **Targets ›** at the end.
- **Setup card:** a card with the SET YOUR TARGETS Label, one body sentence and the targets form with a filled **Save targets**.
- **Add food:** a modal with a quiet **Done** at the top right of the Display title, the muted "Logging for …" line ("Logging for today"), the Search / Quick add segmented control, the search field, Label RECENT and food rows (body strong name, a 14px muted line ending " · Yours" for your own); "Added {name}." in body strong under the segmented control after each add.

### Short on food banner (session)
A slim prompt directly under the session header, outside the scrolling list, the full width of the screen: a **surface** row with a 1px **borderStrong** bottom edge (the one prompt that takes Strong Seam, so it reads as separate from the header without a shadow or a colour), content capped at 512px and centred, 16pt left and 4pt right padding, 4pt top and bottom (the header above already clears the safe area). The line, "Protein is behind today. Mark this session Short on food?", is body at 15px; at its right a compact filled **Mark it** pill and a 44pt × (a 22px close icon in the text colour, VoiceOver "Dismiss"), 8pt apart. The line wants 150pt × the text scale, so at large text the buttons wrap under it as a unit, right-aligned. Never red.

### Paywall and the Pro pitch
- **Full screen** (`/paywall`): the bg colour edge to edge, no header, dock or footer; the content scrolls inside the safe area, capped at 512px and centred, 16pt gutters, 32pt from the top.
- **Pitch** (the same component on the paywall and inside a locked Fuel tab), 16pt gaps: Display "GymHound Pro"; two rows 12pt apart, each a 20px checkmark in the text colour 12pt before a body-strong line that wraps; the free list in muted body; then, 8pt down and 8pt apart, a filled **Unlock**, the store's price in muted body centred under it ("$4.99 a month", "$24.99 once"), the renewal line in muted body for a subscription, any "Purchases aren't available in this build." / "The store isn't answering. Try again later." line, secondary **Restore purchases**, secondary **Not now** (full screen only) and the result line in muted body. **Terms of use** and **Privacy policy**, when the build has them, are 44pt-tall muted underlined links in a wrapping row, 16pt apart. No red, no image, no price the store didn't give.
- **Pro already on:** Display "GymHound Pro", body "Pro is on." and a filled **Done**.

### Choice chips and radio rows (exercise editor)
Choices take the shape that says how many can be picked. Primary muscles, secondary muscles and equipment are compact pills (36pt, 4pt hit slop) that wrap 8pt apart: unchosen a secondary pill, chosen filled with the text colour and labelled in the background colour, as in the picker. Muscles allow many; equipment allows one, and a new exercise starts with none chosen (R128). Logging, a single choice of six, is a column of 44pt radio rows: a 22px radio mark (filled in the text colour when chosen, an open muted ring when not) 12pt before the label, which wraps. Once the exercise is in use the rows give way to the type in body strong over the muted line "It's in use, so this stays." What stops Save is listed in muted lines over it, never red.

## Do's and Don'ts

### Do:
- **Do** keep the hound mark and the GYMHOUND wordmark on one line at every width, the wordmark at a fixed 38px. Use the owner's mark files; never redraw the dog.
- **Do** use the theme tokens from `src/ui/theme.ts` for every colour, in both themes.
- **Do** set numbers in Barlow Condensed with tabular figures, and sentences in Inter. A chart's axis labels are the one exception (Inter 12, R116).
- **Do** keep every target at least 44pt, counting a compact pill's 4pt hit slop.
- **Do** let rows wrap at large text: trailing groups drop to their own line together, then wrap among themselves.
- **Do** keep suggestions faint and dashed, and entered values bold and solid.

### Don't:
- **Don't** use red #E10600 for anything but the wordmark, the active tab and PR marks.
- **Don't** add shadows, gradients or glass; move a tonal step instead.
- **Don't** use textFaint for anything but suggested set values, or borderStrong for anything but set-field edges, compact pill outlines, the rest row's edge, the Short on food banner's edge and a switch's off track.
- **Don't** put red on Fuel, water, "over" values or the paywall, or the footer on the paywall, Add food or a food editor.
- **Don't** put the footer on the session or the finish summary, or the hound in the footer.
- **Don't** put a footer, a quote or the light palette on the personal best card.
- **Don't** add motivational quotes, flames or skulls.
- **Don't** truncate a row's text at large text sizes when it can wrap.
