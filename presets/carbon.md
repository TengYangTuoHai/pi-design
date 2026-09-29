---
name: Carbon
description: IBM's Carbon Design System white theme — productive, square-cornered, data-dense layouts with IBM Plex typography and a single disciplined blue.
colors:
  primary: "#0F62FE"
  on-primary: "#FFFFFF"
  secondary: "#393939"
  on-secondary: "#FFFFFF"
  background: "#FFFFFF"
  on-background: "#161616"
  surface: "#F4F4F4"
  on-surface: "#161616"
  surface-variant: "#E0E0E0"
  on-surface-variant: "#525252"
  outline: "#8D8D8D"
  error: "#DA1E28"
  on-error: "#FFFFFF"
  success: "#198038"
  on-success: "#FFFFFF"
  warning: "#F1C21B"
  on-warning: "#161616"
typography:
  display:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 42px
    fontWeight: 300
    lineHeight: 50px
  h1:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 400
    lineHeight: 40px
  h2:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 36px
  h3:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 28px
  body-lg:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0.16px
  body-sm:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.32px
  label:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0.16px
  caption:
    fontFamily: "\"IBM Plex Sans\", system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.32px
  code:
    fontFamily: "\"IBM Plex Mono\", Menlo, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.32px
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 8px
  xl: 16px
  full: 9999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
elevation:
  sm: "0 2px 6px rgba(0,0,0,0.3)"
  md: "0 2px 6px rgba(0,0,0,0.3)"
  lg: "0 2px 6px rgba(0,0,0,0.3)"
motion:
  duration:
    fast: 110ms
    normal: 150ms
    slow: 400ms
  easing:
    standard: cubic-bezier(0.2, 0, 0.38, 0.9)
    enter: cubic-bezier(0, 0, 0.38, 0.9)
    exit: cubic-bezier(0.2, 0, 1, 0.9)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "11px 15px"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    border: "1px solid {colors.outline}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "11px 15px"
    height: 48px
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
    border: "1px solid {colors.outline}"
    borderColor: "{colors.outline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: 40px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "16px"
    shadow: "{elevation.sm}"
  chip:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.caption}"
    rounded: "{rounded.xl}"
    padding: "0 8px"
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.none}"
    padding: "16px"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    rounded: "{rounded.xl}"
    padding: "0 8px"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.xl}"
    padding: "0 8px"
---

## Overview

Based on Carbon by IBM (Apache-2.0, https://carbondesignsystem.com). Unofficial adaptation; not affiliated with or endorsed by IBM. Token values come from the Carbon `white` theme (v11+ token set), `@carbon/type`, `@carbon/layout`, and `@carbon/motion`. Fonts are IBM Plex Sans and IBM Plex Mono from Google Fonts — the system's own open typefaces. Carbon suits data-dense enterprise products: analytics consoles, admin dashboards, and complex workflow tools where efficiency beats decoration.

## Colors

- `primary` is the white theme's button-primary/interactive blue (`blue-60` #0F62FE); `on-primary` is `text-on-color` (white).
- `secondary` is `button-secondary` (`gray-80` #393939) with white content, matching the actual Carbon secondary button.
- Layering: `background` = `white` (layer background), `surface` = `layer-01` (`gray-10` #F4F4F4), `surface-variant` = `layer-accent-01` (`gray-20` #E0E0E0) with `text-secondary` (#525252).
- `outline` is `border-strong` (`gray-50` #8D8D8D) — the color Carbon uses for input borders.
- `error` is `support-error` (`red-60` #DA1E28); `warning` is `support-warning` (`yellow-30` #F1C21B) — **(adapted)** Carbon sets primary text on yellow, so `on-warning` is `text-primary` (`gray-100` #161616) instead of `text-on-color` (white), which would fail AA.
- **(adapted for AA)** `success` steps `support-success` down one ramp position, from `green-50` (#24A148) to `green-60` (#198038), because white text on `green-50` is 3.35:1.

## Typography

- The ramp uses `@carbon/type` styles: display01 → `display` (42px, light 300), productive-heading-05/04/03 → `h1`–`h3`.
- body-long-02 → `body-lg`, body-compact-01 → `body-md` (14px/18px, +0.16px tracking), label-01 → `body-sm` and caption-01 → `caption` (12px, +0.32px tracking).
- `label` is label-02 (14px) — the size Carbon buttons and form labels use.
- `code` is code-02: IBM Plex Mono at 14px/20px. Line heights are the official multipliers converted to px (e.g. 28 × 1.28572 ≈ 36px).

## Layout

- Spacing is the official `@carbon/layout` mini-unit scale: spacing-01 through spacing-07 (2/4/8/12/16/24/32px).
- Components sit on a square grid: buttons are 48px tall, inputs 40px (field `md` size), tags 24px.
- Dense, information-first layouts: 2px micro-spacing for packed elements, 16px inside panels, 24–32px between sections.

## Elevation & Depth

- Carbon defines exactly one box-shadow token — the utility `box-shadow: 0 2px 6px $shadow` — so `sm`, `md`, and `lg` all map to it (there are no graduated elevation steps in the system).
- Depth is communicated by layering instead: gray-10/gray-20 surfaces and 1px `border-strong`/`border-subtle` dividers.
- Use shadow only for true overlays (toasts, dropdowns).

## Motion

- Durations map to `@carbon/motion`: fast-02 (110ms) → fast, moderate-01 (150ms, the documented default) → normal, slow-01 (400ms) → slow.
- Easing uses the productive family: standard-productive, entrance-productive, exit-productive (`cubic-bezier(0.2, 0, 0.38, 0.9)` and siblings).
- Motion is purposeful and quick — micro-interactions stay under 150ms.
- Reduced motion: with `prefers-reduced-motion: reduce`, drop transforms and keep opacity fades at the fast duration (110ms) or shorter.

## Shapes

- Carbon is deliberately square: `corner-radius` maps none 0, radius-02 2px, radius-04 4px, radius-08 8px, radius-16 16px, full 9999px (the standard pill; the token file's `border-radius-max` is 999999px).
- Buttons keep `border-radius: 0`; inputs, tiles, and cards use radius-04 (4px); tags are 16px pills.
- Focus is a 2px blue outline (`focus` = blue-60) — never remove it.

## Components

- **button-primary**: 48px tall, square corners, 14px label, 2px border discipline — the signature Carbon control.
- **button-secondary**: gray-80 fill with white text, framed by a 1px strong border per the standard token set.
- **input**: 40px field on white with a 1px `border-strong` bottom/side border, 4px radius, body-compact text.
- **card**: gray-10 layer surface with 4px corners and the single Carbon shadow.
- **chip**: the Carbon tag — gray-20 accent layer, gray-100 text, label-01 type, 16px pill radius, 24px tall.
- **alert-error / badge-success / badge-warning**: solid support colors with white text (yellow uses primary text per Carbon's own pairing).

## Do's and Don'ts

**Do**:
- Keep 14px as the workhorse size; use 12px only for labels and helper text.
- Use the layer grays (#F4F4F4, #E0E0E0) to build hierarchy before reaching for shadow.
- Preserve the 2px focus ring and 1px strong borders on interactive elements.
- Keep motion under 150ms for control feedback.

**Don't**:
- Don't round corners decoratively — Carbon is square by design.
- Don't introduce a second accent; interactive blue #0F62FE is the only action color.
- Don't use white text on yellow — Carbon itself uses gray-100 there.
- Don't cram long paragraphs into body-compact; use body-long styles for reading.
