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
const { writeMotionRuntime } = await import(pathToFileURL(path.join(EXTENSIONS_DIR, "motion.ts")));
const { captureScreenshot } = await import(pathToFileURL(path.join(EXTENSIONS_DIR, "shot.ts")));
const { lintDesignMd } = await import(pathToFileURL(path.join(EXTENSIONS_DIR, "designmd.ts")));
const { listPresets, findPreset, presetCatalog, applyPreset, syncTokens } = await import(
	pathToFileURL(path.join(EXTENSIONS_DIR, "presets.ts"))
);
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
				`<span class="actions"><button class="ann" type="button" title="点选元素添加批注（Esc 取消）">✎ 批注</button><a href="${escapeHtml(src)}" target="_blank" rel="noopener">↗ 全屏</a><button class="rpl" type="button" title="重播本屏动效">↺ 重播</button>${
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
	header { position:fixed; left:0; right:0; top:0; z-index:10; display:flex; flex-wrap:wrap; gap:12px 20px; align-items:center; padding:12px 20px;
		background:rgba(17,20,24,.92); backdrop-filter:blur(8px); border-bottom:1px solid #2a2f36; }
	h1 { font-size:15px; font-weight:600; margin:0; }
	.meta { font-size:12px; color:#9ca3af; margin-top:2px; }
	.meta .hint { color:#fbbf24; }
	.controls { display:flex; gap:6px; align-items:center; margin-left:auto; flex-wrap:wrap; }
	.preset { padding:4px 10px; font-size:12px; border-radius:999px; border:1px solid #374151; background:#1f242b; color:#d1d5db; cursor:pointer; }
	.preset.active { background:#2563eb; border-color:#2563eb; color:#fff; }
	.zoom { display:flex; align-items:center; gap:6px; font-size:12px; color:#9ca3af; }
	.mbar { display:flex; gap:6px; align-items:center; padding-left:14px; border-left:1px solid #2a2f36; flex-wrap:wrap; }
	.mbtn { padding:4px 10px; font-size:12px; border-radius:999px; border:1px solid #374151; background:#1f242b; color:#d1d5db; cursor:pointer; }
	.mbtn:hover { border-color:#4b5563; }
	.mbtn.active { background:#2563eb; border-color:#2563eb; color:#fff; }
	.mnote { font-size:11px; color:#fbbf24; }
	#canvas { position:fixed; left:0; right:0; overflow:hidden; background-color:#111418; background-image:radial-gradient(#2a2f36 1px, transparent 1px); background-size:24px 24px; cursor:default; }
	#world { position:absolute; left:0; top:0; transform-origin:0 0; }
	.card { position:absolute; }
	.card h2 { cursor:move; }
	body.dragging { user-select:none; }
	body.dragging #canvas { cursor:grabbing; }
	body.panmode #canvas { cursor:grab; }
	body.dragging #world iframe, body.panmode #world iframe { pointer-events:none; }
	.card h2 { font-size:13px; font-weight:600; margin:0 0 10px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
	.card h2 .file { color:#6b7280; font-weight:400; font-size:11px; }
	.card h2 .actions { display:flex; gap:10px; margin-left:auto; }
	.card h2 .actions a, .card h2 .actions button { font-size:11px; color:#93c5fd; text-decoration:none; cursor:pointer; background:none; border:none; padding:0; }
	.card h2 .actions button:hover, .card h2 .actions a:hover { text-decoration:underline; }
	.frame { background:#e5e7eb; border-radius:18px; padding:10px; box-shadow:0 12px 40px rgba(0,0,0,.45); border:1px solid #374151; }
	iframe { display:block; border:0; background:#fff; border-radius:10px; }
	.frame img { display:block; border-radius:10px; border:0; background:#fff; }
	footer { padding:16px 20px 0; font-size:11px; color:#6b7280; }
	.card h2 .actions button.ann.on { background:#2563eb; color:#fff; border-radius:999px; padding:0 8px; text-decoration:none; }
	.fb { position:fixed; left:0; right:0; bottom:0; z-index:10; display:flex; flex-direction:column; gap:8px; padding:12px 20px; background:rgba(17,20,24,.96); border-top:1px solid #2a2f36; }
	.fbrow { display:flex; gap:10px; align-items:flex-end; }
	#general { flex:1; min-height:40px; resize:vertical; background:#0b0d10; color:#e5e7eb; border:1px solid #374151; border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; }
	.notes { margin:0; padding:0; list-style:none; max-height:28vh; overflow:auto; display:flex; flex-direction:column; gap:6px; }
	.notes li { display:flex; gap:8px; align-items:center; }
	.nidx { flex:none; min-width:18px; height:18px; padding:0 4px; border-radius:9px; background:#6ea8fe; color:#0b0c0f; font-weight:700; font-size:11px; line-height:18px; text-align:center; }
	.nmeta { flex:none; max-width:45%; color:#9ca3af; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.nnote { flex:1; min-width:0; background:#0b0d10; color:#e5e7eb; border:1px solid #374151; border-radius:6px; padding:6px 10px; font-size:13px; font-family:inherit; }
	.ndel { flex:none; font-size:12px; color:#9ca3af; background:none; border:1px solid #374151; border-radius:999px; padding:2px 8px; cursor:pointer; }
	#fbout { margin:0; max-height:20vh; overflow:auto; font:12px/1.5 ui-monospace,monospace; color:#d1d5db; background:#0b0d10; border:1px solid #374151; border-radius:8px; padding:8px 10px; white-space:pre-wrap; }
</style>
</head>
<body>
<header>
	<div>
		<h1>设计稿 Playground${brief ? ` — ${escapeHtml(brief)}` : ""}</h1>
		<div class="meta">第 ${state.reviewRound} 轮 · target ${escapeHtml(config.target)} · ${screens.length} 屏 · 生成于 ${new Date().toLocaleString("zh-CN")}
			<br><span class="hint">审核方式：回到对话，直接回复「通过」或修改意见；也可以用 ✎ 批注 点选元素写意见，再点 📋 复制反馈 粘贴到对话；画布：拖动空白处平移，⌘/Ctrl+滚轮缩放，拖标题栏移动屏幕，F 适应</span></div>
	</div>
	<div class="controls">
		<button class="preset" data-w="375" type="button">375</button>
		<button class="preset" data-w="390" type="button">390</button>
		<button class="preset" data-w="768" type="button">768</button>
		<button class="preset" data-w="1280" type="button">1280</button>
		<label class="zoom">缩放 <input id="zoom" type="range" min="10" max="200" step="5" value="100"><span id="zoomv">100%</span></label>
		<button class="preset cbtn" id="cfit" type="button" title="缩放以显示全部屏幕 (F)">⤢ 适应</button>
		<button class="preset cbtn" id="creset" type="button" title="清除手动摆放，恢复自动排列">⟲ 重排</button>
		<span class="mbar">
			<button class="mbtn" id="mreplay" type="button" title="重播所有屏的动效">▶ 重播动效</button>
			<button class="mbtn" id="mpause" type="button" title="暂停 / 继续所有动画">⏸ 暂停</button>
			<button class="mbtn mspd active" data-r="1" type="button">1×</button>
			<button class="mbtn mspd" data-r="0.5" type="button">½×</button>
			<button class="mbtn mspd" data-r="0.25" type="button">¼×</button>
			<span class="mnote" id="mnote" style="display:none"></span>
		</span>
	</div>
</header>
<div id="canvas"><div id="world">
${cards}
</div></div>
<section class="fb" id="fb">
	<ol id="notes" class="notes" hidden></ol>
	<div class="fbrow">
		<textarea id="general" placeholder="整体意见（可选）"></textarea>
		<button class="mbtn" id="copyfb" type="button">📋 复制反馈</button>
	</div>
	<pre id="fbout" hidden></pre>
	<footer>playground.html 由 pi-design 自动生成（每次 review 时更新）；截图对比 📸 显示模型自查用的最新渲染；动效控制 ▶/⏸/慢放 和 ✎ 批注 需要页面接入自动生成的 ../motion.js。</footer>
</section>
<script>
	var curW = ${config.viewport.width};
	function heights(w){ return w>=1280?832:w>=768?1024:w>=390?844:812; }
	function applySizes(){
		document.querySelectorAll('.frame').forEach(function(f){
			f.style.width = (curW+20)+'px';
			var i=f.querySelector('iframe'); if(i){ i.style.width=curW+'px'; i.style.height=heights(curW)+'px'; }
			var im=f.querySelector('img'); if(im){ im.style.width=curW+'px'; im.style.height='auto'; }
		});
		autoLayout(); // card widths changed: re-flow cards without a saved spot
	}
	function setW(w){
		curW=w;
		document.querySelectorAll('.preset:not(.cbtn)').forEach(function(b){ b.classList.toggle('active', +b.dataset.w===w); });
		applySizes();
	}
	document.querySelectorAll('.preset:not(.cbtn)').forEach(function(b){ b.addEventListener('click', function(){ setW(+b.dataset.w); }); });
	// ---- pan/zoom canvas: dotted infinite surface, drag screens by title bar ----
	// view {x,y,z} is the #world transform; layout.pos keeps manual card spots in
	// localStorage (keyed by screen path) so a regenerated playground reopens
	// roughly as left. Iframes lose pointer events only while dragging/panning.
	var canvas=document.getElementById('canvas'), world=document.getElementById('world');
	var z=document.getElementById('zoom'), zv=document.getElementById('zoomv');
	var view={x:0,y:0,z:1};
	var layout={pos:{}}; // screen path -> {x,y} in world px
	var topZ=1, panDrag=null, cardDrag=null, spaceHeld=false;
	var LSKEY='pi-design:canvas:'+location.pathname;
	function clampZ(v){ return Math.min(2, Math.max(0.1, v)); }
	function cardScreen(c){ return c.querySelector('.file').textContent; }
	function layoutBounds(){
		canvas.style.top = document.querySelector('header').offsetHeight+'px';
		canvas.style.bottom = document.getElementById('fb').offsetHeight+'px';
	}
	function applyView(){
		world.style.transform = 'translate('+view.x+'px,'+view.y+'px) scale('+view.z+')';
		canvas.style.backgroundSize = (24*view.z)+'px '+(24*view.z)+'px';
		canvas.style.backgroundPosition = view.x+'px '+view.y+'px';
		z.value = Math.round(view.z*100);
		zv.textContent = z.value+'%';
	}
	function zoomAt(cx, cy, newZ){
		var wx=(cx-view.x)/view.z, wy=(cy-view.y)/view.z;
		view.z = clampZ(newZ);
		view.x = cx-wx*view.z; view.y = cy-wy*view.z;
		applyView();
		saveSoon();
	}
	function autoLayout(){
		var x=0;
		document.querySelectorAll('.card').forEach(function(c){
			var p=layout.pos[cardScreen(c)];
			if(p){ c.style.left=p.x+'px'; c.style.top=p.y+'px'; }
			else { c.style.left=x+'px'; c.style.top='0px'; x+=c.offsetWidth+80; }
		});
	}
	function fit(){
		var any=false, minX=1/0, minY=1/0, maxX=-1/0, maxY=-1/0;
		document.querySelectorAll('.card').forEach(function(c){
			var x=parseFloat(c.style.left)||0, y=parseFloat(c.style.top)||0;
			minX=Math.min(minX,x); minY=Math.min(minY,y);
			maxX=Math.max(maxX,x+c.offsetWidth); maxY=Math.max(maxY,y+c.offsetHeight);
			any=true;
		});
		if(!any) return;
		var bw=maxX-minX, bh=maxY-minY;
		view.z = clampZ(Math.min((canvas.clientWidth-80)/bw, (canvas.clientHeight-80)/bh, 1));
		view.x = (canvas.clientWidth-bw*view.z)/2 - minX*view.z;
		view.y = (canvas.clientHeight-bh*view.z)/2 - minY*view.z;
		applyView();
		saveSoon(); // a reload reopens what the user last saw
	}
	function saveNow(){
		try { localStorage.setItem(LSKEY, JSON.stringify({view:view, pos:layout.pos})); } catch(e){ /* unavailable */ }
	}
	var saveTimer=null;
	function saveSoon(){
		if(saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(function(){ saveTimer=null; saveNow(); }, 300);
	}
	function loadLayout(){
		var restored=false;
		try {
			var v=JSON.parse(localStorage.getItem(LSKEY)||'null'), known={};
			document.querySelectorAll('.card').forEach(function(c){ known[cardScreen(c)]=1; });
			if(v && typeof v==='object'){
				if(v.pos && typeof v.pos==='object'){
					for(var k in v.pos){ if(known[k] && v.pos[k]) layout.pos[k]={x:+v.pos[k].x||0, y:+v.pos[k].y||0}; }
				}
				if(v.view && typeof v.view.z==='number'){ view={x:+v.view.x||0, y:+v.view.y||0, z:clampZ(v.view.z)}; restored=true; }
			}
		} catch(e){ /* missing or corrupted */ }
		return restored;
	}
	function typing(){
		var a=document.activeElement;
		return !!a && (a.tagName==='INPUT' || a.tagName==='TEXTAREA');
	}
	z.addEventListener('input', function(){
		zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, (+z.value)/100);
	});
	canvas.addEventListener('wheel', function(e){
		e.preventDefault();
		if(e.ctrlKey || e.metaKey){
			var r=canvas.getBoundingClientRect();
			zoomAt(e.clientX-r.left, e.clientY-r.top, view.z*Math.exp(-e.deltaY*0.01));
		} else {
			view.x -= e.shiftKey ? e.deltaY : e.deltaX;
			view.y -= e.shiftKey ? 0 : e.deltaY;
			applyView();
			saveSoon();
		}
	}, { passive:false });
	canvas.addEventListener('pointerdown', function(e){
		var pan = e.button===1 || (e.button===0 && spaceHeld) || (e.button===0 && (e.target===canvas || e.target===world));
		if(pan){
			panDrag={x:e.clientX, y:e.clientY};
			canvas.setPointerCapture(e.pointerId);
			document.body.classList.add('dragging');
			e.preventDefault();
			return;
		}
		if(e.button!==0) return;
		var h=e.target.closest ? e.target.closest('.card h2') : null;
		if(!h || e.target.closest('button, a, input')) return; // tool buttons keep working
		var card=h.closest('.card');
		cardDrag={ card:card, px:e.clientX, py:e.clientY, ox:parseFloat(card.style.left)||0, oy:parseFloat(card.style.top)||0, moved:false };
		canvas.setPointerCapture(e.pointerId);
		document.body.classList.add('dragging');
		e.preventDefault();
	});
	canvas.addEventListener('pointermove', function(e){
		if(panDrag){
			view.x += e.clientX-panDrag.x; view.y += e.clientY-panDrag.y;
			panDrag.x=e.clientX; panDrag.y=e.clientY;
			applyView();
		} else if(cardDrag){
			var dx=e.clientX-cardDrag.px, dy=e.clientY-cardDrag.py;
			if(!cardDrag.moved && Math.abs(dx)<3 && Math.abs(dy)<3) return; // click = no-op
			if(!cardDrag.moved) cardDrag.card.style.zIndex = ++topZ; // bring to front
			cardDrag.moved=true;
			cardDrag.card.style.left=(cardDrag.ox+dx/view.z)+'px';
			cardDrag.card.style.top=(cardDrag.oy+dy/view.z)+'px';
		}
	});
	function endDrag(){
		if(panDrag){ panDrag=null; document.body.classList.remove('dragging'); saveSoon(); }
		if(cardDrag){
			if(cardDrag.moved){
				layout.pos[cardScreen(cardDrag.card)]={ x:parseFloat(cardDrag.card.style.left)||0, y:parseFloat(cardDrag.card.style.top)||0 };
				saveSoon();
			}
			cardDrag=null;
			document.body.classList.remove('dragging');
		}
	}
	canvas.addEventListener('pointerup', endDrag);
	canvas.addEventListener('pointercancel', endDrag);
	document.addEventListener('keydown', function(e){
		if(e.key===' ' && !typing()){ spaceHeld=true; document.body.classList.add('panmode'); e.preventDefault(); }
		else if((e.key==='f' || e.key==='F') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing()) fit();
	});
	document.addEventListener('keyup', function(e){
		if(e.key===' '){ spaceHeld=false; document.body.classList.remove('panmode'); }
	});
	document.getElementById('cfit').addEventListener('click', fit);
	document.getElementById('creset').addEventListener('click', function(){
		layout.pos={};
		autoLayout();
		fit();
		saveNow();
	});
	window.addEventListener('resize', layoutBounds);
	// ---- motion playback: postMessage to each screen's motion.js runtime ----
	// Screens that include the runtime ACK (incl. a "ready" ping on load) and
	// get smooth in-place control; screens without it fall back to an iframe
	// reload for replay (which also restarts animations) and are flagged for
	// pause/slow-mo being unavailable.
	function iframes(){ return Array.prototype.slice.call(document.querySelectorAll('.frame iframe')); }
	function post(f, action, extra){
		try { f.contentWindow.postMessage(Object.assign({type:'pi-design:motion', action:action}, extra||{}), '*'); }
		catch(e){ /* frame not ready */ }
	}
	window.addEventListener('message', function(e){
		var d = e.data;
		if (!d) return;
		if (d.type === 'pi-design:motion-ack') {
			iframes().forEach(function(f){ if (f.contentWindow === e.source) f.dataset.motion = '1'; });
			if (d.action === 'ready') iframes().forEach(function(f){ if (f.contentWindow === e.source) sendMarks(f); });
			return;
		}
		if (d.type === 'pi-design:annotate-pick') {
			var card = cardOf(e.source);
			if (!card) return;
			var ann = card.querySelector('.ann');
			if (ann) ann.classList.remove('on');
			notes.push({ screen: card.querySelector('.file').textContent, selector: d.selector, text: d.text||'', tag: d.tag||'', note: '' });
			renderNotes();
			var inputs = document.querySelectorAll('#notes .nnote');
			if (inputs.length) inputs[inputs.length-1].focus();
			return;
		}
		if (d.type === 'pi-design:annotate-cancel') {
			var c = cardOf(e.source), a = c && c.querySelector('.ann');
			if (a) a.classList.remove('on');
		}
	});
	function replayFrame(f){
		if (f.dataset.motion === '1') post(f, 'replay');
		else { var s=f.getAttribute('src'); f.setAttribute('src', s); }
	}
	function noteMissing(){
		var noRt = iframes().filter(function(f){ return f.dataset.motion !== '1'; }).length;
		var el = document.getElementById('mnote');
		if (noRt > 0) { el.textContent = noRt + ' 屏未接入 ../motion.js（重播可用，暂停/慢放不可用）'; el.style.display='inline'; }
		else { el.style.display='none'; }
	}
	var paused = false;
	document.getElementById('mreplay').addEventListener('click', function(){ iframes().forEach(replayFrame); });
	document.getElementById('mpause').addEventListener('click', function(){
		paused = !paused;
		this.textContent = paused ? '▶ 继续' : '⏸ 暂停';
		iframes().forEach(function(f){ if (f.dataset.motion === '1') post(f, paused ? 'pause' : 'play'); });
		noteMissing();
	});
	document.querySelectorAll('.mspd').forEach(function(b){
		b.addEventListener('click', function(){
			var r = +b.dataset.r;
			document.querySelectorAll('.mspd').forEach(function(x){ x.classList.toggle('active', +x.dataset.r === r); });
			iframes().forEach(function(f){ if (f.dataset.motion === '1') post(f, 'rate', { rate: r }); });
			noteMissing();
		});
	});
	document.querySelectorAll('.card .rpl').forEach(function(b){
		b.addEventListener('click', function(){
			var f = b.closest('.card').querySelector('.frame iframe');
			if (f) replayFrame(f);
		});
	});
	// ---- element annotations: pick an element in a screen, note it, copy one feedback block ----
	// Screens that include ../motion.js answer pick/cancel/marks over
	// postMessage (file:// iframes are cross-origin); notes live host-side only.
	var notes = []; // { screen, selector, text, tag, note }
	function cardOf(win){
		var hit = null;
		iframes().forEach(function(f){ if (f.contentWindow === win) hit = f.closest('.card'); });
		return hit;
	}
	function postAnn(f, action, extra){
		try { f.contentWindow.postMessage(Object.assign({type:'pi-design:annotate', action:action}, extra||{}), '*'); }
		catch(e){ /* frame not ready */ }
	}
	function sendMarks(f){
		var card = cardOf(f.contentWindow); if (!card) return;
		var screen = card.querySelector('.file').textContent, marks = [];
		notes.forEach(function(n, i){ if (n.screen === screen) marks.push({ n: i+1, selector: n.selector }); });
		postAnn(f, 'marks', { marks: marks });
	}
	function composeFeedback(){
		var general = document.getElementById('general').value.trim();
		if (!notes.length) return general;
		var lines = [];
		if (general) lines.push(general, '');
		lines.push('Element annotations (screen · selector · text):');
		notes.forEach(function(n, i){
			lines.push((i+1) + '. ' + n.screen + ' · ' + n.selector + ' · ' + (n.text ? '"' + n.text + '"' : '(no text)'));
			lines.push('   → ' + (n.note.trim() || '(no note)'));
		});
		return lines.join('\\n');
	}
	function updateOut(){ document.getElementById('fbout').textContent = composeFeedback(); }
	function renderNotes(){
		var ol = document.getElementById('notes');
		ol.textContent = '';
		notes.forEach(function(n, i){
			var label = n.screen;
			document.querySelectorAll('.card').forEach(function(c){
				var fl = c.querySelector('.file');
				if (fl && fl.textContent === n.screen) label = c.querySelector('.name').textContent;
			});
			var li = document.createElement('li');
			var idx = document.createElement('span'); idx.className = 'nidx'; idx.textContent = String(i+1);
			var meta = document.createElement('span'); meta.className = 'nmeta';
			meta.textContent = label + ' · ' + (n.text ? '"' + n.text + '"' : '<' + n.tag + '>');
			var input = document.createElement('input');
			input.className = 'nnote'; input.placeholder = '这里有什么问题？'; input.value = n.note;
			input.addEventListener('input', function(){ n.note = input.value; updateOut(); });
			var del = document.createElement('button');
			del.className = 'ndel'; del.type = 'button'; del.title = '删除'; del.textContent = '×';
			del.addEventListener('click', function(){ notes.splice(i, 1); renderNotes(); });
			li.appendChild(idx); li.appendChild(meta); li.appendChild(input); li.appendChild(del);
			ol.appendChild(li);
		});
		ol.hidden = notes.length === 0;
		iframes().forEach(sendMarks);
		updateOut();
		layoutBounds();
	}
	function stopPicking(){
		document.querySelectorAll('.ann.on').forEach(function(b){
			b.classList.remove('on');
			var f = b.closest('.card').querySelector('.frame iframe');
			if (f) postAnn(f, 'cancel');
		});
	}
	document.getElementById('general').addEventListener('input', updateOut);
	document.querySelectorAll('.card .ann').forEach(function(b){
		b.addEventListener('click', function(){
			if (b.classList.contains('on')) { stopPicking(); return; }
			stopPicking();
			var f = b.closest('.card').querySelector('.frame iframe');
			if (!f) return; // screenshot compare showing
			if (f.dataset.motion !== '1') {
				var el = document.getElementById('mnote');
				el.textContent = '该屏未接入 ../motion.js，无法点选元素';
				el.style.display = 'inline';
				setTimeout(noteMissing, 3000);
				return;
			}
			b.classList.add('on');
			postAnn(f, 'pick');
		});
	});
	document.addEventListener('keydown', function(e){
		// focus normally stays on the playground while picking, so handle Esc here
		if (e.key === 'Escape' && document.querySelector('.ann.on')) { e.preventDefault(); stopPicking(); }
	});
	document.getElementById('copyfb').addEventListener('click', function(){
		var btn = this, text = composeFeedback();
		var copied = function(){ btn.textContent = '✓ 已复制，粘贴到对话'; setTimeout(function(){ btn.textContent = '📋 复制反馈'; }, 2000); };
		if (!text) { btn.textContent = '没有可复制的内容'; setTimeout(function(){ btn.textContent = '📋 复制反馈'; }, 2000); return; }
		var fallback = function(){
			// file:// pages may reject the async clipboard API: try execCommand
			try {
				var ta = document.createElement('textarea');
				ta.value = text;
				document.body.appendChild(ta);
				ta.select();
				var ok = document.execCommand('copy');
				document.body.removeChild(ta);
				if (ok) { copied(); return; }
			} catch (e) { /* execCommand unavailable */ }
			var out = document.getElementById('fbout');
			out.hidden = false;
			window.getSelection().selectAllChildren(out);
			btn.textContent = '请手动复制下方文本';
		};
		if (navigator.clipboard) navigator.clipboard.writeText(text).then(copied, fallback);
		else fallback();
	});
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
	layoutBounds();
	var viewRestored = loadLayout();
	setW(${config.viewport.width});
	if (viewRestored) applyView(); else fit();
	renderNotes();
</script>
</body>
</html>
`;
}

/** (Re)generates .design/playground.html; returns its absolute path. */
function writePlayground(screens, state, config) {
	const paths = designPaths(CWD);
	const shots = latestShots(paths.shotsDir, screens);
	writeMotionRuntime(paths.prototypeDir); // playback runtime the screens include
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
		console.error("usage: pi-design start <brief...> [--scope app|component] [--preset <id>]");
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
	let presetId;
	if (flags.preset !== undefined) {
		const meta = findPreset(String(flags.preset));
		if (!meta) {
			console.error(`unknown preset "${flags.preset}" — available: ${listPresets().map((p) => p.id).join(", ")}`);
			process.exit(2);
		}
		presetId = meta.id;
	}
	const config = loadConfig(CWD);
	const state = loadState(CWD);
	state.active = true;
	state.brief = brief;
	state.stage = "brief";
	state.scope = scope ?? "app"; // start = reset: fresh scope unless explicitly given
	state.preset = presetId; // start = reset: no preset unless --preset given
	let presetBackup;
	if (presetId) {
		presetBackup = applyPreset(designPaths(CWD).root, presetId, { force: true }).backup;
	}
	saveState(CWD, state);
	const runtime = writeMotionRuntime(designPaths(CWD).prototypeDir); // motion playback runtime for screens
	console.log(
		[
			...(presetBackup ? [`Preset ${presetId} applied; previous DESIGN.md kept as ${presetBackup}`] : []),
			"# pi-design workflow (DSH CLI mode)",
			"",
			"This environment has no design_* tools. Use this CLI instead:",
			`- design_render(page, viewport?)  ->  node "${CLI_PATH}" render <page> [--viewport WxH] [--at MS]  — then view the printed screenshot with the read_image tool before judging it (--at MS captures a mid-animation frame at t=MS)`,
			`- design_review                   ->  node "${CLI_PATH}" review  — after it returns, END YOUR TURN immediately; the browser is for viewing the design only`,
			`- design_status {...}             ->  node "${CLI_PATH}" status --stage <stage> [--scope app|component] [--screens a,b] [--brief <text>] [--active 0|1]`,
			`- design_preset {...}             ->  node "${CLI_PATH}" preset list | preset apply <id> [--force] | preset sync`,
			`- review verdict                  ->  given by the user's NEXT CHAT MESSAGE: explicit approval -> status --stage implement; comments/rejection -> status --stage build + revise`,
			`- end workflow                    ->  node "${CLI_PATH}" stop`,
			`- motion runtime (auto-generated) ->  ${runtime}  — every screen includes <script src="../motion.js"></script> so the playground can replay/pause/slow-mo its animations`,
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
		console.error("usage: pi-design render <page> [--viewport WxH] [--at MS]");
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
	let atMs;
	if (flags.at !== undefined) {
		if (!/^\d+$/.test(String(flags.at))) {
			console.error('--at expects milliseconds after load, e.g. --at 150 (mid-animation capture)');
			process.exit(2);
		}
		atMs = Number(flags.at);
	}
	writeMotionRuntime(paths.prototypeDir); // idempotent; resumed workflows get it too
	const relPage = path.relative(paths.prototypeDir, file).split(path.sep).join("/");
	mkdirSync(paths.shotsDir, { recursive: true });
	const base = relPage.replace(/\.html?$/, "").split("/").join("-");
	const shotKey = `${base}@${viewport.width}x${viewport.height}`;
	const outFile = path.join(paths.shotsDir, `${shotKey}-${Date.now()}.jpg`);
	const shot = await captureScreenshot({ htmlFile: file, outFile, viewport, exec, atMs });
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
			atMs === undefined
				? "The capture waits for entrance animations to settle — it shows the end state."
				: `Captured at t≈${atMs}ms — use mid-animation frames to verify motion against DESIGN.md's ## Motion inventory (timing/easing/reduced-motion).`,
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
			"All screens are shown in ONE page (viewport presets 375/390/768/1280, zoom, per-screen full-screen ↗, self-review-shot compare 📸, motion playback: ▶ 重播 / ⏸ 暂停 / ½× ¼× 慢放, per-screen ↺ 重播, element annotations: ✎ 批注 picks an element + note, 📋 复制反馈 copies an \"Element annotations (screen · selector · text):\" block the user may paste as the verdict); it regenerates on every review and can be reopened anytime with `pi-design playground`. The browser is for LOOKING at the design only — the verdict is given in this chat.",
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
		`Playground: ${file}\nAll ${screens.length} screen(s) in one page — viewport presets, zoom, per-screen full-screen (↗), self-review-shot compare (📸), motion playback (▶ 重播 / ⏸ 暂停 / ½× ¼× 慢放, per-screen ↺; needs screens to include ../motion.js, element annotations ✎ 批注 → 📋 复制反馈). Read-only view; the review verdict is still given in chat.`,
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

/** Built-in DESIGN.md presets: list / apply (writes DESIGN.md + tokens.css) / sync. */
function cmdPreset(positional, flags) {
	const sub = positional[0];
	if (sub === "list") {
		console.log(`Built-in presets (standard token names across all):\n${presetCatalog()}`);
		return;
	}
	if (sub === "apply") {
		const id = positional[1];
		if (!id) {
			console.error(`usage: pi-design preset apply <id> [--force]  (ids: ${listPresets().map((p) => p.id).join(", ")})`);
			process.exit(2);
		}
		let result;
		try {
			result = applyPreset(designPaths(CWD).root, id, { force: flags.force === true });
		} catch (error) {
			console.error(`preset failed: ${error.message}`);
			process.exit(1);
		}
		const state = loadState(CWD);
		state.preset = result.preset.id;
		saveState(CWD, state);
		const lines = [
			`Applied preset ${result.preset.name} (${result.preset.company}, ${result.preset.license}) → .design/DESIGN.md + .design/tokens.css.`,
		];
		if (result.backup) lines.push(`Previous DESIGN.md kept as ${result.backup} (tokens.css.bak too).`);
		lines.push(
			result.preset.fonts.googleFontsCss
				? `Fonts: every screen links <link rel="stylesheet" href="${result.preset.fonts.googleFontsCss}"> in <head>.`
				: "Fonts: system stack (no web font to link).",
			"Token names are the standard preset set (var(--color-primary), var(--type-body-md-size), …); attribution stays in DESIGN.md ## Overview.",
		);
		console.log(lines.join("\n"));
		return;
	}
	if (sub === "sync") {
		try {
			console.log(`tokens.css regenerated from DESIGN.md: ${syncTokens(designPaths(CWD).root)}`);
		} catch (error) {
			console.error(`preset failed: ${error.message}`);
			process.exit(1);
		}
		return;
	}
	console.error("usage: pi-design preset list | apply <id> [--force] | sync");
	process.exit(2);
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
  start <brief...> [--scope app|component] [--preset <id>]
                                    reset the workflow and print the full state machine
                                    (component scope: design ONLY the requested component)
  render <page> [--viewport WxH] [--at MS]
                                     screenshot one screen (view with read_image);
                                     --at MS captures a mid-animation frame at t=MS
  review                            lint + open the playground (all screens in one
                                    page) in the browser (then STOP; the verdict is
                                    the user's next chat message)
  playground                        (re)generate + open the playground read-only view
  status [--stage S] [--scope app|component] [--screens a,b] [--brief T] [--active 0|1]
                                    read/update .design/state.json (+ stage rules)
  preset list|apply <id> [--force]|sync   built-in DESIGN.md presets (Material 3, Fluent 2, Carbon, Primer, Spectrum)
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
	case "preset":
		cmdPreset(positional, flags);
		break;
	case "install-skill":
		cmdInstallSkill(positional);
		break;
	default:
		console.error(USAGE);
		process.exit(command ? 1 : 2);
}
