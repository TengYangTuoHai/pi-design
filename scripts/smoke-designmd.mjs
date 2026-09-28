/**
 * Unit tests for extensions/designmd.ts (DESIGN.md spec parser + linter).
 * Run: node scripts/smoke-designmd.mjs
 */
import { createJiti } from "jiti";
import * as path from "node:path";
import assert from "node:assert/strict";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const m = await jiti.import(path.resolve("extensions/designmd.ts"));

const COMPLIANT = `---
name: Heritage
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
  on-tertiary: "#FFFFFF"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: 12px
  app-bar:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
  caption:
    textColor: "{colors.secondary}"
---

## Overview
Premium matte broadsheet.

## Colors
Single accent driver.

## Typography
Public Sans everywhere.

## Layout
Generous margins.

## Elevation & Depth
Flat, hairline borders.

## Shapes
Slightly rounded.

## Components
Boston Clay CTAs.

## Do's and Don'ts
Do restrain; don't gradient.
`;

const FULL_TOKENS_CSS = `:root {
	--color-primary: #1A1C1E;
	--color-secondary: #6C7278;
	--color-tertiary: #B8422E;
	--color-neutral: #F7F5F2;
	--color-on-tertiary: #FFFFFF;
	--type-h1-family: "Public Sans";
	--type-h1-size: 3rem;
	--type-body-md-family: "Public Sans";
	--type-body-md-size: 1rem;
	--rounded-sm: 4px;
	--rounded-md: 8px;
	--spacing-sm: 8px;
	--spacing-md: 16px;
	--component-button-primary-background: var(--color-tertiary);
	--component-button-primary-text: var(--color-on-tertiary);
	--component-button-primary-rounded: var(--rounded-sm);
	--component-button-primary-padding: 12px;
	--component-app-bar-background: var(--color-neutral);
	--component-app-bar-text: var(--color-primary);
	--component-caption-text: var(--color-secondary);
}
`;

const results = [];
let failed = false;
const check = (name, fn) => {
	try {
		fn();
		results.push(`PASS ${name}`);
	} catch (error) {
		failed = true;
		results.push(`FAIL ${name}: ${error.message}`);
	}
};

check("cssVarName projection mapping", () => {
	assert.equal(m.cssVarName(["colors", "primary"]), "--color-primary");
	assert.equal(m.cssVarName(["typography", "h1", "fontSize"]), "--type-h1-size");
	assert.equal(m.cssVarName(["typography", "body-md", "letterSpacing"]), "--type-body-md-tracking");
	assert.equal(m.cssVarName(["rounded", "md"]), "--rounded-md");
	assert.equal(m.cssVarName(["spacing", "sm"]), "--spacing-sm");
	assert.equal(m.cssVarName(["motion", "duration", "fast"]), "--motion-duration-fast");
	assert.equal(m.cssVarName(["motion", "easing", "spring"]), "--motion-easing-spring");
	assert.equal(
		m.cssVarName(["components", "button-primary", "backgroundColor"]),
		"--component-button-primary-background",
	);
});

check("contrastRatio basics", () => {
	const bw = m.contrastRatio("#000000", "#FFFFFF");
	assert.ok(Math.abs(bw - 21) < 0.5, `black/white ≈ 21, got ${bw}`);
	assert.equal(m.contrastRatio("oklch(62% 0.18 250)", "#fff"), undefined, "unsupported format skipped");
});

check("compliant file: 0 errors, 0 warnings", () => {
	const r = m.lintDesignMd(COMPLIANT, FULL_TOKENS_CSS);
	assert.equal(r.errors, 0, JSON.stringify(r.findings));
	assert.equal(r.warnings, 0, JSON.stringify(r.findings));
});

check("missing file → warning only (gate not blocked)", () => {
	const r = m.lintDesignMd(undefined, undefined);
	assert.equal(r.errors, 0);
	assert.equal(r.warnings, 1);
	assert.equal(r.findings[0].rule, "missing-file");
});

check("legacy prose-only file → front-matter error", () => {
	const r = m.lintDesignMd("# Brand\n温暖极简。\n", undefined);
	assert.equal(r.errors, 1);
	assert.equal(r.findings[0].rule, "front-matter");
});

check("broken token ref → error", () => {
	const md = COMPLIANT.replace("{colors.tertiary}", "{colors.accent}");
	const r = m.lintDesignMd(md, FULL_TOKENS_CSS);
	assert.ok(r.errors >= 1);
	assert.ok(r.findings.some((f) => f.rule === "broken-ref"));
});

check("duplicate section → error", () => {
	const md = COMPLIANT.replace("## Do's and Don'ts", "## Colors");
	const r = m.lintDesignMd(md, FULL_TOKENS_CSS);
	assert.ok(r.findings.some((f) => f.rule === "duplicate-section"));
});

check("out-of-order sections → warning", () => {
	const md = COMPLIANT.replace("## Typography\nPublic Sans everywhere.\n\n", "")
		.replace("## Do's and Don'ts", "## Typography\nPublic Sans everywhere.\n\n## Do's and Don'ts");
	const r = m.lintDesignMd(md, FULL_TOKENS_CSS);
	assert.ok(r.findings.some((f) => f.rule === "section-order"));
	assert.equal(r.errors, 0);
});

check("low contrast pair → warning", () => {
	const md = COMPLIANT.replace('on-tertiary: "#FFFFFF"', 'on-tertiary: "#B8422E"');
	const r = m.lintDesignMd(md, FULL_TOKENS_CSS);
	assert.ok(r.findings.some((f) => f.rule === "contrast-ratio" && f.message.includes("button-primary")));
});

check("tokens.css out of sync → warning per missing var", () => {
	const r = m.lintDesignMd(COMPLIANT, ":root { --color-primary: #1A1C1E; }");
	const sync = r.findings.filter((f) => f.rule === "tokens-sync");
	assert.ok(sync.length > 10, `expected many sync warnings, got ${sync.length}`);
	assert.ok(sync.some((f) => f.message.includes("--component-button-primary-background")));
	assert.equal(r.errors, 0);
});

check("yaml subset parser handles quoted/hash values + nesting", () => {
	const { frontMatter } = m.splitFrontMatter(COMPLIANT);
	const tree = m.parseYamlSubset(frontMatter);
	assert.equal(tree.colors.primary, "#1A1C1E");
	assert.equal(tree.typography["h1"].fontSize, "3rem");
	assert.equal(tree.components["button-primary"].backgroundColor, "{colors.tertiary}");
	assert.equal(tree.spacing.sm, "8px");
});

// ---- motion token group ------------------------------------------------------

const WITH_MOTION = COMPLIANT.replace(
	"components:\n",
	`motion:
  duration:
    fast: 150ms
    normal: 300ms
  easing:
    standard: cubic-bezier(0.2, 0, 0, 1)
components:
`,
).replace(
	"## Shapes",
	`## Motion
Entrances slide+fade 12px on normal/standard; hover tint 150ms fast.
Respects prefers-reduced-motion: animations collapse to the final state.

## Shapes`,
);
const WITH_MOTION_CSS = FULL_TOKENS_CSS.replace(
	/\}\s*$/,
	`\t--motion-duration-fast: 150ms;
	--motion-duration-normal: 300ms;
	--motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
}
`,
);

check("motion tokens + Motion section + sync'd css: clean", () => {
	const r = m.lintDesignMd(WITH_MOTION, WITH_MOTION_CSS);
	assert.equal(r.errors, 0, JSON.stringify(r.findings));
	assert.equal(r.warnings, 0, JSON.stringify(r.findings));
});

check("motion tokens without ## Motion section → warning", () => {
	const md = WITH_MOTION.replace(
		`## Motion
Entrances slide+fade 12px on normal/standard; hover tint 150ms fast.
Respects prefers-reduced-motion: animations collapse to the final state.

`,
		"",
	);
	const r = m.lintDesignMd(md, WITH_MOTION_CSS);
	assert.equal(r.errors, 0);
	assert.ok(r.findings.some((f) => f.rule === "motion-section"));
});

check("## Motion without reduced-motion note → warning", () => {
	const md = WITH_MOTION.replace(
		"Respects prefers-reduced-motion: animations collapse to the final state.",
		"Everything eases in.",
	);
	const r = m.lintDesignMd(md, WITH_MOTION_CSS);
	assert.ok(r.findings.some((f) => f.rule === "motion-reduced"));
	assert.equal(r.errors, 0);
});

check("malformed motion values → warning", () => {
	const md = WITH_MOTION.replace("fast: 150ms", "fast: instant");
	const r = m.lintDesignMd(md, WITH_MOTION_CSS);
	assert.ok(r.findings.some((f) => f.rule === "motion-token-value" && f.message.includes("duration.fast")));
	assert.equal(r.errors, 0);
});

check("tokens.css missing motion vars → sync warning", () => {
	const r = m.lintDesignMd(WITH_MOTION, FULL_TOKENS_CSS);
	const sync = r.findings.filter((f) => f.rule === "tokens-sync");
	assert.ok(sync.some((f) => f.message.includes("--motion-duration-fast")));
	assert.ok(sync.some((f) => f.message.includes("--motion-easing-standard")));
	assert.equal(r.errors, 0);
});

check("motion alias headings canonicalize", () => {
	const md = WITH_MOTION.replace("## Motion", "## Motion & Animation");
	const r = m.lintDesignMd(md, WITH_MOTION_CSS);
	assert.ok(!r.findings.some((f) => f.rule === "motion-section"), "alias should count as the Motion section");
	assert.ok(!r.findings.some((f) => f.rule === "duplicate-section"));
});

console.log(results.join("\n"));
console.log(failed ? "SMOKE-DESIGNMD: FAILED" : "SMOKE-DESIGNMD: ALL PASS");
if (failed) process.exit(1);
