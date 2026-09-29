/**
 * Validates the built-in DESIGN.md presets (presets/*.md + presets/index.json):
 * every preset must lint clean (0 errors, 0 warnings) against its own
 * deterministic tokens.css projection and expose the SAME token names, so a
 * prototype built on one preset keeps working when another is swapped in.
 * Run: node scripts/check-presets.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import * as path from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { lintDesignMd, projectTokensCss, splitFrontMatter, parseYamlSubset } = await jiti.import(
	path.resolve("extensions/designmd.ts"),
);

const REQUIRED = {
	colors: [
		"primary", "on-primary", "secondary", "on-secondary", "background", "on-background",
		"surface", "on-surface", "surface-variant", "on-surface-variant", "outline",
		"error", "on-error", "success", "on-success", "warning", "on-warning",
	],
	typography: ["display", "h1", "h2", "h3", "body-lg", "body-md", "body-sm", "label", "caption", "code"],
	rounded: ["none", "sm", "md", "lg", "xl", "full"],
	spacing: ["xxs", "xs", "sm", "md", "lg", "xl", "xxl"],
	elevation: ["sm", "md", "lg"],
	"motion.duration": ["fast", "normal", "slow"],
	"motion.easing": ["standard", "enter", "exit"],
	components: ["button-primary", "button-secondary", "input", "card", "chip", "alert-error", "badge-success", "badge-warning"],
};
const TYPE_PROPS = ["fontFamily", "fontSize", "fontWeight", "lineHeight"];
const INDEX_KEYS = ["id", "name", "company", "license", "homepage", "sources", "fonts", "bestFor"];

const dir = path.resolve("presets");
const fail = [];
const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"));
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
const ids = index.map((p) => p.id);
for (const f of files) if (!ids.includes(f)) fail.push(`${f}.md has no index.json entry`);
for (const meta of index) {
	for (const k of INDEX_KEYS) if (!(k in meta)) fail.push(`index.json ${meta.id ?? "?"}: missing "${k}"`);
	if (!Array.isArray(meta.sources) || meta.sources.length === 0) fail.push(`index.json ${meta.id}: sources must list the official files used`);
	const file = path.join(dir, `${meta.id}.md`);
	if (!existsSync(file)) {
		fail.push(`${meta.id}: presets/${meta.id}.md missing`);
		continue;
	}
	const md = readFileSync(file, "utf8");
	let css;
	try {
		css = projectTokensCss(md);
	} catch (e) {
		fail.push(`${meta.id}: projection failed (${e.message})`);
		continue;
	}
	const report = lintDesignMd(md, css);
	for (const f of report.findings) if (f.severity !== "info") fail.push(`${meta.id}: [${f.severity}] ${f.rule}: ${f.message}`);
	const tree = parseYamlSubset(splitFrontMatter(md).frontMatter ?? "");
	for (const [group, names] of Object.entries(REQUIRED)) {
		const node = group.split(".").reduce((n, k) => (n && typeof n === "object" ? n[k] : undefined), tree);
		if (!node || typeof node !== "object") {
			fail.push(`${meta.id}: missing group ${group}`);
			continue;
		}
		for (const n of names) if (!(n in node)) fail.push(`${meta.id}: missing ${group}.${n}`);
		const extra = Object.keys(node).filter((k) => !names.includes(k));
		if (extra.length) fail.push(`${meta.id}: ${group} has non-standard keys ${extra.join(", ")} (keep token names identical across presets)`);
	}
	if (/\\/.test(css)) fail.push(`${meta.id}: projected tokens.css contains a backslash (unparsed YAML escape)`);
	for (const t of REQUIRED.typography) {
		const def = tree.typography?.[t];
		if (def && typeof def === "object") for (const p of TYPE_PROPS) if (!(p in def)) fail.push(`${meta.id}: typography.${t}.${p} missing`);
	}
	const body = splitFrontMatter(md).body;
	if (!body.includes(meta.homepage)) fail.push(`${meta.id}: body must cite the homepage URL in ## Overview`);
	if (!/not affiliated with/i.test(body)) fail.push(`${meta.id}: body must state "not affiliated with ${meta.company}"`);
	console.log(`${meta.id}: ${report.errors} errors, ${report.warnings} warnings`);
}
if (fail.length) {
	console.log(fail.map((f) => `FAIL ${f}`).join("\n"));
	console.log("CHECK-PRESETS: FAILED");
	process.exit(1);
}
console.log("CHECK-PRESETS: ALL PASS");
