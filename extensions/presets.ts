/**
 * Built-in DESIGN.md presets.
 *
 * presets/<id>.md are complete DESIGN.md files whose token values come from
 * big-company open-source design systems (Material 3, Fluent 2, Carbon,
 * Primer, Spectrum), all mapped onto ONE standard set of token names
 * (enforced by scripts/check-presets.mjs) so screens survive a preset swap.
 * presets/index.json carries attribution, sources, fonts and a one-line
 * "bestFor" the workflow prompt uses to auto-pick a preset when the user has
 * no design direction.
 *
 * Applying a preset writes .design/DESIGN.md plus its deterministic
 * tokens.css projection; an existing DESIGN.md is never overwritten unless
 * forced (the user's identity always wins).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { projectTokensCss } from "./designmd.ts";

export interface PresetMeta {
	id: string;
	name: string;
	company: string;
	license: string;
	homepage: string;
	sources: string[];
	fonts: { sans: string; mono: string; googleFontsCss: string | null };
	bestFor: string;
}

export const PRESETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "presets");

export function listPresets(dir: string = PRESETS_DIR): PresetMeta[] {
	const file = path.join(dir, "index.json");
	if (!existsSync(file)) return [];
	return JSON.parse(readFileSync(file, "utf8")) as PresetMeta[];
}

export function findPreset(id: string, dir: string = PRESETS_DIR): PresetMeta | undefined {
	return listPresets(dir).find((p) => p.id === id.trim().toLowerCase());
}

/** One line per preset, for prompts and CLI listings. */
export function presetCatalog(dir: string = PRESETS_DIR): string {
	return listPresets(dir)
		.map((p) => `- ${p.id} — ${p.name} (${p.company}): ${p.bestFor}`)
		.join("\n");
}

export interface ApplyResult {
	preset: PresetMeta;
	designMd: string;
	tokensCss: string;
	/** Backup of the DESIGN.md that a forced apply replaced. */
	backup?: string | undefined;
}

/**
 * Copies presets/<id>.md to <designDir>/DESIGN.md and writes the projected
 * tokens.css. Throws on an unknown id, or when DESIGN.md already exists and
 * `force` is not set; with `force`, the replaced DESIGN.md / tokens.css are
 * kept as *.bak next to them.
 */
export function applyPreset(
	designDir: string,
	id: string,
	options: { force?: boolean; dir?: string } = {},
): ApplyResult {
	const dir = options.dir ?? PRESETS_DIR;
	const preset = findPreset(id, dir);
	if (!preset) {
		const known = listPresets(dir).map((p) => p.id).join(", ") || "(none installed)";
		throw new Error(`unknown preset "${id}" — available: ${known}`);
	}
	const designMd = path.join(designDir, "DESIGN.md");
	if (existsSync(designMd) && !options.force) {
		throw new Error(
			`${designMd} already exists — the project's own identity wins; pass force to replace it with the ${preset.id} preset`,
		);
	}
	const md = readFileSync(path.join(dir, `${preset.id}.md`), "utf8");
	const css = projectTokensCss(md);
	mkdirSync(designDir, { recursive: true });
	const tokensCss = path.join(designDir, "tokens.css");
	let backup: string | undefined;
	if (existsSync(designMd)) {
		backup = `${designMd}.bak`;
		copyFileSync(designMd, backup);
		if (existsSync(tokensCss)) copyFileSync(tokensCss, `${tokensCss}.bak`);
	}
	writeFileSync(designMd, md, "utf8");
	writeFileSync(tokensCss, css, "utf8");
	return { preset, designMd, tokensCss, backup };
}

/**
 * Regenerates <designDir>/tokens.css from the current DESIGN.md front matter
 * (after the model tunes a preset, or edits its own identity). Returns the
 * tokens.css path; throws when DESIGN.md is missing or does not project.
 */
export function syncTokens(designDir: string): string {
	const designMd = path.join(designDir, "DESIGN.md");
	if (!existsSync(designMd)) throw new Error(`${designMd} not found — apply a preset or author DESIGN.md first`);
	const tokensCss = path.join(designDir, "tokens.css");
	writeFileSync(tokensCss, projectTokensCss(readFileSync(designMd, "utf8")), "utf8");
	return tokensCss;
}
