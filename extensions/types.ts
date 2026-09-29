/**
 * Shared types and .design/ project conventions for the pi-design extension.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export type DesignTarget = "swiftui" | "react" | "web";

/** Unit of work: a whole app/page flow, or a single component (+ its variants). */
export type DesignScope = "app" | "component";

export type DesignStage =
	| "brief"
	| "plan"
	| "build"
	| "self-review"
	| "review"
	| "implement"
	| "done";

export interface Viewport {
	width: number;
	height: number;
}

export interface DesignConfig {
	target: DesignTarget;
	viewport: Viewport;
	/** Extra self-review viewports (responsive checks), beyond the primary one. */
	viewports: Viewport[];
	/** Optional fallback vision-reviewer model id for models without image input. */
	reviewerModel?: string | undefined;
}

export interface DesignState {
	active: boolean;
	stage: DesignStage;
	/** Workflow scope: whole app/page ("app") or a single component ("component"). */
	scope: DesignScope;
	brief?: string | undefined;
	/** Screen files relative to .design/prototype/, e.g. "screens/login.html". */
	screens: string[];
	reviewRound: number;
	/** Built-in DESIGN.md preset id applied to this workflow (presets/index.json), if any. */
	preset?: string | undefined;
	/** Stable review-gate token: the review URL stays fixed across rounds. */
	reviewToken?: string | undefined;
	updatedAt: string;
}

export interface DesignPaths {
	/** <cwd>/.design */
	root: string;
	configFile: string;
	stateFile: string;
	prototypeDir: string;
	shotsDir: string;
}

export const DESIGN_TOOL_NAMES = ["design_render", "design_review", "design_status", "design_preset"] as const;

export const DEFAULT_VIEWPORT: Viewport = { width: 390, height: 844 };

export function designPaths(cwd: string): DesignPaths {
	const root = path.join(cwd, ".design");
	return {
		root,
		configFile: path.join(root, "config.json"),
		stateFile: path.join(root, "state.json"),
		prototypeDir: path.join(root, "prototype"),
		shotsDir: path.join(root, "shots"),
	};
}

/** Tolerant JSON reader: missing or corrupt files return undefined. */
export function readJson(file: string): unknown {
	try {
		if (!existsSync(file)) return undefined;
		return JSON.parse(readFileSync(file, "utf8")) as unknown;
	} catch {
		return undefined;
	}
}

/** JSON writer that creates parent directories. */
export function writeJson(file: string, data: unknown): void {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
}

function asViewport(value: unknown): Viewport | undefined {
	if (Array.isArray(value) && value.length === 2) {
		const [w, h] = value as [unknown, unknown];
		if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
			return { width: Math.round(w), height: Math.round(h) };
		}
	}
	if (value && typeof value === "object") {
		const v = value as { width?: unknown; height?: unknown };
		if (typeof v.width === "number" && typeof v.height === "number" && v.width > 0 && v.height > 0) {
			return { width: Math.round(v.width), height: Math.round(v.height) };
		}
	}
	return undefined;
}

/** Loads .design/config.json with defaults; tolerates [w,h] arrays or {width,height}. */
export function loadConfig(cwd: string): DesignConfig {
	const paths = designPaths(cwd);
	const raw = readJson(paths.configFile);
	const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const target =
		obj.target === "swiftui" || obj.target === "react" || obj.target === "web" ? obj.target : "web";
	const viewports = Array.isArray(obj.viewports)
		? obj.viewports
				.map((v) => asViewport(v))
				.filter((v): v is Viewport => v !== undefined)
				.slice(0, 3)
		: [];
	return {
		target,
		viewport: asViewport(obj.viewport) ?? DEFAULT_VIEWPORT,
		viewports,
		reviewerModel: typeof obj.reviewerModel === "string" ? obj.reviewerModel : undefined,
	};
}

/** Loads .design/state.json with defaults for a fresh session. */
export function loadState(cwd: string): DesignState {
	const paths = designPaths(cwd);
	const raw = readJson(paths.stateFile);
	const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const screens = Array.isArray(obj.screens)
		? obj.screens.filter((s): s is string => typeof s === "string")
		: [];
	const stages: DesignStage[] = [
		"brief",
		"plan",
		"build",
		"self-review",
		"review",
		"implement",
		"done",
	];
	const stage = stages.includes(obj.stage as DesignStage) ? (obj.stage as DesignStage) : "brief";
	return {
		active: obj.active === true,
		stage,
		scope: obj.scope === "component" ? "component" : "app",
		brief: typeof obj.brief === "string" ? obj.brief : undefined,
		screens,
		reviewRound: typeof obj.reviewRound === "number" ? obj.reviewRound : 0,
		preset: typeof obj.preset === "string" ? obj.preset : undefined,
		reviewToken: typeof obj.reviewToken === "string" ? obj.reviewToken : undefined,
		updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
	};
}

export function saveState(cwd: string, state: DesignState): void {
	const paths = designPaths(cwd);
	state.updatedAt = new Date().toISOString();
	writeJson(paths.stateFile, state);
}
