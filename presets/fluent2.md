---
name: Fluent 2
description: Microsoft's Fluent 2 web light theme — quiet neutral surfaces, the blue brand ramp, Semibold headings, and pill-free 4px controls.
colors:
  primary: "#0F6CBD"
  on-primary: "#FFFFFF"
  secondary: "#EFF6FC"
  on-secondary: "#115EA3"
  background: "#FFFFFF"
  on-background: "#242424"
  surface: "#FAFAFA"
  on-surface: "#242424"
  surface-variant: "#F5F5F5"
  on-surface-variant: "#424242"
  outline: "#D1D1D1"
  error: "#C50F1F"
  on-error: "#FFFFFF"
  success: "#107C10"
  on-success: "#FFFFFF"
  warning: "#F7630C"
  on-warning: "#271002"
typography:
  display:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 68px
    fontWeight: 600
    lineHeight: 92px
  h1:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
  h2:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 36px
  h3:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
  body-lg:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 22px
  body-md:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  label:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
  caption:
    fontFamily: "\"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 14px
  code:
    fontFamily: "Consolas, \"Courier New\", Courier, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 6px
  xl: 8px
  full: 9999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
elevation:
  sm: "0 0 2px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.14)"
  md: "0 0 2px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.14)"
  lg: "0 0 2px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.14)"
motion:
  duration:
    fast: 150ms
    normal: 200ms
    slow: 300ms
  easing:
    standard: cubic-bezier(0.33, 0, 0.67, 1)
    enter: cubic-bezier(0.1, 0.9, 0.2, 1)
    exit: cubic-bezier(0.9, 0.1, 1, 0.2)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
    height: 32px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    border: "1px solid {colors.outline}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
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
    rounded: "{rounded.md}"
    padding: "16px"
    shadow: "{elevation.sm}"
  chip:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.md}"
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

Based on Fluent 2 by Microsoft (MIT, https://fluent2.microsoft.design). Unofficial adaptation; not affiliated with or endorsed by Microsoft. Tokens are the `webLightTheme` from the Fluent UI React `@fluentui/tokens` package. Fonts are the system stacks the system prescribes — "Segoe UI Variable"/"Segoe UI" for text and Consolas for code — so nothing is bundled (no Google Fonts file). Fluent 2 suits productivity software: dense Office-style desktop tools, admin panels, and enterprise line-of-business apps on Windows and the web.

## Colors

- `primary` is `colorBrandBackground` (brand[80] #0F6CBD); `on-primary` is `colorNeutralForegroundOnBrand` (white).
- `secondary` is the brand-tint pair used by subtle brand surfaces: `colorBrandBackground2` (brand[160] #EFF6FC) with `colorBrandForeground2` (brand[70] #115EA3).
- Neutrals: `background` = `colorNeutralBackground1`, `surface` = `colorNeutralBackground2`, `surface-variant` = `colorNeutralBackground3`, with matching `colorNeutralForeground1/2`; `outline` is `colorNeutralStroke1` (#D1D1D1).
- `error` is the danger ramp primary (#C50F1F) and `success` the green ramp primary (#107C10) — the `colorStatusDanger/Success` mapping of the light theme.
- **(adapted for AA)** `warning` is the orange ramp primary `colorStatusWarningBackground3` (#F7630C); its official inverted text fails 4.5:1, so `on-warning` uses the ramp's official `shade50` (#271002).

## Typography

- The ramp follows `typographyStyles`: display → display (68px), h1 → title1, h2 → title2, h3 → title3; all headings Semibold (600).
- body1/body2 map to `body-md`/`body-lg`; caption1 → `body-sm`; `label` is body1Strong (14px Semibold) as used by medium buttons; `caption` is caption2 (10px).
- `code` uses `fontFamilyMonospace` (Consolas stack) at the body-medium size.
- Fluent defines no letter-spacing tokens, so none are set.

## Layout

- The spacing scale is the official horizontal/vertical spacing ramp: 2/4/8/12/16/20/24px.
- Controls are compact: medium buttons and inputs are 32px tall.
- Small radii keep the UI squared — 4px on controls (`borderRadiusMedium`), 2px on small elements, 8px maximum for large surfaces.

## Elevation & Depth

- Fluent shadows pair a 2px ambient ring with a directional key shadow: shadow2/shadow4/shadow8 → `sm`/`md`/`lg`, built from `colorNeutralShadowAmbient` (rgba(0,0,0,0.12)) and `colorNeutralShadowKey` (rgba(0,0,0,0.14)).
- Elevate sparingly: most surfaces (cards, dialogs on canvas) stay flat with 1px `colorNeutralStroke1` borders; shadow is for real overlap (menus, popovers).

## Motion

- Durations map to `durationFast` (150ms), `durationNormal` (200ms), `durationSlow` (300ms).
- `enter` is `curveDecelerateMax`, `exit` is `curveAccelerateMax`, and `standard` is `curveEasyEase` — the connective curve Fluent uses when enter/exit don't apply.
- Keep enter/exit pairs symmetric in distance: elements exit toward where they came from.
- Reduced motion: with `prefers-reduced-motion: reduce`, drop transforms (offset/scale) and keep only opacity fades at fast duration (150ms) or shorter.

## Shapes

- `borderRadius` maps to: none 0, small 2px, medium 4px, large 6px, xLarge 8px, full 9999px (the standard pill value; the token file's `borderRadiusCircular` is 10000px).
- Buttons, inputs, and cards all use `borderRadiusMedium` (4px) — the squarish look is intentional.
- Small badges and chips use `borderRadiusSmall` (2px).

## Components

- **button-primary**: accent fill, white Semibold label, 4px radius, 32px tall with 5px 12px padding (the v9 medium button metrics).
- **button-secondary**: brand-tint fill with brand-foreground text plus a 1px neutral stroke.
- **input**: 32px field, 4px radius, 1px `colorNeutralStroke1` border, 12px inline padding (the v9 medium input metrics).
- **card**: neutral background-2 surface with a subtle shadow-2 lift.
- **chip**: neutral background-3 with foreground-2 text at caption1 size.
- **alert-error / badge-success / badge-warning**: solid status fills; the warning badge pairs orange primary with its darkest official shade for AA.

## Do's and Don'ts

**Do**:
- Use Semibold (600) rather than bold for headings and button labels.
- Keep 14px/20px as the default text size for controls and dense UI.
- Use the gray stroke tokens for dividers and control borders; keep shadows for floating layers.
- Prefer 4px radii; reserve 8px+ for large panels.

**Don't**:
- Don't set brand color as page background — Fluent keeps canvases neutral.
- Don't use pure black text; foreground tokens are #242424 and softer grays.
- Don't mix custom durations outside fast/normal/slow.
- Don't round controls to pills — that breaks the Fluent control language.
