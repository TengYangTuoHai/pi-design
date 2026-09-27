/**
 * DESIGN.md support — Google Labs' format specification for describing a
 * visual identity to coding agents (github.com/google-labs-code/design.md).
 *
 * A spec file is YAML front matter (normative design tokens) + markdown body
 * (rationale in canonical section order). This module parses the token schema
 * subset the workflow needs and lints the file so the human gate can enforce
 * internal consistency mechanically:
 *   - front matter present & parseable, token refs resolve      (errors)
 *   - duplicate sections                                        (errors)
 *   - primary color / typography present, section order,
 *     orphaned colors, WCAG AA contrast, tokens.css sync        (warnings)
 */

export interface Finding {
	rule: string;
	severity: "error" | "warning" | "info";
	message: string;
}

export interface LintReport {
	findings: Finding[];
	errors: number;
	warnings: number;
}

type YamlNode = { [key: string]: string | YamlNode };

const CANONICAL_SECTIONS = [
	"overview",
	"colors",
	"typography",
	"layout",
	"elevation & depth",
	"shapes",
	"components",
	"do's and don'ts",
];
const SECTION_ALIASES: Record<string, string> = {
	"brand & style": "overview",
	elevation: "elevation & depth",
	"layout & spacing": "layout",
};

// ---------------------------------------------------------------------------
// Minimal YAML subset parser: nested maps of scalars, 2-space-ish indentation.
// Covers the DESIGN.md token schema (no lists, anchors, or multiline strings).
// ---------------------------------------------------------------------------

export function splitFrontMatter(md: string): { frontMatter?: string; body: string } {
	if (!md.startsWith("---")) return { body: md };
	const lines = md.split(/\r?\n/);
	let end = -1;
	for (let i = 1; i < lines.length; i += 1) {
		const candidate = lines[i];
		if (candidate !== undefined && /^---\s*$/.test(candidate)) {
			end = i;
			break;
		}
	}
	if (end === -1) return { body: md };
	return { frontMatter: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}

function top(stack: Array<{ indent: number; node: YamlNode }>): { indent: number; node: YamlNode } {
	const t = stack[stack.length - 1];
	if (t === undefined) throw new Error("parser bug: empty stack");
	return t;
}

/** Parses the token-schema YAML subset; throws on structural breakage. */
export function parseYamlSubset(text: string): YamlNode {
	const root: YamlNode = {};
	const stack: Array<{ indent: number; node: YamlNode }> = [{ indent: -1, node: root }];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/(^|\s)#.*$/, "$1").trimEnd();
		if (!line.trim()) continue;
		const match = /^(\s*)([\w][\w .-]*?)\s*:\s*(.*)$/.exec(line);
		const indentStr = match?.[1];
		const key = match?.[2];
		const rawValue = match?.[3];
		if (indentStr === undefined || key === undefined || rawValue === undefined) {
			throw new Error(`unparsable line: ${rawLine.trim()}`);
		}
		const indent = indentStr.length;
		while (stack.length > 1 && indent <= top(stack).indent) stack.pop();
		if (rawValue.trim()) {
			top(stack).node[key] = stripScalar(rawValue);
		} else {
			const child: YamlNode = {};
			top(stack).node[key] = child;
			stack.push({ indent, node: child });
		}
	}
	return root;
}

function stripScalar(value: string): string {
	const v = value.trim();
	if (
		(v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
		(v.startsWith("'") && v.endsWith("'") && v.length >= 2)
	) {
		return v.slice(1, -1);
	}
	return v;
}

/** Splits "{colors.primary}" into segments; null when not a reference. */
function refPath(value: string): string[] | null {
	const m = /^\{\s*([^}]+?)\s*\}$/.exec(value.trim());
	const inner = m?.[1];
	return inner ? inner.trim().split(".") : null;
}

function resolvePath(root: YamlNode, segments: string[]): string | YamlNode | undefined {
	let cur: string | YamlNode | undefined = root;
	for (const seg of segments) {
		if (!cur || typeof cur === "string") return undefined;
		cur = cur[seg];
	}
	return cur;
}

/** Flattens the token tree into leaf paths ("colors.primary" → "#1A1C1E"). */
function flattenTokens(node: YamlNode, prefix: string[] = []): Array<{ path: string[]; value: string }> {
	const out: Array<{ path: string[]; value: string }> = [];
	for (const [key, val] of Object.entries(node)) {
		if (typeof val === "string") out.push({ path: [...prefix, key], value: val });
		else out.push(...flattenTokens(val, [...prefix, key]));
	}
	return out;
}

/** Deterministic DESIGN.md-token → CSS-custom-property projection. */
export function cssVarName(path: string[]): string {
	const [group, second, third] = path;
	const propAliases: Record<string, string> = {
		fontFamily: "family",
		fontSize: "size",
		fontWeight: "weight",
		lineHeight: "line-height",
		letterSpacing: "tracking",
		fontFeature: "feature",
		fontVariation: "variation",
		backgroundColor: "background",
		textColor: "text",
	};
	if (group === "colors") return `--color-${second}`;
	if (group === "typography") return `--type-${second}-${propAliases[third ?? ""] ?? third}`;
	if (group === "rounded") return `--rounded-${second}`;
	if (group === "spacing") return `--spacing-${second}`;
	if (group === "components") return `--component-${second}-${propAliases[third ?? ""] ?? third}`;
	return `--${path.join("-")}`;
}

// ---------------------------------------------------------------------------
// WCAG contrast (hex / rgb literals only; other formats are skipped silently)
// ---------------------------------------------------------------------------

function parseColor(value: string): { r: number; g: number; b: number } | undefined {
	const v = value.trim().toLowerCase();
	let m = /^#([0-9a-f]{3})$/.exec(v);
	if (m?.[1]) {
		const parts = m[1].split("").map((c) => parseInt(c + c, 16));
		const [r, g, b] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
		return { r, g, b };
	}
	m = /^#([0-9a-f]{6})$/.exec(v);
	const hex6 = m?.[1];
	if (hex6) {
		return {
			r: parseInt(hex6.slice(0, 2), 16),
			g: parseInt(hex6.slice(2, 4), 16),
			b: parseInt(hex6.slice(4, 6), 16),
		};
	}
	m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
	const nums = m?.slice(1, 4).map(Number) ?? [];
	if (nums.length === 3) return { r: nums[0] ?? 0, g: nums[1] ?? 0, b: nums[2] ?? 0 };
	return undefined;
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
	const ch = [r, g, b].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	const [lr, lg, lb] = [ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0];
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(a: string, b: string): number | undefined {
	const ca = parseColor(a);
	const cb = parseColor(b);
	if (!ca || !cb) return undefined;
	const la = luminance(ca);
	const lb = luminance(cb);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

export function lintDesignMd(md: string | undefined, tokensCss: string | undefined): LintReport {
	const findings: Finding[] = [];
	const add = (rule: string, severity: Finding["severity"], message: string) =>
		findings.push({ rule, severity, message });

	if (md === undefined) {
		add("missing-file", "warning", "DESIGN.md not found; create a spec-compliant one during BRIEF");
		return report(findings);
	}

	const { frontMatter, body } = splitFrontMatter(md);
	if (!frontMatter || !frontMatter.trim()) {
		add("front-matter", "error", "no YAML front matter — migrate to the DESIGN.md spec (tokens in front matter, rationale in prose)");
		return report(findings);
	}

	let tree: YamlNode;
	try {
		tree = parseYamlSubset(frontMatter);
	} catch (error) {
		add("front-matter", "error", `front matter does not parse (${(error as Error).message})`);
		return report(findings);
	}

	// broken references + collect resolvable literal values
	for (const { path, value } of flattenTokens(tree)) {
		const ref = refPath(value);
		if (!ref) continue;
		if (resolvePath(tree, ref) === undefined) {
			add("broken-ref", "error", `{${ref.join(".")}} (from ${path.join(".")}) does not resolve to any token`);
		}
	}

	// schema health
	const colors = tree.colors && typeof tree.colors !== "string" ? tree.colors : undefined;
	const typography = tree.typography && typeof tree.typography !== "string" ? tree.typography : undefined;
	if (colors && !("primary" in colors)) {
		add("missing-primary", "warning", "colors defined but no `primary` — agents would have to invent one");
	}
	if (colors && !typography) {
		add("missing-typography", "warning", "colors defined but no typography tokens");
	}

	// orphaned colors: never referenced by any component token
	if (colors && tree.components && typeof tree.components !== "string") {
		const referenced = new Set<string>();
		for (const { value } of flattenTokens(tree.components)) {
			const ref = refPath(value);
			if (ref) referenced.add(ref.join("."));
		}
		for (const name of Object.keys(colors)) {
			if (!referenced.has(`colors.${name}`)) {
				add("orphaned-tokens", "warning", `colors.${name} is never referenced by any component`);
			}
		}
	}

	// sections: duplicates error, canonical order warning
	const headings: string[] = [];
	for (const line of body.split(/\r?\n/)) {
		const m = /^##\s+(.+?)\s*$/.exec(line);
		const text = m?.[1];
		if (text) headings.push(text.trim().toLowerCase());
	}
	const seen = new Map<string, number>();
	const canonSeen: string[] = [];
	headings.forEach((h, i) => {
		const canon = CANONICAL_SECTIONS.includes(h) ? h : (SECTION_ALIASES[h] ?? null);
		if (canon) {
			if (seen.has(canon)) add("duplicate-section", "error", `section "## ${headings[i]}" appears more than once`);
			seen.set(canon, i);
			canonSeen.push(canon);
		}
	});
	for (let i = 1; i < canonSeen.length; i += 1) {
		const cur = canonSeen[i];
		const prev = canonSeen[i - 1];
		if (cur !== undefined && prev !== undefined && CANONICAL_SECTIONS.indexOf(cur) < CANONICAL_SECTIONS.indexOf(prev)) {
			add("section-order", "warning", `section "${cur}" is out of canonical order`);
			break;
		}
	}

	// WCAG AA contrast on component text/background pairs
	if (tree.components && typeof tree.components !== "string") {
		for (const [name, def] of Object.entries(tree.components)) {
			if (typeof def !== "object") continue;
			const text = def.textColor;
			const bg = def.backgroundColor;
			if (typeof text !== "string" || typeof bg !== "string") continue;
			const textVal = refPath(text) ? (resolvePath(tree, refPath(text)!) as unknown) : text;
			const bgVal = refPath(bg) ? (resolvePath(tree, refPath(bg)!) as unknown) : bg;
			if (typeof textVal !== "string" || typeof bgVal !== "string") continue;
			const ratio = contrastRatio(textVal, bgVal);
			if (ratio !== undefined && ratio < 4.5) {
				add("contrast-ratio", "warning", `components.${name}: text/background contrast ${ratio.toFixed(2)}:1 is below WCAG AA (4.5:1)`);
			}
		}
	}

	// tokens.css sync: every front-matter token should project to a CSS var
	if (tokensCss !== undefined) {
		const declared = new Set([...tokensCss.matchAll(/--[\w-]+/g)].map((m2) => m2[0]));
		const groups = ["colors", "typography", "rounded", "spacing", "components"];
		for (const group of groups) {
			const sub = tree[group];
			if (!sub || typeof sub === "string") continue;
			for (const { path } of flattenTokens(sub as YamlNode, [group])) {
				const cssVar = cssVarName(path);
				if (!declared.has(cssVar)) {
					add("tokens-sync", "warning", `tokens.css is missing ${cssVar} (projection of ${path.join(".")})`);
				}
			}
		}
	}

	return report(findings);
}

function report(findings: Finding[]): LintReport {
	return {
		findings,
		errors: findings.filter((f) => f.severity === "error").length,
		warnings: findings.filter((f) => f.severity === "warning").length,
	};
}
