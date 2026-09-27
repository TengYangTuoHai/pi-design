#!/usr/bin/env node
/**
 * pi-design — DSH adapter (Path A): standalone CLI + skill.
 *
 * The Pi extension's tools become subcommands so any DSH (or plain shell)
 * session can drive the same workflow:
 *
 *   pi-design start <brief...>                    reset workflow, print the full state machine
 *   pi-design render <page> [--viewport WxH]      headless screenshot (view it with read_image)
 *   pi-design review                              lint + open the playground (all screens), then STOP
 *   pi-design playground                          (re)generate + open the playground view
 *   pi-design status [--stage S ...]              read/update .design/state.json (+ stage rules)
 *   pi-design stop                                end the workflow
 *   pi-design lint                                DESIGN.md mechanical lint report
 *   pi-design install-skill [dir]                 write a DSH SKILL.md pointing at this CLI
 *
 * All model-facing output is English (same convention as the Pi extension).
 * Requires Node >= 23.6 (native TS type stripping); the TS modules under
 * extensions/ are imported directly — no build step, no jiti.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

// --- Node version guard: must run BEFORE any .ts import (static imports hoist,
// so the extension modules are imported dynamically below). ---
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (nodeMajor < 23) {
	console.error(
		`pi-design CLI requires Node >= 23.6 (native TypeScript type stripping); current is ${process.versions.node}. ` +
			"Upgrade Node, or run via the Pi extension instead.",
	);
	process.exit(1);
}

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXTENSIONS_DIR = path.join(REPO_ROOT, "extensions");

const { designPaths, loadConfig, loadState, saveState } = await import(
	pathToFileURL(path.join(EXTENSIONS_DIR, "types.ts"))
);
const { captureScreenshot } = await import(pathToFileURL(path.join(EXTENSIONS_DIR, "shot.ts")));
const { lintDesignMd } = await import(pathToFileURL(path.join(EXTENSIONS_DIR, "designmd.ts")));
const { buildWorkflowPrompt, stageGuideline } = await import(
	pathToFileURL(path.join(EXTENSIONS_DIR, "prompt.ts"))
);

const CWD = process.cwd();
const CLI_PATH = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from extensions/index.ts — kept Pi-free on purpose;
// index.ts stays untouched for the Pi surface).
// ---------------------------------------------------------------------------

/** ExecFn over child_process: resolves (never throws) with code/stdout/stderr. */
function exec(command, args, options = {}) {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		} catch (error) {
			resolve({ stdout: "", stderr: String(error), code: -1, killed: false });
			return;
		}
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d) => (stdout += d));
		child.stderr?.on("data", (d) => (stderr += d));
		const timer = setTimeout(() => child.kill("SIGKILL"), options.timeout ?? 30_000);
		const done = (result) => {
			clearTimeout(timer);
			resolve(result);
		};
		child.on("error", (error) => done({ stdout, stderr: `${stderr}${error}`, code: -1, killed: false }));
		child.on("close", (code) => done({ stdout, stderr, code: code ?? -1, killed: false }));
		if (options.signal) {
			options.signal.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });
		}
	});
}

/** Screen html files relative to .design/prototype/, e.g. ["screens/login.html"]. */
function listScreens(prototypeDir) {
	const screensDir = path.join(prototypeDir, "screens");
	if (!existsSync(screensDir)) return [];
	return readdirSync(screensDir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".html"))
		.map((e) => {
			const relDir = path.relative(screensDir, e.parentPath ?? ".");
			const rel = relDir === "." ? e.name : path.join(relDir, e.name);
			return path.join("screens", rel).split(path.sep).join("/");
		})
		.sort();
}

/** Keeps only the newest `keep` shots for a screen+viewport key. */
function pruneShots(shotsDir, key, keep = 3) {
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
function latestShots(shotsDir, screens) {
	const result = {};
	try {
		const files = readdirSync(shotsDir).filter(
			(f) => f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png"),
		);
		for (const screen of screens) {
			const base = screen.replace(/\.html?$/, "").split("/").join("-");
			const candidates = files.filter(
				(f) =>
					(f.startsWith(`${base}@`) && /^@\d+x\d+-\d+\./.test(f.slice(base.length))) ||
					(f.startsWith(`${base}-`) && /^\d+\./.test(f.slice(base.length + 1))),
			);
			let newest;
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

/** Best-effort browser open; failing to open is never an error (path is printed). */
async function openInBrowser(url) {
	if (process.env.PI_DESIGN_NO_BROWSER === "1") return; // CI / tests
	const command =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	await exec(command, args, { timeout: 5000 });
}

/** Kills the detached review gate recorded in .design/review-server.json. */
function killExternalReview(paths) {
	const infoFile = path.join(paths.root, "review-server.json");
	try {
		const info = JSON.parse(readFileSync(infoFile, "utf8"));
		if (typeof info?.pid === "number") process.kill(info.pid, "SIGTERM");
	} catch {
		/* already gone */
	}
	try {
		rmSync(infoFile, { force: true });
	} catch {
		/* ignore */
	}
}

// ---------------------------------------------------------------------------
// Playground: auto-generated static page showing EVERY screen in one view
// (viewport presets, zoom, per-screen full-screen, self-review-shot compare).
// Pure file:// — no server, no token; regenerated on every review.
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
	String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function buildPlaygroundHtml({ screens, state, config, shots }) {
	const cards = screens
		.map((screen) => {
			const name = screen.replace(/^screens\//, "").replace(/\.html?$/, "");
			const src = `prototype/${screen}`;
			const shot = shots[screen];
			return [
				`<div class="card" data-src="${escapeHtml(src)}"${shot ? ` data-shot="${escapeHtml(shot)}"` : ""}>`,
				`<h2><span class="name">${escapeHtml(name)}</span><span class="file">${escapeHtml(screen)}</span>`,
				`<span class="actions"><a href="${escapeHtml(src)}" target="_blank" rel="noopener">↗ 全屏</a>${
					shot ? '<button class="cmp" type="button">📸 自查截图</button>' : ""
				}</span></h2>`,
				`<div class="frame"><iframe src="${escapeHtml(src)}" loading="lazy"></iframe></div>`,
				`</div>`,
			].join("\n");
		})
		.join("\n");
	const brief = (state.brief ?? "").slice(0, 80);
	return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>设计稿 Playground${brief ? ` · ${escapeHtml(brief)}` : ""}</title>
<style>
	:root { color-scheme: dark; }
	* { box-sizing: border-box; }
	body { margin:0; font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; background:#111418; color:#e5e7eb; }
	header { position:sticky; top:0; z-index:10; display:flex; flex-wrap:wrap; gap:12px 20px; align-items:center; padding:12px 20px;
		background:rgba(17,20,24,.92); backdrop-filter:blur(8px); border-bottom:1px solid #2a2f36; }
	h1 { font-size:15px; font-weight:600; margin:0; }
	.meta { font-size:12px; color:#9ca3af; margin-top:2px; }
	.meta .hint { color:#fbbf24; }
	.controls { display:flex; gap:6px; align-items:center; margin-left:auto; flex-wrap:wrap; }
	.preset { padding:4px 10px; font-size:12px; border-radius:999px; border:1px solid #374151; background:#1f242b; color:#d1d5db; cursor:pointer; }
	.preset.active { background:#2563eb; border-color:#2563eb; color:#fff; }
	.zoom { display:flex; align-items:center; gap:6px; font-size:12px; color:#9ca3af; }
	.grid { display:flex; flex-wrap:wrap; gap:32px; padding:28px; align-items:flex-start; }
	.card h2 { font-size:13px; font-weight:600; margin:0 0 10px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
	.card h2 .file { color:#6b7280; font-weight:400; font-size:11px; }
	.card h2 .actions { display:flex; gap:10px; margin-left:auto; }
	.card h2 .actions a, .card h2 .actions button { font-size:11px; color:#93c5fd; text-decoration:none; cursor:pointer; background:none; border:none; padding:0; }
	.card h2 .actions button:hover, .card h2 .actions a:hover { text-decoration:underline; }
	.frame { background:#e5e7eb; border-radius:18px; padding:10px; box-shadow:0 12px 40px rgba(0,0,0,.45); border:1px solid #374151; }
	iframe { display:block; border:0; background:#fff; border-radius:10px; }
	.frame img { display:block; border-radius:10px; border:0; background:#fff; }
	footer { padding:16px 20px 32px; font-size:11px; color:#6b7280; }
</style>
</head>
<body>
<header>
	<div>
		<h1>设计稿 Playground${brief ? ` — ${escapeHtml(brief)}` : ""}</h1>
		<div class="meta">第 ${state.reviewRound} 轮 · target ${escapeHtml(config.target)} · ${screens.length} 屏 · 生成于 ${new Date().toLocaleString("zh-CN")}
			<br><span class="hint">审核方式：回到对话，直接回复「通过」或修改意见（本页面仅用于查看设计）</span></div>
	</div>
	<div class="controls">
		<button class="preset" data-w="375" type="button">375</button>
		<button class="preset" data-w="390" type="button">390</button>
		<button class="preset" data-w="768" type="button">768</button>
		<button class="preset" data-w="1280" type="button">1280</button>
		<label class="zoom">缩放 <input id="zoom" type="range" min="25" max="100" step="5" value="100"><span id="zoomv">100%</span></label>
	</div>
</header>
<div class="grid" id="grid">
${cards}
</div>
<footer>playground.html 由 pi-design 自动生成（每次 review 时更新）；截图对比 📸 显示模型自查用的最新渲染。</footer>
<script>
	var curW = ${config.viewport.width};
	function heights(w){ return w>=1280?832:w>=768?1024:w>=390?844:812; }
	function applySizes(){
		document.querySelectorAll('.frame').forEach(function(f){
			f.style.width = (curW+20)+'px';
			var i=f.querySelector('iframe'); if(i){ i.style.width=curW+'px'; i.style.height=heights(curW)+'px'; }
			var im=f.querySelector('img'); if(im){ im.style.width=curW+'px'; im.style.height='auto'; }
		});
	}
	function setW(w){
		curW=w;
		document.querySelectorAll('.preset').forEach(function(b){ b.classList.toggle('active', +b.dataset.w===w); });
		applySizes();
	}
	document.querySelectorAll('.preset').forEach(function(b){ b.addEventListener('click', function(){ setW(+b.dataset.w); }); });
	var grid=document.getElementById('grid'), z=document.getElementById('zoom'), zv=document.getElementById('zoomv');
	z.addEventListener('input', function(){ zv.textContent=z.value+'%'; grid.style.zoom=z.value/100; });
	document.querySelectorAll('.card').forEach(function(c){
		var btn=c.querySelector('.cmp'); if(!btn) return;
		var shot=c.dataset.shot, src=c.dataset.src, frame=c.querySelector('.frame'), showing=false;
		btn.addEventListener('click', function(){
			showing=!showing;
			btn.textContent = showing ? '📸 看原型' : '📸 自查截图';
			frame.textContent='';
			if(showing){ var im=document.createElement('img'); im.alt='self-review screenshot'; im.src=shot; frame.appendChild(im); }
			else { var i=document.createElement('iframe'); i.src=src; i.loading='lazy'; frame.appendChild(i); }
			applySizes();
		});
	});
	setW(${config.viewport.width});
</script>
</body>
</html>
`;
}

/** (Re)generates .design/playground.html; returns its absolute path. */
function writePlayground(screens, state, config) {
	const paths = designPaths(CWD);
	const shots = latestShots(paths.shotsDir, screens);
	const file = path.join(paths.root, "playground.html");
	writeFileSync(file, buildPlaygroundHtml({ screens, state, config, shots }), "utf8");
	return file;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdStart(positional, flags) {
	const brief = positional.join(" ").trim();
	if (!brief) {
		console.error("usage: pi-design start <brief...> [--scope app|component]");
		process.exit(2);
	}
	let scope;
	if (flags.scope !== undefined) {
		if (flags.scope !== "app" && flags.scope !== "component") {
			console.error('--scope must be "app" or "component"');
			process.exit(2);
		}
		scope = flags.scope;
	}
	const config = loadConfig(CWD);
	const state = loadState(CWD);
	state.active = true;
	state.brief = brief;
	state.stage = "brief";
	state.scope = scope ?? "app"; // start = reset: fresh scope unless explicitly given
	saveState(CWD, state);
	console.log(
		[
			"# pi-design workflow (DSH CLI mode)",
			"",
			"This environment has no design_* tools. Use this CLI instead:",
			`- design_render(page, viewport?)  ->  node "${CLI_PATH}" render <page> [--viewport WxH]  — then view the printed screenshot with the read_image tool before judging it`,
			`- design_review                   ->  node "${CLI_PATH}" review  — after it returns, END YOUR TURN immediately; the browser is for viewing the design only`,
			`- design_status {...}             ->  node "${CLI_PATH}" status --stage <stage> [--scope app|component] [--screens a,b] [--brief <text>] [--active 0|1]`,
			`- review verdict                  ->  given by the user's NEXT CHAT MESSAGE: explicit approval -> status --stage implement; comments/rejection -> status --stage build + revise`,
			`- end workflow                    ->  node "${CLI_PATH}" stop`,
			"",
			"The full workflow prompt follows. Execute it strictly.",
			"",
			buildWorkflowPrompt({ brief, state, config }),
		].join("\n"),
	);
}

async function cmdRender(positional, flags) {
	const paths = designPaths(CWD);
	const config = loadConfig(CWD);
	const page = positional[0];
	if (!page) {
		console.error("usage: pi-design render <page> [--viewport WxH]");
		process.exit(2);
	}
	const file = path.resolve(paths.prototypeDir, page);
	if (!file.startsWith(`${paths.prototypeDir}${path.sep}`)) {
		console.error("page must be inside .design/prototype/");
		process.exit(1);
	}
	if (!existsSync(file)) {
		console.error(`Cannot find ${file} — create the page during the BUILD stage first`);
		process.exit(1);
	}
	let viewport = config.viewport;
	if (flags.viewport) {
		const match = /^(\d+)[x×](\d+)$/.exec(String(flags.viewport));
		if (!match) {
			console.error('--viewport expects WxH, e.g. --viewport 390x844');
			process.exit(2);
		}
		viewport = { width: Number(match[1]), height: Number(match[2]) };
	}
	const relPage = path.relative(paths.prototypeDir, file).split(path.sep).join("/");
	mkdirSync(paths.shotsDir, { recursive: true });
	const base = relPage.replace(/\.html?$/, "").split("/").join("-");
	const shotKey = `${base}@${viewport.width}x${viewport.height}`;
	const outFile = path.join(paths.shotsDir, `${shotKey}-${Date.now()}.jpg`);
	const shot = await captureScreenshot({ htmlFile: file, outFile, viewport, exec });
	pruneShots(paths.shotsDir, shotKey);
	const state = loadState(CWD);
	if (!state.screens.includes(relPage)) state.screens.push(relPage);
	if (state.stage === "brief" || state.stage === "plan" || state.stage === "build") {
		state.stage = "self-review";
	}
	saveState(CWD, state);
	console.log(
		[
			`Rendered ${relPage} @ ${viewport.width}x${viewport.height} (${shot.engine}).`,
			`Screenshot: ${shot.file}`,
			"View it with the read_image tool NOW, then critique: alignment, visual hierarchy, whitespace, cross-screen consistency, brand consistency with .design/DESIGN.md, AI-tells.",
			"If the current model cannot view images (read_image fails), say so and do a token-by-token code audit against DESIGN.md/tokens.css instead.",
			"Fix what you find, then re-render. SELF-REVIEW is capped at 3 rounds per screen; at the cap, take known issues to human review.",
		].join("\n"),
	);
}

async function cmdReview() {
	const paths = designPaths(CWD);
	const state = loadState(CWD);
	const screens = listScreens(paths.prototypeDir);
	if (screens.length === 0) {
		console.error("No screens under .design/prototype/screens/ to review; finish BUILD first");
		process.exit(1);
	}
	state.stage = "review";
	state.reviewRound += 1;
	state.screens = screens;
	saveState(CWD, state);
	const round = state.reviewRound;

	// Mechanical design-system gate before the human looks at it.
	const designMdFile = path.join(paths.root, "DESIGN.md");
	const tokensCssFile = path.join(paths.root, "tokens.css");
	const lint = lintDesignMd(
		existsSync(designMdFile) ? readFileSync(designMdFile, "utf8") : undefined,
		existsSync(tokensCssFile) ? readFileSync(tokensCssFile, "utf8") : undefined,
	);
	if (lint.errors > 0) {
		console.error(
			`DESIGN.md lint found errors — fix them before opening the human gate:\n${lint.findings
				.filter((f) => f.severity === "error")
				.map((f) => `- [${f.rule}] ${f.message}`)
				.join("\n")}`,
		);
		process.exit(1);
	}
	const lintSummary =
		lint.warnings > 0
			? `\nDESIGN.md lint warnings (fixing them before review is recommended):\n${lint.findings
					.filter((f) => f.severity === "warning")
					.map((f) => `- [${f.rule}] ${f.message}`)
					.join("\n")}`
			: "\nDESIGN.md lint: clean.";

	// Auto-generated playground: every current screen in one page, pure
	// file:// — viewport presets, zoom, per-screen full-screen, shot compare.
	const playground = writePlayground(screens, state, loadConfig(CWD));
	await openInBrowser(pathToFileURL(playground).href);
	console.log(
		[
			`Human review round ${round}: ${screens.length} screen(s) opened in the browser playground (${screens.join(", ")}).`,
			`Playground: ${playground}`,
			"All screens are shown in ONE page (viewport presets 375/390/768/1280, zoom, per-screen full-screen ↗, self-review-shot compare 📸); it regenerates on every review and can be reopened anytime with `pi-design playground`. The browser is for LOOKING at the design only — the verdict is given in this chat.",
			`${lintSummary}`,
			"WAITING FOR THE HUMAN DECISION — END YOUR TURN NOW: do not output implementation plans, do not write implementation code, do not call more tools. The user's next message is the verdict: explicit approval (通过/approve/ok) → `pi-design status --stage implement`; comments or rejection → `pi-design status --stage build` and revise per the feedback.",
		].join("\n"),
	);
}

/** (Re)generates and opens the playground without touching workflow state. */
async function cmdPlayground() {
	const state = loadState(CWD);
	const config = loadConfig(CWD);
	const screens = listScreens(designPaths(CWD).prototypeDir);
	if (screens.length === 0) {
		console.error("No screens under .design/prototype/screens/ yet; finish BUILD first");
		process.exit(1);
	}
	const file = writePlayground(screens, state, config);
	await openInBrowser(pathToFileURL(file).href);
	console.log(
		`Playground: ${file}\nAll ${screens.length} screen(s) in one page — viewport presets, zoom, per-screen full-screen (↗), self-review-shot compare (📸). Read-only view; the review verdict is still given in chat.`,
	);
}

function cmdStatus(flags) {
	const paths = designPaths(CWD);
	const config = loadConfig(CWD);
	const state = loadState(CWD);
	if (flags.stage !== undefined) {
		const stages = ["brief", "plan", "build", "self-review", "review", "implement", "done"];
		if (!stages.includes(flags.stage)) {
			console.error(`--stage must be one of: ${stages.join(", ")}`);
			process.exit(2);
		}
		state.stage = flags.stage;
	}
	if (flags.scope !== undefined) {
		if (flags.scope !== "app" && flags.scope !== "component") {
			console.error('--scope must be "app" or "component"');
			process.exit(2);
		}
		state.scope = flags.scope;
	}
	if (flags.screens !== undefined) {
		state.screens = String(flags.screens)
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	if (flags.brief !== undefined) state.brief = String(flags.brief);
	if (flags.active !== undefined) state.active = String(flags.active) === "1" || String(flags.active) === "true";
	if (!state.active || state.stage === "done") {
		state.reviewToken = undefined; // rotate the gate token on workflow end
	}
	saveState(CWD, state);
	if (!state.active || state.stage === "done") {
		killExternalReview(paths);
	}
	const lines = [
		`active: ${state.active}`,
		`stage: ${state.stage}`,
		`scope: ${state.scope}`,
		`reviewRound: ${state.reviewRound}`,
		`screens: ${state.screens.length > 0 ? state.screens.join(", ") : "(none)"}`,
		`config: target=${config.target}, viewport=${config.viewport.width}x${config.viewport.height}`,
	];
	if (state.brief) lines.push(`brief: ${state.brief.slice(0, 200)}`);
	console.log(
		[
			`design status updated and persisted.\n${lines.join("\n")}`,
			"",
			"--- current stage guideline ---",
			stageGuideline(state, config).replace(/\bdesign_render\b/g, "`pi-design render`").replace(/\bdesign_review\b/g, "`pi-design review`").replace(/\bdesign_status \{[^}]*\}/g, (m) => `\`pi-design status\` (${m.replace(/[{}"]/g, "").trim()})`),
		].join("\n"),
	);
}

function cmdStop() {
	const paths = designPaths(CWD);
	const state = loadState(CWD);
	state.active = false;
	state.stage = "done";
	state.reviewToken = undefined; // rotate the gate token on workflow end
	saveState(CWD, state);
	killExternalReview(paths); // legacy cleanup (pre-chat-verdict review servers)
	console.log("design workflow ended.");
}

function cmdLint() {
	const paths = designPaths(CWD);
	const designMdFile = path.join(paths.root, "DESIGN.md");
	const tokensCssFile = path.join(paths.root, "tokens.css");
	const lint = lintDesignMd(
		existsSync(designMdFile) ? readFileSync(designMdFile, "utf8") : undefined,
		existsSync(tokensCssFile) ? readFileSync(tokensCssFile, "utf8") : undefined,
	);
	const lines = lint.findings.map((f) => `[${f.severity}] [${f.rule}] ${f.message}`);
	console.log(
		`DESIGN.md lint: ${lint.errors} error(s), ${lint.warnings} warning(s)\n${lines.length > 0 ? lines.join("\n") : "(no findings)"}`,
	);
	if (lint.errors > 0) process.exit(1);
}

/** Writes a DSH skill that points at this CLI (bakes the absolute path in). */
function cmdInstallSkill(positional) {
	const targetDir = positional[0] ?? path.join(homedir(), ".dsh", "skills");
	const templateFile = path.join(REPO_ROOT, "dsh", "skills", "design", "SKILL.md");
	if (!existsSync(templateFile)) {
		console.error(`skill template not found: ${templateFile}`);
		process.exit(1);
	}
	const template = readFileSync(templateFile, "utf8");
	const body = template.replaceAll("__PI_DESIGN_CLI__", CLI_PATH);
	const skillDir = path.join(targetDir, "design");
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(path.join(skillDir, "SKILL.md"), body, "utf8");
	console.log(`skill installed: ${path.join(skillDir, "SKILL.md")}`);
	console.log(`invoke with:      /design <brief>   (or just ask the agent to design something)`);
	console.log(`CLI referenced:  node "${CLI_PATH}" <command>`);
	console.log(`discovery root:  ${targetDir} (DSH scans it automatically; project root wins over user root)`);
}

// ---------------------------------------------------------------------------
// Arg parsing + dispatch
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				flags[key] = next;
				i += 1;
			} else {
				flags[key] = true;
			}
		} else {
			positional.push(arg);
		}
	}
	return { positional, flags };
}

const USAGE = `usage: pi-design <command> [args]

commands:
  start <brief...> [--scope app|component]
                                    reset the workflow and print the full state machine
                                    (component scope: design ONLY the requested component)
  render <page> [--viewport WxH]    screenshot one screen (view with read_image)
  review                            lint + open the playground (all screens in one
                                    page) in the browser (then STOP; the verdict is
                                    the user's next chat message)
  playground                        (re)generate + open the playground read-only view
  status [--stage S] [--scope app|component] [--screens a,b] [--brief T] [--active 0|1]
                                    read/update .design/state.json (+ stage rules)
  stop                              end the workflow
  lint                              DESIGN.md mechanical lint report
  install-skill [dir]               write a DSH SKILL.md pointing at this CLI`;

const [command, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);
switch (command) {
	case "start":
		cmdStart(positional, flags);
		break;
	case "render":
		await cmdRender(positional, flags);
		break;
	case "review":
		await cmdReview();
		break;
	case "playground":
		await cmdPlayground();
		break;
	case "status":
		cmdStatus(flags);
		break;
	case "stop":
		cmdStop();
		break;
	case "lint":
		cmdLint();
		break;
	case "install-skill":
		cmdInstallSkill(positional);
		break;
	default:
		console.error(USAGE);
		process.exit(command ? 1 : 2);
}
