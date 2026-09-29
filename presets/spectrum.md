---
name: Spectrum
description: Adobe's Spectrum light theme (desktop scale) — neutral machine-gray surfaces, a confident blue, light-weight headings, and 2-8px radii for content-heavy tools.
colors:
  primary: "#0265DC"
  on-primary: "#FFFFFF"
  secondary: "#6D6D6D"
  on-secondary: "#FFFFFF"
  background: "#E6E6E6"
  on-background: "#222222"
  surface: "#FFFFFF"
  on-surface: "#222222"
  surface-variant: "#F8F8F8"
  on-surface-variant: "#464646"
  outline: "#D5D5D5"
  error: "#D31510"
  on-error: "#FFFFFF"
  success: "#007A4D"
  on-success: "#FFFFFF"
  warning: "#B14C00"
  on-warning: "#FFFFFF"
typography:
  display:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 45px
    fontWeight: 300
    lineHeight: 52px
  h1:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 36px
    fontWeight: 300
    lineHeight: 42px
  h2:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 28px
    fontWeight: 300
    lineHeight: 32px
  h3:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 22px
    fontWeight: 300
    lineHeight: 26px
  body-lg:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 22px
  body-md:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 18px
  body-sm:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  label:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 18px
  caption:
    fontFamily: "\"Source Sans 3\", \"Adobe Clean\", sans-serif"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 14px
  code:
    fontFamily: "\"Source Code Pro\", monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 18px
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
  sm: "0 1px 4px rgba(0,0,0,0.15)"
  md: "0 1px 4px rgba(0,0,0,0.15)"
  lg: "0 1px 4px rgba(0,0,0,0.15)"
motion:
  duration:
    fast: 130ms
    normal: 190ms
    slow: 300ms
  easing:
    standard: cubic-bezier(0.45, 0, 0.4, 1)
    enter: cubic-bezier(0, 0, 0.4, 1)
    exit: cubic-bezier(0.5, 0, 1, 1)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 14px"
    height: 32px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    border: "1px solid {colors.outline}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 14px"
    height: 32px
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
    border: "1px solid {colors.outline}"
    borderColor: "{colors.outline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    height: 32px
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
    rounded: "{rounded.md}"
    padding: "0 9px"
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.md}"
    padding: "16px"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    rounded: "{rounded.md}"
    padding: "0 9px"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.md}"
    padding: "0 9px"
---

## Overview

Based on Spectrum by Adobe (Apache-2.0, https://spectrum.adobe.com). Unofficial adaptation; not affiliated with or endorsed by Adobe. Token values come from the official `@adobe/spectrum-tokens` package (color-palette, semantic-color-palette, color-aliases, layout, typography), light theme, desktop scale. Adobe's proprietary Adobe Clean is not freely licensed, so text is set in Source Sans 3 while `code` keeps the system's own Source Code Pro — both from Google Fonts. Spectrum suits creative and media tools: content-heavy editors, asset managers, and professional panels with dense controls.

## Colors

- `primary` is `accent-background-color-default` (light theme: blue-900 #0265DC); `on-primary` is white, the accent-content pairing.
- `secondary` is `neutral-subdued-background-color-default` (gray-600 #6D6D6D) with white content, Spectrum's subdued neutral action.
- Layering follows the background aliases: `background` = `background-base-color` (gray-200 #E6E6E6 canvas), `surface` = `background-layer-2-color` (gray-50 white cards), `surface-variant` = `background-layer-1-color` (gray-100 #F8F8F8) with `neutral-subdued-content-color-default` (#464646); `outline` is the gray-300 default border (#D5D5D5).
- Status fills are the light-theme visual colors: `error` = negative-900 (#D31510), `success` = positive-900 (#007A4D), `warning` = notice-900 (#B14C00) — all pass AA with white, no adaptation needed.

## Typography

- The ramp pairs the official font-size and line-height tokens: font-size-1100/900/700/500 → `display`/`h1`/`h2`/`h3`, all Light (300) as Spectrum headings are.
- body sizes 300/100/75 map to `body-lg`/`body-md`/`body-sm` (18/14/12px with their matched line heights); `label` is the `component-m-medium` style (14px/18px, medium 500).
- `caption` is the 11px detail size (font-size-50); `code` is Source Code Pro at the body-medium size, per the system's `code-font-family`.
- Spectrum defines a single `letter-spacing` token of 0em, so no tracking is set.

## Layout

- Spacing uses the official layout scale: spacing-50 through spacing-500 (2/4/8/12/16/24/32px).
- Desktop component metrics: medium controls are 32px tall (`component-height-100`), fields 32px, textfields padded 6px top / 12px sides (`component-top-to-text-100`, `component-edge-to-text-100`).
- Compact chrome for dense tools: 2px micro-spacing, 4px control gaps, generous 24–32px only between panels.

## Elevation & Depth

- Spectrum defines one drop-shadow recipe — x 0, y 1, blur 4 with `drop-shadow-color` (black at 15%) — so `sm`/`md`/`lg` all use it; depth comes mainly from the gray layering system instead.
- Surfaces stack light-on-dark: gray-200 canvas, gray-100/gray-50 layers, white cards with a 1px gray-300 border.
- Overlaid elements (popovers, dialogs) also pick up the border plus this shadow.

## Motion

- Durations map to the Spectrum animation scale: duration-100 (130ms) → fast, duration-300 (190ms) → normal, duration-600 (300ms) → slow.
- `standard` is `--spectrum-animation-ease-in-out` (`cubic-bezier(0.45, 0, 0.4, 1)`); `enter` is ease-out, `exit` is ease-in.
- Motion should never block interaction — most transitions land under 200ms.
- Reduced motion: with `prefers-reduced-motion: reduce`, drop transforms and keep opacity fades at fast duration (130ms) or shorter.

## Shapes

- Corner radii (spectrum scale, desktop): radius-75 2px, radius-100 4px, radius-200 8px; `xl` is 16px — the computed pill radius of medium buttons (height ÷ 2); `full` is 9999px.
- Buttons are pills (`calc(height/2)`); text fields, cards, and tags use corner-radius-100 (4px).
- Focus is a 2px blue indicator (`focus-indicator-color` #147AF3) with a 2px gap.

## Components

- **button-primary**: accent fill, white medium label, pill radius, 32px tall with 14px inline padding (`component-pill-edge-to-text-100` minus the 2px border width).
- **button-secondary**: subdued gray-600 fill with a 1px gray-300 border.
- **input**: 32px text field on white with a 1px gray-300 border, 4px radius, 14px/18px text.
- **card**: white (gray-50) surface, 4px radius, the single drop shadow.
- **chip**: a Spectrum tag — gray-100 surface, gray-700 detail text (11px), 4px radius, 9px inline padding, 24px tall.
- **alert-error / badge-success / badge-warning**: solid visual colors with white text, all AA-compliant.

## Do's and Don'ts

**Do**:
- Use Light (300) headings and medium (500) labels against regular body text.
- Keep the machine-gray neutral system; reserve blue for interactive elements.
- Build hierarchy with surface layers (gray-200 → gray-100 → white) before shadow.
- Keep controls compact and aligned to the 32px control height.

**Don't**:
- Don't use Adobe Clean or other proprietary fonts in shipped code — substitute Source Sans 3 as done here.
- Don't apply multiple shadow strengths; Spectrum has one.
- Don't round text fields beyond corner-radius-100 (4px).
- Don't let animations exceed ~300ms or use springy curves.
