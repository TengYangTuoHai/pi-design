/**
 * Workflow state-machine prompts. This file is the single home of the
 * "business logic" that the model executes; the extension only wires tools.
 */
import { presetCatalog } from "./presets.ts";
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
		"R7 Motion: project the motion tokens like any other token (CSS custom properties or the theme's transition config); reproduce the prototype's animations with the project's native mechanism (CSS transitions/animations, or the animation lib already in the project — never add one for this); keep durations/easings on tokens; honor prefers-reduced-motion where the app has a reduced-motion story; do not port the prototype's motion.js runtime — it is a review tool, not product code.",
	].join("\n"),
	swiftui: [
		"S1 Translate the design tokens (DESIGN.md front matter is normative; tokens.css is its CSS projection) into DesignTokens.swift (or the project's existing constants file): colors → static let, either a Color(hex:) extension or Color(red:green:blue:), with the original value in a comment; font sizes/spacing/radii → CGFloat constants; keep token names; bare visual values inside body are forbidden.",
		"S2 Layout translation: vertical stacking → VStack, horizontal → HStack, layering/absolute positioning → ZStack; spacing/padding from token constants; screen margins must respect the safe area (.padding + safeAreaInsets awareness) — never hardcode notch heights like 47.",
		"S3 One screen = one SwiftUI/<Screen>View.swift containing struct <Screen>View: View; split into private subviews when body exceeds ~40 lines; end the file with #Preview.",
		"S4 Use native components: TextField/SecureField/Button/Toggle/Link; pick the closest SF Symbol for icons; choose List or ScrollView by content nature — do not pile long lists into ScrollView+VStack.",
		"S5 No WebView and no literal HTML/CSS translation; omit prototype interactions with no native equivalent (e.g. hover) and note it; if DESIGN.md declares dark-mode support, use semantic colors (.primary/.secondary/.background) or Asset Catalog colors.",
		"S6 If a Swift toolchain is available locally, validate syntax with swiftc -parse; otherwise read the code through once, checking types, brackets, and Image/closure balance.",
		"S7 Motion: translate motion tokens into constants (durations as TimeInterval/CGFloat, easings as the closest SwiftUI curve — .smooth/.snappy/.bouncy or a custom UnitCurve) and drive them with .animation(_:value:)/withAnimation; springs may map to .spring(duration:bounce:); respect accessibilityReduceMotion (@Environment(\\.accessibilityReduceMotion)) by falling back to the reduced variant documented in DESIGN.md; never port motion.js.",
	].join("\n"),
	web: [
		"W1 Recon the target project first: templating approach (plain HTML / template engine / framework), CSS organization (single file / BEM / layered @import), JS conventions; project conventions override the rules below.",
		"W2 Project the design tokens (DESIGN.md front matter) into the project's global custom-property layer via the deterministic naming (keep names, dedupe); page styles reference variables only; magic values are forbidden.",
		"W3 Put pages into the project's existing directory structure; keep semantics and accessibility (label, alt, real button/a elements) at least at prototype level.",
		"W4 Write only the interaction the prototype needs; do not introduce frameworks or build steps the project doesn't already have; load fonts and other external resources the way the project already does.",
		"W5 Motion: reference the projected --motion-* variables for every duration/easing and reproduce the prototype's CSS animations/transitions as-is; keep the prefers-reduced-motion media query; do not port motion.js (review tooling only).",
	].join("\n"),
};

/**
 * Static guidelines attached to the design tools via `promptGuidelines`.
 * They are only present in the system prompt while the tools are active,
 * which keeps normal coding sessions unpolluted (see pi.setActiveTools).
 */
/**
 * How to read element annotations. Review hosts (Pi review page, DSH
 * playground) serialize pinned comments into the verdict text as an
 * "Element annotations (screen · selector · text):" block; the selector comes
 * from the motion.js picker and is unique within that screen.
 */
export const ANNOTATION_GUIDELINE =
	"Review feedback may contain an \"Element annotations (screen · selector · text):\" block: each numbered entry names a screen file under .design/prototype/, a CSS selector unique within that screen, and the element's visible text, followed by the note (→ …). Locate exactly that element (document.querySelector semantics) and apply the note to it; keep changes scoped to the annotated elements unless the general comment asks for more.";

export const RENDER_TOOL_GUIDELINES = [
	"After design_render returns, actually look at the screenshot: check alignment, visual hierarchy, whitespace, cross-screen consistency, brand consistency with .design/DESIGN.md, and AI-tells (dull gradients, emoji overuse, cookie-cutter cards). Fix what you find, then re-render.",
	"Screenshots show the settled state; to verify motion, render again with atMs (e.g. 150) for a mid-animation frame and compare against the ## Motion inventory in DESIGN.md.",
	"SELF-REVIEW is capped at 3 rounds per screen; when the cap is reached, take the known issues to human review instead of burning tokens in a loop.",
];

export const REVIEW_TOOL_GUIDELINES = [
	"After calling design_review the current turn ends immediately (the tool force-terminates): do not output implementation plans and do not write implementation code; wait for the human verdict to flow back.",
	"Only call design_review after every screen has finished SELF-REVIEW.",
];

export const STATUS_TOOL_GUIDELINES = [
	"[/design workflow] Every stage transition must be persisted via design_status to .design/state.json: BRIEF→PLAN→BUILD→SELF-REVIEW→REVIEW→IMPLEMENT→done.",
	"BUILD: finish .design/tokens.css before pages; one screen per file at .design/prototype/screens/<id>.html; every color/size/spacing/radius/duration/easing must reference tokens.css via var(--…) — inline magic values are forbidden.",
	"MOTION: design it with the UI — declarative CSS transitions/animations only (no rAF loops), values via var(--motion-*), every screen includes <script src=\"../motion.js\"></script> before </body> (auto-generated; never hand-write), a prefers-reduced-motion fallback, and the per-screen inventory in DESIGN.md's ## Motion section.",
	"A user message arriving after REVIEW is the review verdict: explicit approval → design_status {\"stage\":\"implement\"} then implement to spec; comments/rejection → design_status {\"stage\":\"build\"} and revise per the feedback.",
	"IMPLEMENT iron rules: .design/prototype + tokens.css are the spec; when the implementation conflicts with the prototype, fix the implementation, never the prototype; after each screen, self-check against that screen's latest screenshot in .design/shots/ (if you cannot view images, do a token-by-token code audit instead and say so); when everything is done, finish with design_status {\"stage\":\"done\"}.",
];

export const PRESET_TOOL_GUIDELINES = [
	"Follow the BRIEF identity rules: apply a built-in preset only when the user gave no design direction and the project has no identity of its own; never pass force unless the user explicitly asked to replace DESIGN.md.",
	"After any edit to the DESIGN.md front matter, call design_preset {\"action\":\"sync\"} to regenerate tokens.css deterministically instead of hand-editing tokens.css.",
];

/**
 * The BRIEF-stage rule for where the design identity comes from. Built-in
 * presets (presets/index.json) are the fallback when the user gave no design
 * direction, so a brief like "a todo app" still gets a coherent, big-company
 * grade identity instead of ad-hoc defaults.
 */
export function identitySource(state: DesignState): string {
	if (state.preset) {
		return `The user chose the built-in preset \`${state.preset}\` (/design --preset); it is already in .design/DESIGN.md + tokens.css. Use it as the identity. You may adapt values the brief explicitly asks for (e.g. a brand primary color) but never rename or remove tokens; after any front-matter edit regenerate tokens.css with design_preset {"action":"sync"}.`;
	}
	const catalog = presetCatalog();
	return [
		"1. .design/DESIGN.md already exists → it is the identity; never replace it.",
		"2. A DESIGN.md at the project root → import it into .design/ (see above).",
		"3. The target project already has a design system in code (Tailwind theme, CSS custom properties, a theme/tokens file) → derive .design/DESIGN.md from it so the design matches the product.",
		"4. The brief names a visual direction (brand, palette, style, reference product) → author a custom DESIGN.md that follows it.",
		catalog
			? `5. Otherwise (no design direction at all) → pick the best-fitting BUILT-IN PRESET below and apply it with design_preset {"action":"apply","id":"<id>"} — it writes .design/DESIGN.md + tokens.css. Say which preset you picked and why in one line, and record it as an \`<!-- assumption: preset=<id> — <reason> -->\` comment in each screen. Presets share identical token names, so pages use var(--color-primary), var(--type-body-md-size), … regardless of the preset. If the preset's fonts come from Google Fonts, every screen links that stylesheet in <head> (design_preset prints the URL).\n${catalog}`
			: "5. Otherwise → author sensible defaults yourself.",
	].join("\n");
}

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

### Design identity source (decide during BRIEF, first match wins)
${identitySource(state)}

### DESIGN.md format (normative)
\`\`\`
---
name: <identity name>
colors: { primary, secondary, tertiary, neutral, ... }        # CSS colors
typography: { h1: {fontFamily, fontSize, fontWeight?, lineHeight?, letterSpacing?}, body-md: {...}, ... }
rounded: { sm: 4px, md: 8px }                                 # dimensions
spacing: { sm: 8px, md: 16px }                                # dimensions or bare numbers
motion:
  duration:                                                    # timings
    fast: 150ms
    normal: 300ms
    slow: 550ms
  easing:                                                      # curves
    standard: cubic-bezier(0.2, 0, 0, 1)
    spring: cubic-bezier(0.34, 1.56, 0.64, 1)
components:
  button-primary: { backgroundColor, textColor, typography, rounded, padding, size, height, width }   # values may be token refs like "{colors.tertiary}"
---
\`\`\`
Prose sections follow this exact order (omit unneeded, never reorder): Overview, Colors, Typography, Layout, Elevation & Depth, Motion, Shapes, Components, Do's and Don'ts. The review gate lints this file mechanically: token refs must resolve; a primary color and typography must exist; component text/background pairs must pass WCAG AA (4.5:1); no duplicate sections; tokens.css must stay in sync; motion tokens need a \`## Motion\` section that mentions reduced motion.

### tokens.css projection (deterministic)
colors.primary → \`--color-primary\`; typography.h1.fontSize → \`--type-h1-size\` (family/size/weight/line-height/tracking); rounded.md → \`--rounded-md\`; spacing.sm → \`--spacing-sm\`; motion.duration.fast → \`--motion-duration-fast\`, motion.easing.spring → \`--motion-easing-spring\`; components.button-primary.backgroundColor → \`--component-button-primary-background\` (background/text/rounded/padding/size/height/width).

### Motion (designed WITH the UI, not bolted on)
Motion is a first-class deliverable: entrances, state changes, and micro-interactions are designed in the same pass as layout/color.
- Tokens first: define the \`motion:\` scale (durations + easings) in DESIGN.md front matter together with colors/typography, project it into tokens.css, and use ONLY \`var(--motion-*)\` values in pages — magic durations/easings are forbidden, exactly like magic colors.
- Declarative only: build motion with CSS transitions / CSS animations (or the Web Animations API when needed) — NEVER rAF/setInterval tick loops. The review tooling can only control declarative animations.
- Playback runtime: every screen includes \`<script src="../motion.js"></script>\` just before \`</body>\` (pages at the prototype root use \`src="motion.js"\`). The file is auto-generated and refreshed by the tooling — never write or edit it yourself.
- Inventory: keep \`## Motion\` in DESIGN.md listing per screen what moves: trigger → element/properties → duration/easing (e.g. "screens/home.html — entrance: hero card fades in + slides up 12px, normal/standard").
- Reduced motion: every page carries \`@media (prefers-reduced-motion: reduce)\` that skips or shortens its animations.
- Restraint: animate transform/opacity by default (compositor-friendly), keep counts small, durations short; nothing should loop unless it is a progress/spinner affordance.

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
4. **SELF-REVIEW**: per screen, call design_render → critique the screenshot → fix → re-render, at most 3 rounds per screen; use design_status along the way to keep the screen list and stage current.${extraViewports ? " Extra check viewports are configured: after a screen passes at the primary viewport, render it once at each extra viewport (pass the viewport argument to design_render) and confirm the layout holds." : ""} Screenshots show the SETTLED end state; to check a motion mid-flight, render at a time offset (design_render \`atMs\` / CLI \`--at <ms>\`, e.g. 150) and confirm the intermediate frame, then read the animation CSS against the \`## Motion\` inventory (timing, easing, reduced-motion).
5. **REVIEW**: when every screen has passed self-review, call design_review to open the human review page and **end the turn immediately**; wait for the human verdict — never start implementing on your own. The review page can PLAY motion (↺ replay, pause, ½×/¼× slow-mo) — motion is part of what the human judges.
6. **IMPLEMENT**: implement to spec from prototype + tokens.css for the configured target; on conflict, fix the implementation, never the prototype; after each screen, self-check against its latest screenshot (if the current model cannot view images, do a token-by-token code audit instead and say so); finish with design_status {"stage":"done"}.

## IMPLEMENT translation rules (target: ${config.target})
${IMPLEMENT_TARGET_RULES[config.target]}

## Stage discipline
- Every stage transition must be persisted (design_status).
- After REVIEW, user messages = review verdict (approval → IMPLEMENT; comments → BUILD).
- ${ANNOTATION_GUIDELINE}
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
		"Motion is part of the design: durations/easings via var(--motion-*) only, declarative CSS/WAAPI animations only, screens include ../motion.js (playback runtime), prefers-reduced-motion fallback, inventory in ## Motion; verify mid-animation with design_render atMs.",
		"A user message after REVIEW is the review verdict: approval → design_status {\"stage\":\"implement\"}; comments → design_status {\"stage\":\"build\"}.",
		ANNOTATION_GUIDELINE,
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
		comment?.includes("Element annotations (") ? ANNOTATION_GUIDELINE : "",
		"Back to BUILD: revise the affected screens in .design/prototype per the feedback (still consuming tokens.css only), re-run SELF-REVIEW (design_render, ≤3 rounds/screen), then call design_review to submit again.",
	]
		.filter(Boolean)
		.join("\n");
}
