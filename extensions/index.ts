/**
 * pi-design — /design <要求> → 高保真 HTML 原型自我迭代 → 人工审核 → 按 target 实现 UI。
 *
 * 扩展只提供三件事 + 一条审核回流通道；全部流程逻辑在 prompt.ts 的状态机里：
 *   - /design 命令：激活工具并发送工作流提示词（pi.sendUserMessage 触发模型 turn）
 *   - design_render：headless Chrome 截图，图片直接回流模型上下文
 *   - design_review：本地审核服务器 + 浏览器；返回 terminate:true 在人工门处硬停
 *   - design_status：读写 .design/state.json（断点续做）
 *
 * 跨 turn 连续性：工具只在工作流激活时可见（setActiveTools），其 promptGuidelines
 * 携带状态机规则；before_agent_start 每轮注入当前阶段，不依赖会话历史存活。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	DESIGN_TOOL_NAMES,
	designPaths,
	loadConfig,
	loadState,
	saveState,
	type DesignPaths,
	type DesignStage,
} from "./types.ts";
import { captureScreenshot } from "./shot.ts";
import { writeMotionRuntime } from "./motion.ts";
import { lintDesignMd } from "./designmd.ts";
import { startReviewServer, type ReviewServerHandle, type ReviewServerOptions } from "./server.ts";
import {
	RENDER_TOOL_GUIDELINES,
	REVIEW_TOOL_GUIDELINES,
	STATUS_TOOL_GUIDELINES,
	buildWorkflowPrompt,
	gateDecisionMessage,
	stageGuideline,
} from "./prompt.ts";

/** Detached review gate running in its own process (survives this session). */
interface ExternalReview {
	url: string;
	token: string;
	port: number;
	pid: number;
	readyFile: string;
	decisionFile: string;
}

interface DesignSession {
	server: ReviewServerHandle | null;
	/** Active tool names captured before design tools were activated. */
	savedTools: string[] | null;
	external: ExternalReview | null;
	poll: NodeJS.Timeout | null;
}

/** Screen html files relative to .design/prototype/, e.g. ["screens/login.html"]. */
function listScreens(prototypeDir: string): string[] {
	const screensDir = path.join(prototypeDir, "screens");
	if (!existsSync(screensDir)) return [];
	return readdirSync(screensDir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".html"))
		.map((e) => {
			// parentPath may be absolute (platform-dependent) — always relativize.
			const relDir = path.relative(screensDir, e.parentPath ?? ".");
			const rel = relDir === "." ? e.name : path.join(relDir, e.name);
			return path.join("screens", rel).split(path.sep).join("/");
		})
		.sort();
}

function activateTools(pi: ExtensionAPI, session: DesignSession): void {
	const current = pi.getActiveTools();
	if (session.savedTools === null) session.savedTools = current;
	const merged = [...new Set([...current, ...DESIGN_TOOL_NAMES])];
	pi.setActiveTools(merged);
}

function deactivateTools(pi: ExtensionAPI, session: DesignSession): void {
	const restore =
		session.savedTools ?? pi.getActiveTools().filter((t) => !DESIGN_TOOL_NAMES.includes(t as never));
	pi.setActiveTools(restore);
	session.savedTools = null;
}

async function closeServer(session: DesignSession): Promise<void> {
	const server = session.server;
	if (!server) return;
	session.server = null;
	await server.close();
}

// ---------------------------------------------------------------------------
// Detached review gate: the server runs in a child process so the human gate
// stays reachable after this pi process exits (one-shot/print/RPC modes).
// ---------------------------------------------------------------------------

/** Node >= 23 runs .ts directly via native type stripping. */
const EXTERNAL_SUPPORTED = parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 23;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function childScriptFile(): string | undefined {
	try {
		return fileURLToPath(new URL("./review-server-main.ts", import.meta.url));
	} catch {
		return undefined;
	}
}

/**
 * Spawns the review server as a detached child. Returns null (caller falls
 * back to the in-process server) when the runtime can't run TS directly,
 * spawning fails, or the child doesn't come up within 4s.
 */
async function spawnExternalReview(
	opts: ReviewServerOptions,
	paths: DesignPaths,
): Promise<ExternalReview | null> {
	const script = childScriptFile();
	if (!script || !EXTERNAL_SUPPORTED) return null;
	if (process.env.PI_DESIGN_EXTERNAL_SERVER === "0") return null;
	const readyFile = path.join(paths.root, "review-server.json");
	const decisionFile = path.join(paths.root, `review-round-${opts.round}.json`);
	try {
		rmSync(readyFile, { force: true });
	} catch {
		/* ignore */
	}
	let child: ReturnType<typeof spawn> | undefined;
	try {
		child = spawn(
			process.execPath,
			[script, JSON.stringify({ ...opts, decisionFile, readyFile })],
			{ detached: true, stdio: "ignore" },
		);
		child.unref();
	} catch {
		return null;
	}
	for (let i = 0; i < 40 && !existsSync(readyFile); i += 1) {
		await sleep(100);
	}
	if (!existsSync(readyFile)) {
		try {
			child.kill("SIGKILL");
		} catch {
			/* ignore */
		}
		return null;
	}
	try {
		const info = JSON.parse(readFileSync(readyFile, "utf8")) as Omit<ExternalReview, "readyFile" | "decisionFile">;
		return { ...info, readyFile, decisionFile };
	} catch {
		return null;
	}
}

function killExternalReview(session: DesignSession): void {
	if (session.poll) {
		clearInterval(session.poll);
		session.poll = null;
	}
	const ext = session.external;
	session.external = null;
	if (!ext) return;
	try {
		process.kill(ext.pid, "SIGTERM");
	} catch {
		/* already gone */
	}
	try {
		rmSync(ext.readyFile, { force: true });
	} catch {
		/* ignore */
	}
}

/** Applies an on-disk verdict; stale files (workflow moved on) are dropped. */
function applyExternalDecision(
	pi: ExtensionAPI,
	cwd: string,
	file: string,
	round: number,
	decision: string,
	comment: string | undefined,
): void {
	const state = loadState(cwd);
	const cleanUp = () => {
		for (const f of [file, path.join(designPaths(cwd).root, "review-server.json")]) {
			try {
				rmSync(f, { force: true });
			} catch {
				/* ignore */
			}
		}
	};
	if (!state.active || state.stage !== "review" || state.reviewRound !== round) {
		cleanUp();
		return;
	}
	state.stage = decision === "approve" ? "implement" : "build";
	saveState(cwd, state);
	cleanUp();
	pi.sendUserMessage(gateDecisionMessage(decision === "approve" ? "approve" : "reject", comment, round, loadConfig(cwd).target));
}

/** Live-session watcher: polls the decision file the child writes. */
function watchExternalDecision(pi: ExtensionAPI, cwd: string, session: DesignSession): void {
	if (session.poll) clearInterval(session.poll);
	const ext = session.external;
	if (!ext) return;
	const timer = setInterval(() => {
		if (!session.external || !existsSync(ext.decisionFile)) return;
		clearInterval(timer);
		session.poll = null;
		session.external = null; // the child exits on its own after deciding
		try {
			rmSync(ext.readyFile, { force: true });
		} catch {
			/* ignore */
		}
		try {
			const d = JSON.parse(readFileSync(ext.decisionFile, "utf8")) as {
				decision: string;
				comment?: unknown;
				round: number;
			};
			applyExternalDecision(
				pi,
				cwd,
				ext.decisionFile,
				typeof d.round === "number" ? d.round : 0,
				d.decision,
				typeof d.comment === "string" && d.comment ? d.comment : undefined,
			);
		} catch {
			/* ignore */
		}
	}, 1500);
	session.poll = timer;
	timer.unref?.();
}

/** Picks up verdicts that arrived while no session was running. */
function pickUpPendingDecisions(pi: ExtensionAPI, cwd: string): void {
	const paths = designPaths(cwd);
	const files = existsSync(paths.root)
		? readdirSync(paths.root).filter((f) => /^review-round-\d+\.json$/.test(f))
		: [];
	for (const f of files) {
		const file = path.join(paths.root, f);
		try {
			const d = JSON.parse(readFileSync(file, "utf8")) as {
				decision: string;
				comment?: unknown;
				round: number;
			};
			applyExternalDecision(
				pi,
				cwd,
				file,
				typeof d.round === "number" ? d.round : 0,
				d.decision,
				typeof d.comment === "string" && d.comment ? d.comment : undefined,
			);
		} catch {
			try {
				rmSync(file, { force: true });
			} catch {
				/* ignore */
			}
		}
	}
}

/** Best-effort browser open; failing to open is never an error (URL is in the tool result). */
async function openInBrowser(pi: ExtensionAPI, url: string): Promise<void> {
	try {
		if (process.platform === "darwin") {
			await pi.exec("open", [url], { timeout: 5000 });
		} else if (process.platform === "win32") {
			await pi.exec("cmd", ["/c", "start", "", url], { timeout: 5000 });
		} else {
			await pi.exec("xdg-open", [url], { timeout: 5000 });
		}
	} catch {
		/* ignore */
	}
}

/** Keeps only the newest `keep` shots for a screen+viewport key; older iterations are pruned. */
function pruneShots(shotsDir: string, key: string, keep = 3): void {
	try {
		const prefix = `${key}-`;
		const old = readdirSync(shotsDir)
			.filter((f) => f.startsWith(prefix) && /^\d+\.jpe?g$/.test(f.slice(prefix.length)))
			.sort()
			.slice(0, -keep);
		for (const f of old) {
			try {
				rmSync(path.join(shotsDir, f));
			} catch {
				/* best effort */
			}
		}
	} catch {
		/* best effort */
	}
}

/** Newest self-review shot per screen (mtime-based), relative to .design/. */
function latestShots(shotsDir: string, screens: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	try {
		const files = readdirSync(shotsDir).filter(
			(f) => f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png"),
		);
		for (const screen of screens) {
			const base = screen.replace(/\.html?$/, "").split("/").join("-");
			// current naming: <base>@<w>x<h>-<ts>.jpg; legacy: <base>-<ts>.jpg
			const candidates = files.filter(
				(f) =>
					(f.startsWith(`${base}@`) && /^@\d+x\d+-\d+\./.test(f.slice(base.length))) ||
					(f.startsWith(`${base}-`) && /^\d+\./.test(f.slice(base.length + 1))),
			);
			let newest: { file: string; mtime: number } | undefined;
			for (const f of candidates) {
				try {
					const mtime = statSync(path.join(shotsDir, f)).mtimeMs;
					if (!newest || mtime > newest.mtime) newest = { file: f, mtime };
				} catch {
					/* ignore */
				}
			}
			if (newest) result[screen] = `shots/${newest.file}`;
		}
	} catch {
		/* best effort */
	}
	return result;
}

export default function designExtension(pi: ExtensionAPI): void {
	const session: DesignSession = { server: null, savedTools: null, external: null, poll: null };

	pi.on("session_start", (_event, ctx) => {
		// Extension (re)start: keep tool visibility in sync with persisted state.
		const state = loadState(ctx.cwd);
		const active = pi.getActiveTools();
		const hasDesign = active.includes(DESIGN_TOOL_NAMES[0]);
		const shouldHave = state.active && state.stage !== "done";
		if (shouldHave && !hasDesign) {
			activateTools(pi, session);
		} else if (!shouldHave && hasDesign) {
			deactivateTools(pi, session);
		}
		// A verdict may have arrived while no session was running (the external
		// gate survives process exit). Give the session a moment to settle, then
		// inject it exactly like a review-page click. Not unref'd on purpose:
		// in one-shot modes this must fire before the process can exit.
		if (state.active) {
			setTimeout(() => pickUpPendingDecisions(pi, ctx.cwd), 800);
		}
	});

	pi.on("before_agent_start", (event, ctx) => {
		// Stage re-injection: survives compaction, rides the structured prompt delta.
		const state = loadState(ctx.cwd);
		if (!state.active) return;
		event.systemPromptOptions.promptGuidelines.push(stageGuideline(state, loadConfig(ctx.cwd)));
	});

	pi.on("session_shutdown", () => {
		// Close the in-process fallback server but LEAVE the detached gate
		// alive on purpose: the URL must keep working after this process ends.
		void closeServer(session);
	});

	pi.registerCommand("design", {
		description: "高保真原型工作流：/design <设计要求>（/design stop 结束）",
		handler: async (args, ctx) => {
			const brief = args.trim();
			if (!brief) {
				if (ctx.hasUI) ctx.ui.notify("用法：/design <设计要求>；结束工作流：/design stop", "warning");
				return;
			}
			if (brief === "stop") {
				const state = loadState(ctx.cwd);
				state.active = false;
				state.stage = "done";
				state.reviewToken = undefined; // rotate the gate token on workflow end
				saveState(ctx.cwd, state);
				deactivateTools(pi, session);
				await closeServer(session);
				killExternalReview(session);
				if (ctx.hasUI) ctx.ui.notify("/design 工作流已结束", "info");
				return;
			}
			const config = loadConfig(ctx.cwd);
			const state = loadState(ctx.cwd);
			state.active = true;
			state.brief = brief;
			state.stage = "brief";
			saveState(ctx.cwd, state);
			writeMotionRuntime(designPaths(ctx.cwd).prototypeDir); // screens include it for motion playback
			activateTools(pi, session);
			pi.sendUserMessage(buildWorkflowPrompt({ brief, state, config }));
			// One-shot modes (print/text) exit as soon as the command handler returns,
			// which would abort the just-triggered turn. Ride it to completion;
			// interactive/RPC modes are unaffected (waitForIdle just tracks the run).
			await new Promise((resolve) => setTimeout(resolve, 200));
			await ctx.waitForIdle();
		},
	});

	pi.registerTool(
		defineTool({
			name: "design_render",
			label: "Design render",
		description:
			"Render one screen under .design/prototype/ with headless Chrome and return the screenshot to the model for self-review. `page` is a path relative to .design/prototype/ (e.g. screens/login.html).",
		promptGuidelines: RENDER_TOOL_GUIDELINES,
		parameters: Type.Object({
			page: Type.String({ description: "Page path relative to .design/prototype/, e.g. screens/login.html" }),
			viewport: Type.Optional(
				Type.Object({
					width: Type.Integer({ description: "Viewport width (px)" }),
					height: Type.Integer({ description: "Viewport height (px)" }),
				}),
			),
			atMs: Type.Optional(
				Type.Integer({
					description:
						"Capture the page at this time offset after load (ms) instead of the settled end state — pass e.g. 150 to verify an animation mid-flight against DESIGN.md's ## Motion inventory",
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const paths = designPaths(ctx.cwd);
			const config = loadConfig(ctx.cwd);
			const file = path.resolve(paths.prototypeDir, params.page);
			if (!file.startsWith(`${paths.prototypeDir}${path.sep}`)) {
				throw new Error("page must be inside .design/prototype/");
			}
			if (!existsSync(file)) {
				throw new Error(`Cannot find ${file} — create the page during the BUILD stage first`);
			}
			const viewport = params.viewport ?? config.viewport;
			// Normalize whatever the model passed (absolute path, ./screens/x, backslashes…)
			// into a canonical path relative to .design/prototype/.
			const relPage = path.relative(paths.prototypeDir, file).split(path.sep).join("/");
			mkdirSync(paths.shotsDir, { recursive: true });
			const base = relPage.replace(/\.html?$/, "").split("/").join("-");
			// Viewport tag keeps multi-viewport shots from overwriting each other's prune set.
			const shotKey = `${base}@${viewport.width}x${viewport.height}`;
			const outFile = path.join(paths.shotsDir, `${shotKey}-${Date.now()}.jpg`);
			writeMotionRuntime(paths.prototypeDir); // idempotent; screens depend on it existing
			const shot = await captureScreenshot({
				htmlFile: file,
				outFile,
				viewport,
				exec: (command, args, options) => pi.exec(command, args, options),
				signal,
				...(params.atMs !== undefined ? { atMs: params.atMs } : {}),
			});
			const data = readFileSync(shot.file).toString("base64");
			pruneShots(paths.shotsDir, shotKey);
			const state = loadState(ctx.cwd);
			if (!state.screens.includes(relPage)) state.screens.push(relPage);
			if (state.stage === "brief" || state.stage === "plan" || state.stage === "build") {
				state.stage = "self-review";
			}
			saveState(ctx.cwd, state);
			return {
				content: [
					{
						type: "text",
						text: `Rendered ${params.page} @ ${viewport.width}x${viewport.height} (${shot.engine}; screenshot attached${params.atMs !== undefined ? `; captured at t≈${params.atMs}ms for mid-animation review` : "; entrance animations settled"}).\nCheck the screenshot for: alignment, visual hierarchy, whitespace, cross-screen consistency, AI-tells.`,
					},
					{ type: "image", data, mimeType: shot.mimeType },
				],
				details: {
					page: params.page,
					file: shot.file,
					width: shot.width,
					height: shot.height,
					engine: shot.engine,
				},
			};
		},
	}),
	);

	pi.registerTool(
		defineTool({
			name: "design_review",
			label: "Design review",
		description:
			"Open the local human review page (random port + one-time token) and end the current model turn. The verdict (approve/reject + comment) flows back into the session as a user message. Call only after every screen has finished SELF-REVIEW.",
		promptGuidelines: REVIEW_TOOL_GUIDELINES,
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const paths = designPaths(ctx.cwd);
			const config = loadConfig(ctx.cwd);
			const state = loadState(ctx.cwd);
			const screens = listScreens(paths.prototypeDir);
			if (screens.length === 0) {
				throw new Error("No screens under .design/prototype/screens/ to review; finish BUILD first");
			}
			state.stage = "review";
			state.reviewRound += 1;
			// Workflow-stable gate token + fixed port → the review URL never
			// changes across rounds; the browser tab stays valid.
			if (!state.reviewToken || state.reviewToken.length < 32) {
				state.reviewToken = randomBytes(24).toString("hex");
			}
			state.screens = screens;
			saveState(ctx.cwd, state);
			const round = state.reviewRound;
			// Mechanical design-system gate: lint DESIGN.md (Google DESIGN.md
			// spec) before the human looks at it. Errors block the gate.
			const designMdFile = path.join(paths.root, "DESIGN.md");
			const tokensCssFile = path.join(paths.root, "tokens.css");
			const lint = lintDesignMd(
				existsSync(designMdFile) ? readFileSync(designMdFile, "utf8") : undefined,
				existsSync(tokensCssFile) ? readFileSync(tokensCssFile, "utf8") : undefined,
			);
			if (lint.errors > 0) {
				throw new Error(
					`DESIGN.md lint found errors — fix them before opening the human gate:\n${lint.findings
						.filter((f) => f.severity === "error")
						.map((f) => `- [${f.rule}] ${f.message}`)
						.join("\n")}`,
				);
			}
			const lintSummary =
				lint.warnings > 0
					? `\nDESIGN.md lint warnings (visible to the human reviewer; fixing them first is recommended):\n${lint.findings
							.filter((f) => f.severity === "warning")
							.map((f) => `- [${f.rule}] ${f.message}`)
							.join("\n")}`
					: "\nDESIGN.md lint: clean.";
			writeMotionRuntime(paths.prototypeDir); // review page plays motion through it
			await closeServer(session); // fresh round → fresh server process, stable URL
			killExternalReview(session);
			const serverOpts: ReviewServerOptions = {
				designDir: paths.root,
				screens,
				viewport: config.viewport,
				round,
				target: config.target,
				latestShots: latestShots(paths.shotsDir, screens),
				token: state.reviewToken,
				onDecision: (decision, comment) => {
					const latest = loadState(ctx.cwd);
					latest.stage = decision === "approve" ? "implement" : "build";
					saveState(ctx.cwd, latest);
					pi.sendUserMessage(gateDecisionMessage(decision, comment, round, config.target));
				},
			};
			// Preferred: detached child — the gate survives this process exiting
			// (one-shot/print/RPC modes); verdict file is picked up live or on
			// next session start. Fallback: in-process server (old Node).
			const external = await spawnExternalReview(serverOpts, paths);
			let url: string;
			if (external) {
				session.external = external;
				watchExternalDecision(pi, ctx.cwd, session);
				url = external.url;
			} else {
				session.server = await startReviewServer(serverOpts);
				url = session.server.url;
			}
			await openInBrowser(pi, url);
			return {
				content: [
					{
						type: "text",
						text: `Human review gate is open (round ${round}, ${screens.length} screen(s)): ${url}\nIt opens in the default browser (or visit the URL manually). This URL is stable for the whole workflow — the same tab keeps working across review rounds. The page stays reachable even after this session exits; the verdict is applied live, or picked up the next time a pi session starts in this project. The page can PLAY motion (▶ 重播 / ⏸ 暂停 / ½× ¼× 慢放, per-screen ↺) — motion is part of what the human judges.${lintSummary}\nWaiting for the human decision — the turn ends here; do not start implementing.`,
					},
				],
				details: { url, round, screens, external: external !== null },
				terminate: true, // 人工门硬边界：跳过本批次工具后的自动跟进
			};
		},
	}),
	);

	pi.registerTool(
		defineTool({
			name: "design_status",
			label: "Design status",
		description:
			"Read/update .design/state.json (stage, scope, screen list, brief, active flag). Call it to persist every stage transition. Passing active:false or stage:'done' deactivates the design tools and closes the review server.",
		promptGuidelines: STATUS_TOOL_GUIDELINES,
		parameters: Type.Object({
			stage: Type.Optional(
				Type.Union(
					(
						["brief", "plan", "build", "self-review", "review", "implement", "done"] as const
					).map((s) => Type.Literal(s)),
				),
			),
			scope: Type.Optional(Type.Union([Type.Literal("app"), Type.Literal("component")])),
			screens: Type.Optional(Type.Array(Type.String())),
			brief: Type.Optional(Type.String()),
			active: Type.Optional(Type.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			const state = loadState(ctx.cwd);
			if (params.stage !== undefined) state.stage = params.stage as DesignStage;
			if (params.scope !== undefined) state.scope = params.scope;
			if (params.screens !== undefined) state.screens = params.screens;
			if (params.brief !== undefined) state.brief = params.brief;
			if (params.active !== undefined) state.active = params.active;
			if (!state.active || state.stage === "done") {
				state.reviewToken = undefined; // rotate the gate token on workflow end
			}
			saveState(ctx.cwd, state);
			if (!state.active || state.stage === "done") {
				deactivateTools(pi, session);
				await closeServer(session);
				killExternalReview(session);
			}
			const lines = [
				`active: ${state.active}`,
				`stage: ${state.stage}`,
				`scope: ${state.scope}`,
				`reviewRound: ${state.reviewRound}`,
				`screens: ${state.screens.length > 0 ? state.screens.join(", ") : "(none)"}`,
				`config: target=${config.target}, viewport=${config.viewport.width}x${config.viewport.height}`,
				session.server ? `reviewUrl: ${session.server.url}` : "reviewUrl: (closed)",
			];
			if (state.brief) lines.push(`brief: ${state.brief.slice(0, 200)}`);
			return {
				content: [{ type: "text", text: `design status updated and persisted.\n${lines.join("\n")}` }],
				details: { state, server: session.server?.url ?? null },
			};
		},
	}),
	);
}
