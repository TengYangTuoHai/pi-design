---
name: Primer
description: GitHub's Primer design system light mode — calm gray canvas, accent blue, utilitarian system type, and pill counters on 6px controls.
colors:
  primary: "#0969DA"
  on-primary: "#FFFFFF"
  secondary: "#59636E"
  on-secondary: "#FFFFFF"
  background: "#FFFFFF"
  on-background: "#1F2328"
  surface: "#F6F8FA"
  on-surface: "#1F2328"
  surface-variant: "#EFF2F5"
  on-surface-variant: "#59636E"
  outline: "#D1D9E0"
  error: "#CF222E"
  on-error: "#FFFFFF"
  success: "#1A7F37"
  on-success: "#FFFFFF"
  warning: "#9A6700"
  on-warning: "#FFFFFF"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 40px
    fontWeight: 500
    lineHeight: 55px
  h1:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 48px
  h2:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 32.5px
  h3:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  body-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 19.5px
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 21px
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Noto Sans\", Helvetica, Arial, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 15px
  code:
    fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 19.5px
rounded:
  none: 0px
  sm: 3px
  md: 6px
  lg: 12px
  xl: 12px
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
  sm: "0px 1px 1px 0px rgba(31,35,40,0.05)"
  md: "0px 1px 1px 0px rgba(31,35,40,0.04), 0px 1px 2px 0px rgba(31,35,40,0.03)"
  lg: "0px 1px 1px 0px rgba(31,35,40,0.1), 0px 3px 6px 0px rgba(31,35,40,0.12)"
motion:
  duration:
    fast: 100ms
    normal: 200ms
    slow: 300ms
  easing:
    standard: cubic-bezier(0.25, 0.1, 0.25, 1)
    enter: cubic-bezier(0.3, 0.8, 0.6, 1)
    exit: cubic-bezier(0.7, 0.1, 0.75, 0.9)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: 32px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    border: "1px solid {colors.outline}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: 32px
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
    border: "1px solid {colors.outline}"
    borderColor: "{colors.outline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: 32px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
    shadow: "{elevation.sm}"
  chip:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.md}"
    padding: "16px"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.full}"
    padding: "0 6px"
---

## Overview

Based on Primer by GitHub (MIT, https://primer.style). Unofficial adaptation; not affiliated with or endorsed by GitHub. Values come from Primer Primitives' light functional tokens (`fgColor`, `bgColor`, `borderColor`, `control`, typography, size, spacing, shadow, motion). Fonts are the system stacks the system prescribes — the Primer system stack for text and the ui-monospace stack for code — so nothing is bundled (no Google Fonts file). Primer suits developer products: code-centric UIs, documentation sites, issue trackers, and dashboards that value quiet density.

## Colors

- `primary` is `bgColor.accent.emphasis` (blue.5 #0969DA) — the emphasis fill Primer uses for primary actions and selected controls; `on-primary` is `fgColor.onEmphasis` (white).
- `secondary` is `bgColor.neutral.emphasis` (neutral.9 #59636E) with white content, the neutral-emphasis pairing.
- Neutrals: `background` = `bgColor.default` (white), `surface` = `bgColor.muted` (#F6F8FA), `surface-variant` = `bgColor.disabled` (#EFF2F5) with `fgColor.muted` (#59636E); `outline` is `borderColor.default` (#D1D9E0).
- Status roles are the emphasis tokens: `error` = `bgColor.danger.emphasis` (#CF222E), `success` = `bgColor.success.emphasis` (#1A7F37), `warning` = `bgColor.attention.emphasis` (#9A6700) — all pass AA with `fgColor.onEmphasis` white, no adaptation needed.

## Typography

- The ramp is Primer's text scale: display (40px medium), title large/medium/small → `h1`/`h2`/`h3` (semibold 600), body large/medium/small → `body-lg`/`body-md`/`body-sm`.
- Line heights are the official unitless multipliers converted to px (e.g. 20px × 1.625 = 32.5px).
- `label` is the body-medium size at medium (500) weight — how Primer buttons set their labels; `caption` is text.caption (12px, tight).
- `code` uses the monospace stack at the codeBlock size (13px). Primer defines no letter-spacing tokens, so none are set.

## Layout

- Spacing follows the `space` scale (base size steps 2/4/8/12/16/24) plus the next step (32px) for `xxl`.
- Controls are compact: 32px medium controls with 12px inline padding (`control.medium`), minimum touch target 44px on coarse pointers.
- Radii stay small — 3px inputs, 6px buttons (`borderRadius.medium`), 12px overlays — with `borderRadius.full` (9999px) for counters and labels.

## Elevation & Depth

- Shadows use Primer's resting series: xsmall → `sm`, small → `md`, medium → `lg`, built from `base.color.neutral.13` (#1F2328) at 3–12% alpha.
- Depth is subtle by design; cards usually rely on a 1px `borderColor.default` border plus the faint resting shadow.
- Overlays (menus, dialogs) switch to border-based separation rather than heavy shadow.

## Motion

- Durations map to the motion scale: micro (100ms) → fast, short (200ms) → normal, medium (300ms) → slow.
- `enter` is `base.easing.easeOut`, `exit` is `base.easing.easeIn`, and `standard` is `ease` — used for hovers and general transitions.
- Keep hovers at micro duration; reserve medium for expanding panels.
- Reduced motion: with `prefers-reduced-motion: reduce`, drop transforms and keep opacity fades at fast duration (100ms) or shorter.

## Shapes

- `borderRadius` maps to: none 0, small 3px, medium 6px, large 12px, full 9999px (official). No separate 5-step ramp exists, so `xl` repeats the large value (12px).
- Buttons, inputs, and textfields share the 6px medium radius; counters and badges are full pills.
- Focus is a 2px accent outline offset by 2px — keep it visible on all interactive elements.

## Components

- **button-primary**: accent emphasis fill, white medium-weight label, 6px radius, 32px tall with 0 12px padding (the `control.medium` metrics from `ButtonBase.module.css`).
- **button-secondary**: neutral emphasis fill with a 1px default border, matching Primer's outlined control language.
- **input**: 32px field, 1px `borderColor.default` border, 6px radius, body text.
- **card**: subtle gray surface (#F6F8FA) with the 12px radius and xsmall resting shadow.
- **chip**: a Primer counter — disabled-surface gray, muted text, caption size, full pill.
- **alert-error / badge-success / badge-warning**: solid emphasis fills with white text; badges are full pills.

## Do's and Don'ts

**Do**:
- Default to 14px text and 6px radii for all controls.
- Use muted text (#59636E) for secondary content instead of lighter grays.
- Keep icons and counters monochrome; color signals state only.
- Use pills for counters/badges and small radii for everything else.

**Don't**:
- Don't use heavy shadows for hierarchy — borders and surface grays do that work.
- Don't set body text below 12px.
- Don't invent large drop shadows or glossy effects; Primer stays flat.
- Don't animate layouts with custom curves outside ease/easeIn/easeOut.
