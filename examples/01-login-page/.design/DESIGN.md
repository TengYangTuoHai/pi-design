---
name: Login Page Design
colors:
  primary: "#3B6DFF"
  secondary: "#6B7280"
  tertiary: "#F3F4F6"
  neutral: "#1F2937"
  background: "#FFFFFF"
  surface: "#F9FAFB"
  error: "#EF4444"
  success: "#10B981"
typography:
  h1:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
motion:
  duration:
    fast: 150ms
    normal: 300ms
    slow: 500ms
  easing:
    standard: cubic-bezier(0.2, 0, 0, 1)
    spring: cubic-bezier(0.34, 1.56, 0.64, 1)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
    height: 48px
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.neutral}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: 48px
    border: "1px solid {colors.tertiary}"
  card:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
---

# Overview

A clean, modern login page design following best practices for authentication flows. The design emphasizes clarity, accessibility, and ease of use with a professional aesthetic suitable for SaaS applications.

# Colors

**Primary (#3B6DFF)**: Used for primary actions (login button) and interactive elements. A vibrant blue that conveys trust and professionalism.

**Secondary (#6B7280)**: Supporting text and secondary UI elements.

**Neutral (#1F2937)**: Primary text color, ensuring WCAG AAA readability on white backgrounds.

**Background/Surface**: Clean white and light gray surfaces create a calm, uncluttered interface.

**Error/Success**: Standard semantic colors for validation feedback.

# Typography

**Font Family**: Inter, a highly legible sans-serif font optimized for UI.

**Scale**: Clear hierarchy from h1 (32px, bold) for the page title down to body-sm (14px) for helper text.

**Spacing**: Tight tracking on headlines (-0.02em) for a refined look, comfortable line-height (1.5) for body copy.

# Layout

**Container**: Centered card (480px max-width) on a subtle gradient background.

**Vertical Rhythm**: Consistent spacing (md: 16px, lg: 24px) between form elements.

**Input Stack**: Email and password fields with clear labels, followed by a full-width primary button.

**Breathing Room**: Generous padding (xl: 32px) inside the card prevents cramped feeling.

# Elevation & Depth

**Card Shadow**: Subtle elevation (0 1px 3px rgba(0,0,0,0.1)) lifts the login form from the background without being distracting.

**Flat Inputs**: Border-only inputs (no shadow) keep the form clean and modern.

# Motion

**Entrance**: The login card fades in with a subtle upward slide (12px) over 300ms using the standard easing curve.

**Focus States**: Input borders transition color over 150ms (fast) when focused.

**Button Hover**: Background darkens slightly over 150ms with the standard curve.

**Reduced Motion**: All animations respect `prefers-reduced-motion: reduce` by skipping entrance animations and using instant state changes.

## Motion Inventory

- **screens/login.html**
  - Entrance: card fades in (opacity 0→1) + slides up 12px, duration normal (300ms), easing standard
  - Input focus: border-color transition, duration fast (150ms), easing standard
  - Button hover: background-color transition, duration fast (150ms), easing standard

# Shapes

**Rounded Corners**: Medium (8px) on inputs and buttons, large (12px) on the card for a friendly, approachable feel.

# Components

## Button Primary
Full-width login button with primary color, white text, medium rounding, and 48px height for easy tapping on mobile.

## Input
Standard text/password inputs with 48px height, clear borders, and internal padding for comfortable typing.

## Card
Login form container with subtle shadow and generous internal padding.

# Do's and Don'ts

**Do**:
- Keep the form minimal (email + password only on the main screen)
- Provide clear error messages inline
- Use large touch targets (48px minimum)
- Include "Forgot password?" link
- Show password visibility toggle

**Don't**:
- Ask for unnecessary information on login
- Use placeholder text as labels
- Hide the password by default without a toggle
- Use tiny, hard-to-read links
- Overcomplicate with too many social login options
