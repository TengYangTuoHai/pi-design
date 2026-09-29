---
name: Material 3
description: Google's Material 3 baseline light scheme — tonal color roles, the Roboto type scale, springy emphasized motion, and pill-shaped buttons.
colors:
  primary: "#6750A4"
  on-primary: "#FFFFFF"
  secondary: "#625B71"
  on-secondary: "#FFFFFF"
  background: "#FEF7FF"
  on-background: "#1D1B20"
  surface: "#FEF7FF"
  on-surface: "#1D1B20"
  surface-variant: "#F3EDF7"
  on-surface-variant: "#49454F"
  outline: "#79747E"
  error: "#B3261E"
  on-error: "#FFFFFF"
  success: "#006C35"
  on-success: "#FFFFFF"
  warning: "#9A4600"
  on-warning: "#FFFFFF"
typography:
  display:
    fontFamily: "Roboto, sans-serif"
    fontSize: 36px
    fontWeight: 400
    lineHeight: 44px
  h1:
    fontFamily: "Roboto, sans-serif"
    fontSize: 32px
    fontWeight: 400
    lineHeight: 40px
  h2:
    fontFamily: "Roboto, sans-serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 36px
  h3:
    fontFamily: "Roboto, sans-serif"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 28px
  body-lg:
    fontFamily: "Roboto, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0.5px
  body-md:
    fontFamily: "Roboto, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.25px
  body-sm:
    fontFamily: "Roboto, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.4px
  label:
    fontFamily: "Roboto, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  caption:
    fontFamily: "Roboto, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.5px
  code:
    fontFamily: "Roboto Mono, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  none: 0px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 28px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
elevation:
  sm: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)"
  md: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15)"
  lg: "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)"
motion:
  duration:
    fast: 150ms
    normal: 300ms
    slow: 500ms
  easing:
    standard: cubic-bezier(0.2, 0, 0, 1)
    enter: cubic-bezier(0.05, 0.7, 0.1, 1)
    exit: cubic-bezier(0.3, 0, 0.8, 0.15)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 24px"
    height: 40px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    border: "1px solid {colors.outline}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 24px"
    height: 40px
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
    border: "1px solid {colors.outline}"
    borderColor: "{colors.outline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: 56px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "16px"
    shadow: "{elevation.sm}"
  chip:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.sm}"
    padding: "16px"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
---

## Overview

Based on Material 3 by Google (Apache-2.0, https://m3.material.io). Unofficial adaptation; not affiliated with or endorsed by Google. The fonts are Roboto and Roboto Mono (Google Fonts), the typefaces the system itself specifies — no substitution was needed. Material 3 suits consumer, mobile-first products — friendly, colorful apps with large touch targets, tonal surfaces, and expressive but soft motion. The token values are the baseline light scheme (third-party static palette) as shipped in the Material Web `tokens/` package.

## Colors

- `primary` is `md.sys.color.primary` (baseline purple #6750A4); `on-primary` is `md.sys.color.on-primary` (white).
- Surfaces are neutral98 tonal surfaces (`background`/`surface` = `md.sys.color.surface` #FEF7FF); `surface-variant` maps to `md.sys.color.surface-container` (#F3EDF7) with `on-surface-variant` = `md.sys.color.on-surface-variant` (#49454F).
- `outline` is `md.sys.color.outline` (#79747E); `error`/`on-error` are `md.sys.color.error`/`on-error`.
- **(adapted)** Material has no success/warning roles; `success` (#006C35) and `warning` (#9A4600) are the `green40`/`orange40` tones of the official Material baseline palette (md.ref.palette), chosen so white text passes AA.

## Typography

- The type ramp is `md.sys.typescale`: display-small → `display` (36px), headline-large → `h1` (32px), headline-medium → `h2` (28px), title-large → `h3` (22px).
- Body large/medium/small map to `body-lg`/`body-md`/`body-sm`; `label` is label-large (14px, medium weight); `caption` is label-small (11px).
- Roboto is used for everything; `code` uses Roboto Mono at the body-medium size.
- Source letter-spacing values (0.03125rem on body-large, etc.) are converted to px; headings have 0 tracking and omit the property.

## Layout

- Material 3 lays out on a 4dp grid; the spacing steps here follow that grid at 4/8/12/16/24/32/48px.
- Prefer large hit targets: the filled button is 40px tall, the filled text field 56px.
- Cards and sheets use 12–16px corner radii (shape scale `medium`/`large`); navigation surfaces 28px (`extra-large`).

## Elevation & Depth

- Elevation is the M3 two-shadow model — a key shadow at 30% black plus an ambient shadow at 15% — for levels 1–3 (`md.sys.elevation` level1–level3).
- Level 0 (flat) is the resting state for filled cards; avoid stacking many elevated layers.
- Tinted surfaces (surface-container roles) provide depth without shadow.

## Motion

- Durations map to `md.sys.motion.duration`: short3 (150ms) → fast, medium2 (300ms) → normal, long2 (500ms) → slow.
- `standard` is `md.sys.motion.easing.standard`; `enter` is emphasized-decelerate, `exit` is emphasized-accelerate.
- Use emphasized easing for large transitions (containers, shared-axis moves) and standard easing for small ones (fades, state changes).
- Reduced motion: with `prefers-reduced-motion: reduce`, drop all transforms (slide/scale) and keep opacity fades at fast duration (150ms) or shorter.

## Shapes

- The M3 shape scale maps to: none 0, small 8px, medium 12px, large 16px, extra-large 28px, full 9999px.
- Buttons are full pills (`corner-full`); filter chips are 8px (`corner-small`); filled cards are 12px (`corner-medium`).
- Text fields round only the top corners (4px) in the spec — the `input` token uses the 8px small corner as the closest single-radius value.

## Components

- **button-primary**: filled button — primary fill, on-primary label (label-large), pill shape, 40px tall with 10px 24px padding.
- **button-secondary**: secondary fill with a 1px outline border for contrast on tinted surfaces.
- **input**: filled text field — 56px resting height, 4px top-corner rounding approximated by the 8px small radius.
- **card**: filled card — surface fill, 12px corners, level-1 elevation.
- **chip**: filter chip — surface-container fill, 8px corners, 32px tall.
- **alert-error / badge-success / badge-warning**: solid semantic fills with white labels (all pairs pass WCAG AA).

## Do's and Don'ts

**Do**:
- Use tonal color roles (primary → on-primary, surface → on-surface) rather than raw hex.
- Keep touch targets ≥ 40px and give body text 16px/24px.
- Reserve the emphasized curves and long durations for large container transitions.
- Use pills for buttons and 8px chips, as the spec does.

**Don't**:
- Don't put body-small (12px) in long passages — it exists for helper text.
- Don't stack elevation on top of elevated containers; prefer tint.
- Don't invent a second accent hue — M3 builds contrast from tonal ramps of one key color.
- Don't animate with linear or bouncy curves outside the defined easing tokens.
