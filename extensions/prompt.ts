/**
 * Workflow state-machine prompts. This file is the single home of the
 * "business logic" that the model executes; the extension only wires tools.
 */
import type { DesignConfig, DesignState, DesignTarget } from "./types.ts";

const TARGET_NOTES: Record<DesignTarget, string> = {
	swiftui: "SwiftUI (compilable Swift view code, one screen per file)",
	react: "React components (follow the target project's existing structure and styling)",
	web: "Web (HTML/CSS/JS inside the target project)",
};

/**
 * Per-target IMPLEMENT translation rules (M3). These are the single source of
 * the target-specific guidance; they are injected wherever the IMPLEMENT stage
 * can begin (workflow prompt, approve gate message, per-turn stage guideline)
 * so the rules survive compaction and fresh sessions.
 */
export const IMPLEMENT_TARGET_RULES: Record<DesignTarget, string> = {
	react: [
		"R1 Recon the target project before writing any code: package.json (framework & deps), src layout, styling approach (Tailwind / CSS Modules / styled-components / global CSS / Sass) and naming conventions. Project conventions override the rules below.",
		"R2 Translate the design tokens (DESIGN.md front matter is normative; tokens.css is its CSS projection) into the project's theme layer; magic values inside components are forbidden: Tailwind → extend theme (colors/spacing/radii into tailwind.config); CSS Modules/global CSS → merge into global :root custom properties (or a standalone design-tokens.css) and reference them; CSS-in-JS → a theme object. Keep token names. Importing ../.design/tokens.css directly as the single source is allowed, but if .design/ is not kept long-term with the project (e.g. gitignored), you must copy it into the project (e.g. src/styles/design-tokens.css) as the only copy.",
		"R3 One screen = one page/view component in the project's conventional directory (pages/ views/ app/); split reusable pieces into child components; follow the project's TS/JS choice, file extensions and import style.",
		"R4 Local useState is enough for interaction; hardcode static copy; do not add state management, routing, or any new dependency (if truly necessary, state the assumption in writing first).",
		"R5 Icons: prefer the project's existing approach, otherwise inline SVG; put images and other static assets in the project's static directory.",
		"R6 After implementing, run the project's own checks (npm run build / lint / typecheck, if present) and fix until they pass; if you cannot run them, say so in your reply and manually re-check imports and JSX balance.",
	].join("\n"),
	swiftui: [
		"S1 Translate the design tokens (DESIGN.md front matter is normative; tokens.css is its CSS projection) into DesignTokens.swift (or the project's existing constants file): colors → static let, either a Color(hex:) extension or Color(red:green:blue:), with the original value in a comment; font sizes/spacing/radii → CGFloat constants; keep token names; bare visual values inside body are forbidden.",
		"S2 Layout translation: vertical stacking → VStack, horizontal → HStack, layering/absolute positioning → ZStack; spacing/padding from token constants; screen margins must respect the safe area (.padding + safeAreaInsets awareness) — never hardcode notch heights like 47.",
		"S3 One screen = one SwiftUI/<Screen>View.swift containing struct <Screen>View: View; split into private subviews when body exceeds ~40 lines; end the file with #Preview.",
		"S4 Use native components: TextField/SecureField/Button/Toggle/Link; pick the closest SF Symbol for icons; choose List or ScrollView by content nature — do not pile long lists into ScrollView+VStack.",
		"S5 No WebView and no literal HTML/CSS translation; omit prototype interactions with no native equivalent (e.g. hover) and note it; if DESIGN.md declares dark-mode support, use semantic colors (.primary/.secondary/.background) or Asset Catalog colors.",
		"S6 If a Swift toolchain is available locally, validate syntax with swiftc -parse; otherwise read the code through once, checking types, brackets, and Image/closure balance.",
	].join("\n"),
	web: [
		"W1 Recon the target project first: templating approach (plain HTML / template engine / framework), CSS organization (single file / BEM / layered @import), JS conventions; project conventions override the rules below.",
		"W2 Project the design tokens (DESIGN.md front matter) into the project's global custom-property layer via the deterministic naming (keep names, dedupe); page styles reference variables only; magic values are forbidden.",
		"W3 Put pages into the project's existing directory structure; keep semantics and accessibility (label, alt, real button/a elements) at least at prototype level.",
		"W4 Write only the interaction the prototype needs; do not introduce frameworks or build steps the project doesn't already have; load fonts and other external resources the way the project already does.",
	].join("\n"),
};

/**
 * Static guidelines attached to the design tools via `promptGuidelines`.
 * They are only present in the system prompt while the tools are active,
 * which keeps normal coding sessions unpolluted (see pi.setActiveTools).
 */
export const RENDER_TOOL_GUIDELINES = [
	"After design_render returns, actually look at the screenshot: check alignment, visual hierarchy, whitespace, cross-screen consistency, brand consistency with .design/DESIGN.md, and AI-tells (dull gradients, emoji overuse, cookie-cutter cards). Fix what you find, then re-render.",
	"SELF-REVIEW is capped at 3 rounds per screen; when the cap is reached, take the known issues to human review instead of burning tokens in a loop.",
];

export const REVIEW_TOOL_GUIDELINES = [
	"After calling design_review the current turn ends immediately (the tool force-terminates): do not output implementation plans and do not write implementation code; wait for the human verdict to flow back.",
	"Only call design_review after every screen has finished SELF-REVIEW.",
];

export const STATUS_TOOL_GUIDELINES = [
	"[/design workflow] Every stage transition must be persisted via design_status to .design/state.json: BRIEF→PLAN→BUILD→SELF-REVIEW→REVIEW→IMPLEMENT→done.",
	"BUILD: finish .design/tokens.css before pages; one screen per file at .design/prototype/screens/<id>.html; every color/size/spacing/radius must reference tokens.css via var(--…) — inline magic values are forbidden.",
	"A user message arriving after REVIEW is the review verdict: explicit approval → design_status {\"stage\":\"implement\"} then implement to spec; comments/rejection → design_status {\"stage\":\"build\"} and revise per the feedback.",
	"IMPLEMENT iron rules: .design/prototype + tokens.css are the spec; when the implementation conflicts with the prototype, fix the implementation, never the prototype; after each screen, self-check against that screen's latest screenshot in .design/shots/ (if you cannot view images, do a token-by-token code audit instead and say so); when everything is done, finish with design_status {\"stage\":\"done\"}.",
];

/**
 * The initial workflow prompt sent by /design via pi.sendUserMessage().
 */
export function buildWorkflowPrompt(input: {
	brief: string;
	state: DesignState;
	config: DesignConfig;
}): string {
	const { brief, state, config } = input;
	const screens = state.screens.length > 0 ? state.screens.join(", ") : "(none yet; produced in PLAN)";
	const extraViewports = config.viewports.map((v) => `${v.width}x${v.height}`).join(", ");
	return `# /design workflow started

## Design brief
${brief}

## Project conventions (read during BRIEF; create sensible defaults if missing)
- .design/DESIGN.md — the design identity, in the DESIGN.md format spec (Google Labs): YAML front matter carries the normative design tokens, the markdown body carries the rationale. User-editable; it wins. If the project root has a DESIGN.md, import it and keep the .design/ copy canonical.
- .design/tokens.css — DERIVED from the DESIGN.md front matter (the CSS projection below); front matter wins on any conflict
- .design/config.json — target: ${config.target} (${TARGET_NOTES[config.target]}), viewport: ${config.viewport.width}x${config.viewport.height}${extraViewports ? `, extra check viewports: ${extraViewports}` : ""}
- Existing screens: ${screens}

### DESIGN.md format (normative)
\`\`\`
---
name: <identity name>
colors: { primary, secondary, tertiary, neutral, ... }        # CSS colors
typography: { h1: {fontFamily, fontSize, fontWeight?, lineHeight?, letterSpacing?}, body-md: {...}, ... }
rounded: { sm: 4px, md: 8px }                                 # dimensions
spacing: { sm: 8px, md: 16px }                                # dimensions or bare numbers
components:
  button-primary: { backgroundColor, textColor, typography, rounded, padding, size, height, width }   # values may be token refs like "{colors.tertiary}"
---
\`\`\`
Prose sections follow this exact order (omit unneeded, never reorder): Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. The review gate lints this file mechanically: token refs must resolve; a primary color and typography must exist; component text/background pairs must pass WCAG AA (4.5:1); no duplicate sections; tokens.css must stay in sync.

### tokens.css projection (deterministic)
colors.primary → \`--color-primary\`; typography.h1.fontSize → \`--type-h1-size\` (family/size/weight/line-height/tracking); rounded.md → \`--rounded-md\`; spacing.sm → \`--spacing-sm\`; components.button-primary.backgroundColor → \`--component-button-primary-background\` (background/text/rounded/padding/size/height/width).

## Scope
${
	state.scope === "component"
		? `COMPONENT scope — the deliverable is ONLY the component named in the brief, plus the variants/states it genuinely needs. Below, one "screen" file means one component showcase page.
- PLAN: list the component's variants/states/sizes (default/hover/disabled/ loading; sm/md/lg…) — do NOT plan app screens, navigation, or any page the brief did not ask for.
- BUILD: one showcase page per component under .design/prototype/screens/: the component rendered in its representative states on a neutral backdrop; no app chrome, no invented surrounding pages.
- IMPLEMENT: implement ONLY the component as one reusable unit in the target project (one component file + tokens; a demo/storybook entry only if the user asked); do not create pages, routes, layouts, or app scaffolding beyond the component itself.`
		: `APP/PAGE scope — the brief defines an app or page flow, and PLAN may enumerate its screens.
Scope guard: if the brief actually names a single component or control (a button, card, input, modal, tab bar, avatar, chart…), do NOT expand it into the whole app. Persist the switch first (design_status {"scope":"component"}), then follow COMPONENT-scope rules from PLAN on: showcase page only, implement only the component. Never widen scope unless the user explicitly asks for more.`
}

## State machine (execute strictly)
BRIEF → PLAN → BUILD → SELF-REVIEW (≤3 rounds/screen) → REVIEW (human gate) ─┬→ approved → IMPLEMENT → done
                                                                            └→ rejected/comments → BUILD

1. **BRIEF**: read the files above; when the request is ambiguous, make reasonable assumptions yourself and record them in a \`<!-- assumption: ... -->\` comment at the top of each screen's HTML — do not interrupt the user with questions.
2. **PLAN**: state the screen list in one go (id/name/purpose/key elements) and maintain .design/prototype/index.html as a navigation shell (iframes + desktop/phone frames). No business pages in this stage.
3. **BUILD**: keep DESIGN.md's front matter and tokens.css in sync first (projection above), then write pages; one screen per file; visual values may only come from tokens.css.
4. **SELF-REVIEW**: per screen, call design_render → critique the screenshot → fix → re-render, at most 3 rounds per screen; use design_status along the way to keep the screen list and stage current.${extraViewports ? " Extra check viewports are configured: after a screen passes at the primary viewport, render it once at each extra viewport (pass the viewport argument to design_render) and confirm the layout holds." : ""}
5. **REVIEW**: when every screen has passed self-review, call design_review to open the human review page and **end the turn immediately**; wait for the human verdict — never start implementing on your own.
6. **IMPLEMENT**: implement to spec from prototype + tokens.css for the configured target; on conflict, fix the implementation, never the prototype; after each screen, self-check against its latest screenshot (if the current model cannot view images, do a token-by-token code audit instead and say so); finish with design_status {"stage":"done"}.

## IMPLEMENT translation rules (target: ${config.target})
${IMPLEMENT_TARGET_RULES[config.target]}

## Stage discipline
- Every stage transition must be persisted (design_status).
- After REVIEW, user messages = review verdict (approval → IMPLEMENT; comments → BUILD).
- /design <new brief> resets to BRIEF; /design stop ends the workflow.

Start from BRIEF now.`;
}

/**
 * Compact per-turn guideline injected via the before_agent_start event while a
 * design session is active. Survives compaction: it does not rely on the
 * earlier conversation history still containing the full workflow prompt.
 */
export function stageGuideline(state: DesignState, config: DesignConfig): string {
	const screens = state.screens.length > 0 ? state.screens.join(", ") : "none";
	const base = [
		"[/design workflow active]",
		`stage=${state.stage}; scope=${state.scope}; screens=[${screens}]; reviewRound=${state.reviewRound}; target=${config.target}.`,
		"BUILD: render each screen as you produce it (design_render, ≤3 rounds/screen); when all screens pass, call design_review (the turn ends right after the call).",
		".design/DESIGN.md is authoritative (DESIGN.md spec: front matter = normative tokens, prose = rationale); tokens.css is its CSS projection — keep both in sync.",
		"A user message after REVIEW is the review verdict: approval → design_status {\"stage\":\"implement\"}; comments → design_status {\"stage\":\"build\"}.",
		"IMPLEMENT: .design/prototype + tokens.css are the spec; on conflict fix the implementation, not the prototype; finish with design_status {\"stage\":\"done\"}.",
	];
	if (state.scope === "component") {
		base.push(
			"COMPONENT SCOPE: the deliverable is only the requested component (+ its variants) — one showcase page in the prototype, one reusable component at IMPLEMENT; no app screens, pages, routing, or scaffolding.",
		);
	}
	if (state.stage === "implement") {
		base.push(`IMPLEMENT translation rules (${config.target}):\n${IMPLEMENT_TARGET_RULES[config.target]}`);
	}
	return base.join("\n");
}

/**
 * Message injected into the session when the human clicks approve/reject in
 * the review page. Routed through pi.sendUserMessage() so it is treated
 * exactly like user speech and always triggers a turn.
 */
export function gateDecisionMessage(
	decision: "approve" | "reject",
	comment: string | undefined,
	round: number,
	target: DesignTarget = "web",
): string {
	if (decision === "approve") {
		return [
			`[design review] The user approved round ${round}.`,
			comment ? `User note: ${comment}` : "",
			`Entering IMPLEMENT: first persist design_status {"stage":"implement"}, then implement to spec from .design/prototype + tokens.css for config.target (${target}); on conflict fix the implementation, never the prototype; after each screen, self-check against its latest screenshot (token-by-token code audit if you cannot view images, and say so); when all screens are done, finish with design_status {"stage":"done"}.`,
			`IMPLEMENT translation rules (${target}):\n${IMPLEMENT_TARGET_RULES[target]}`,
		]
			.filter(Boolean)
			.join("\n");
	}
	return [
		`[design review] The user rejected round ${round}.`,
		comment ? `Reason: ${comment}` : "(no comment given; identify obvious problems yourself, or ask the user what specifically displeased them)",
		"Back to BUILD: revise the affected screens in .design/prototype per the feedback (still consuming tokens.css only), re-run SELF-REVIEW (design_render, ≤3 rounds/screen), then call design_review to submit again.",
	].join("\n");
}
