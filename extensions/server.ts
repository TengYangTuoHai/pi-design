/**
 * Local human-review server.
 *
 * Security model (this is a machine-local endpoint that can inject a user
 * message into a full-permission agent session, so it is treated as hostile
 * surface):
 *   - Binds 127.0.0.1 only. Default port is FIXED (stable URL across review
 *     rounds); occupied ports walk +1, random is the last resort.
 *   - The URL embeds a 192-bit random token — stable for the lifetime of one
 *     workflow, rotated when the workflow ends; unknown tokens get an
 *     unspecific 404.
 *   - POST /decision validates Host (must be 127.0.0.1/localhost:<port> —
 *     DNS-rebinding guard), Sec-Fetch-Site (reject cross-site) and Origin
 *     (must match) when present.
 *   - The decision endpoint is single-use per round and only active while a
 *     review is pending; the server closes right after a decision.
 *   - Static serving is path-confined to the project's .design/ directory.
 */
import * as http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

export type ReviewDecision = "approve" | "reject";

export interface ReviewServerOptions {
	/** Absolute path of the project's .design directory (static root). */
	designDir: string;
	/** Screen files relative to .design/prototype/, e.g. ["screens/login.html"]. */
	screens: string[];
	viewport: { width: number; height: number };
	round: number;
	target: string;
	/** Newest self-review shot per screen, relative to .design/ (compare view). */
	latestShots?: Record<string, string> | undefined;
	/**
	 * Preferred port. Fixed by default (stable review URL); the binder walks
	 * +1 while occupied and falls back to random only when the neighborhood
	 * is full. PI_DESIGN_PORT overrides the default.
	 */
	port?: number | undefined;
	/**
	 * Reuse a workflow-stable token so the review URL survives round trips.
	 * Generated fresh when omitted.
	 */
	token?: string | undefined;
	onDecision: (decision: ReviewDecision, comment: string | undefined) => void;
}

export interface ReviewServerHandle {
	url: string;
	token: string;
	port: number;
	close(): Promise<void>;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".ico": "image/x-icon",
};

function tokenEquals(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ba.length !== bb.length) return false;
	return timingSafeEqual(ba, bb);
}

/** Returns true when the request may perform a state-changing action. */
function requestAuthorized(req: http.IncomingMessage, port: number): boolean {
	const host = String(req.headers.host ?? "");
	if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
	const secFetchSite = req.headers["sec-fetch-site"];
	if (secFetchSite !== undefined) {
		const site = Array.isArray(secFetchSite) ? secFetchSite[0] : secFetchSite;
		if (site !== "same-origin" && site !== "none") return false;
	}
	const origin = req.headers.origin;
	if (origin !== undefined) {
		const o = Array.isArray(origin) ? origin[0] : origin;
		if (o !== `http://127.0.0.1:${port}` && o !== `http://localhost:${port}`) return false;
	}
	return true;
}

function reviewPageHtml(opts: ReviewServerOptions, token: string): string {
	const shots = opts.latestShots ?? {};
	const frames = opts.screens
		.map((screen) => {
			const src = `static/prototype/${screen.split("/").map(encodeURIComponent).join("/")}`;
			const label = path.basename(screen, ".html");
			const shot = shots[screen];
			const shotBtn = shot
				? `<button class="tool" data-shot="${shot}" title="对照模型最后自检截图">截图</button>`
				: "";
			const replayBtn = `<button class="tool rpl" title="重播本屏动效">↺ 重播</button>`;
			return `<figure class="screen" data-screen="${screen}">
				<figcaption>
					<span>${label} <span class="dim">${screen}</span></span>
					<span class="tools"><button class="tool ann" title="点选元素添加批注（Esc 取消）">✎ 批注</button>${replayBtn}${shotBtn}<a class="tool" href="${src}" target="_blank" rel="noopener">↗ 新标签</a></span>
				</figcaption>
				<div class="sizer">
					<div class="frame"><iframe src="${src}" loading="lazy"></iframe></div>
				</div>
			</figure>`;
		})
		.join("\n");
	const presets = [
		[375, 812, "手机 375"],
		[390, 844, "手机 390"],
		[768, 1024, "平板 768"],
		[1280, 800, "桌面 1280"],
	]
		.map(([w, h, label]) => `<button class="preset" data-w="${w}" data-h="${h}">${label}</button>`)
		.join("");
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>/design 人工审核 · 第 ${opts.round} 轮</title>
<style>
	:root { color-scheme: dark; }
	* { box-sizing: border-box; }
	body { margin:0; font: 14px/1.6 -apple-system, "SF Pro Text", "Segoe UI", sans-serif; background:#16181d; color:#e8eaed; }
	header { position:fixed; left:0; right:0; top:0; z-index:2; display:flex; gap:14px; align-items:center; padding:10px 20px; background:#1d2026; border-bottom:1px solid #2b2f37; flex-wrap:wrap; }
	header h1 { font-size:15px; margin:0; font-weight:600; }
	.dim { color:#9aa0a6; font-weight:400; font-size:12px; }
	.spacer { flex:1; }
	.presets { display:flex; gap:6px; align-items:center; }
	.preset { background:#262a32; color:#c7cbd1; border:1px solid #343946; border-radius:6px; padding:5px 10px; font:12px inherit; cursor:pointer; }
	.preset:hover { background:#2e333d; }
	.zoom { display:flex; gap:8px; align-items:center; font-size:12px; color:#9aa0a6; }
	.mbar { display:flex; gap:6px; align-items:center; padding-left:14px; border-left:1px solid #2b2f37; flex-wrap:wrap; }
	.mbtn { background:#262a32; color:#c7cbd1; border:1px solid #343946; border-radius:6px; padding:5px 10px; font:12px inherit; cursor:pointer; }
	.mbtn:hover { background:#2e333d; }
	.mbtn.active { color:#e8eaed; border-color:#6ea8fe; }
	.mnote { font-size:11px; color:#f2cc60; }
	#canvas { position:fixed; left:0; right:0; top:0; bottom:0; overflow:hidden; cursor:default; background-color:#16181d; background-image:radial-gradient(#2b2f37 1px, transparent 1px); }
	#world { position:absolute; left:0; top:0; transform-origin:0 0; }
	.screen { position:absolute; margin:0; }
	body.dragging { user-select:none; }
	body.dragging #canvas { cursor:grabbing; }
	body.panmode #canvas { cursor:grab; }
	body.dragging #world iframe, body.panmode #world iframe { pointer-events:none; }
	.screen figcaption { margin:0 0 8px 2px; font-size:13px; font-weight:600; display:flex; justify-content:space-between; align-items:baseline; gap:12px; cursor:move; }
	.tools { display:flex; gap:6px; font-weight:400; }
	.tool { background:none; border:1px solid #343946; color:#9aa0a6; border-radius:6px; padding:2px 8px; font:11px inherit; cursor:pointer; text-decoration:none; white-space:nowrap; }
	.tool:hover, .tool.on { color:#e8eaed; border-color:#6ea8fe; }
	.notes { flex-basis:100%; margin:0; padding:0; list-style:none; max-height:28vh; overflow:auto; display:flex; flex-direction:column; gap:6px; }
	.notes li { display:flex; gap:8px; align-items:center; }
	.nidx { flex:none; min-width:18px; height:18px; padding:0 4px; border-radius:9px; background:#6ea8fe; color:#0b0c0f; font-weight:700; font-size:11px; line-height:18px; text-align:center; }
	.nmeta { flex:none; max-width:45%; color:#9aa0a6; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.nnote { flex:1; min-width:0; background:#12141a; color:#e8eaed; border:1px solid #343946; border-radius:6px; padding:6px 10px; font-size:13px; font-family:inherit; }
	.nnote:focus { outline:1px solid #6ea8fe; }
	.sizer { overflow:hidden; }
	.frame { border:8px solid #0b0c0f; border-radius:28px; background:#fff; overflow:hidden; box-shadow:0 12px 32px rgba(0,0,0,.45); transform-origin:top left; }
	iframe { width:100%; height:100%; border:0; display:block; background:#fff; }
	img.shot { display:block; width:100%; height:100%; object-fit:contain; background:#fff; }
	footer { position:fixed; bottom:0; left:0; right:0; display:flex; gap:12px; padding:14px 20px; background:#1d2026; border-top:1px solid #2b2f37; align-items:flex-end; }
	textarea { flex:1; min-height:52px; resize:vertical; background:#12141a; color:#e8eaed; border:1px solid #343946; border-radius:8px; padding:10px 12px; font:inherit; }
	textarea:focus { outline:1px solid #6ea8fe; }
	button { border:0; border-radius:8px; padding:11px 22px; font:600 14px/1 inherit; cursor:pointer; }
	.approve { background:#2f9e63; color:#fff; }
	.approve:hover { background:#37b46f; }
	.reject { background:#3a3f4a; color:#e8eaed; }
	.reject:hover { background:#464c59; }
	button:disabled { opacity:.45; cursor:default; }
	.result { padding:12px 20px; font-weight:600; }
	.ok { color:#4cc38a; } .no { color:#ff7b72; }
</style>
</head>
<body>
<header>
	<h1>/design 人工审核</h1>
	<span class="dim">第 ${opts.round} 轮 · target: ${opts.target} · ${opts.screens.length} 屏</span>
	<span class="spacer"></span>
	<span class="presets">${presets}</span>
	<label class="zoom">缩放 <input id="zoom" type="range" min="10" max="200" step="5" value="100"> <span id="zoomv">100%</span></label>
	<button id="cfit" class="preset cbtn" type="button" title="缩放以显示全部屏幕 (F)">⤢ 适应</button>
	<button id="creset" class="preset cbtn" type="button" title="清除手动摆放，恢复自动排列">⟲ 重排</button>
	<span class="mbar">
		<button class="mbtn" id="mreplay" type="button" title="重播所有屏的动效">▶ 重播</button>
		<button class="mbtn" id="mpause" type="button" title="暂停 / 继续所有动画">⏸ 暂停</button>
		<button class="mbtn mspd active" data-r="1" type="button">1×</button>
		<button class="mbtn mspd" data-r="0.5" type="button">½×</button>
		<button class="mbtn mspd" data-r="0.25" type="button">¼×</button>
		<span class="mnote" id="mnote" style="display:none"></span>
	</span>
</header>
<main id="canvas"><div id="world">${frames}</div></main>
<footer id="bar" style="flex-wrap:wrap">
	<ol id="notes" class="notes" hidden></ol>
	<span class="hint">快捷键：A 通过 · R 驳回 · / 填意见 · 1-4 切换视口预设 · F 适应 · 空格+拖动 平移 · ✎ 批注时 Esc 取消</span>
	<textarea id="comment" placeholder="意见（驳回时建议必填；通过时可留空）"></textarea>
	<button class="reject" id="reject">驳回 (R)</button>
	<button class="approve" id="approve">通过 (A)</button>
</footer>
<script>
const bar = document.getElementById("bar");
const canvas = document.getElementById("canvas");
const world = document.getElementById("world");
let width = ${opts.viewport.width}, height = ${opts.viewport.height};
// ---- pan/zoom canvas: view state, dots, drag, persistence ----
const view = { x: 0, y: 0, z: 1 };
const layout = { pos: {} }; // screen path -> { x, y } for manually placed cards
let topZ = 1;
function clampZ(z) {
	return Math.min(2, Math.max(0.1, z));
}
function applyView() {
	world.style.transform = "translate(" + view.x + "px, " + view.y + "px) scale(" + view.z + ")";
	canvas.style.backgroundSize = 24 * view.z + "px " + 24 * view.z + "px";
	canvas.style.backgroundPosition = view.x + "px " + view.y + "px";
	document.getElementById("zoomv").textContent = Math.round(view.z * 100) + "%";
	document.getElementById("zoom").value = Math.round(view.z * 100);
}
function zoomAt(cx, cy, newZ) {
	const wx = (cx - view.x) / view.z;
	const wy = (cy - view.y) / view.z;
	view.z = clampZ(newZ);
	view.x = cx - wx * view.z;
	view.y = cy - wy * view.z;
	applyView();
}
function layoutBounds() {
	canvas.style.top = document.querySelector("header").offsetHeight + "px";
	canvas.style.bottom = bar.offsetHeight + "px";
}
function autoLayout() {
	let x = 0;
	for (const fig of document.querySelectorAll(".screen")) {
		if (layout.pos[fig.dataset.screen]) continue;
		fig.style.left = x + "px";
		fig.style.top = "0px";
		x += fig.offsetWidth + 80;
	}
}
function fit() {
	const figs = [...document.querySelectorAll(".screen")];
	if (figs.length === 0) {
		applyView();
		return;
	}
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const fig of figs) {
		minX = Math.min(minX, fig.offsetLeft);
		minY = Math.min(minY, fig.offsetTop);
		maxX = Math.max(maxX, fig.offsetLeft + fig.offsetWidth);
		maxY = Math.max(maxY, fig.offsetTop + fig.offsetHeight);
	}
	const bw = maxX - minX;
	const bh = maxY - minY;
	view.z = clampZ(Math.min((canvas.clientWidth - 80) / bw, (canvas.clientHeight - 80) / bh, 1));
	view.x = (canvas.clientWidth - bw * view.z) / 2 - minX * view.z;
	view.y = (canvas.clientHeight - bh * view.z) / 2 - minY * view.z;
	applyView();
	saveSoon(); // a reload reopens what the reviewer last saw
}
function storeKey() {
	return "pi-design:canvas:" + location.pathname;
}
function saveLayout() {
	try {
		localStorage.setItem(storeKey(), JSON.stringify({ view, pos: layout.pos }));
	} catch {
		/* storage unavailable */
	}
}
let saveTimer = 0;
function saveSoon() {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(saveLayout, 300);
}
function loadLayout() {
	let restored = false;
	try {
		const data = JSON.parse(localStorage.getItem(storeKey()) || "null");
		if (data && data.pos) {
			for (const fig of document.querySelectorAll(".screen")) {
				const p = data.pos[fig.dataset.screen];
				if (p) {
					fig.style.left = p.x + "px";
					fig.style.top = p.y + "px";
					layout.pos[fig.dataset.screen] = { x: p.x, y: p.y };
				}
			}
		}
		if (data && data.view && isFinite(data.view.x) && isFinite(data.view.y) && isFinite(data.view.z)) {
			view.x = data.view.x;
			view.y = data.view.y;
			view.z = clampZ(data.view.z);
			restored = true;
		}
	} catch {
		/* missing or corrupt storage */
	}
	return restored;
}
function apply() {
	for (const fig of document.querySelectorAll(".screen")) {
		const frame = fig.querySelector(".frame");
		frame.style.width = width + "px";
		frame.style.height = height + "px";
		const sizer = fig.querySelector(".sizer");
		sizer.style.width = (width + 16) + "px";
		sizer.style.height = (height + 16) + "px";
	}
	autoLayout();
}
document.querySelectorAll(".preset:not(.cbtn)").forEach((b) => b.addEventListener("click", () => {
	width = +b.dataset.w; height = +b.dataset.h; apply();
}));
document.getElementById("zoom").addEventListener("input", (e) => {
	const r = canvas.getBoundingClientRect();
	zoomAt(r.width / 2, r.height / 2, +e.target.value / 100);
	saveSoon();
});
document.getElementById("cfit").addEventListener("click", () => fit());
document.getElementById("creset").addEventListener("click", () => {
	layout.pos = {};
	autoLayout();
	fit();
	saveSoon();
});
canvas.addEventListener("wheel", (e) => {
	e.preventDefault();
	if (e.ctrlKey || e.metaKey) {
		const r = canvas.getBoundingClientRect();
		zoomAt(e.clientX - r.left, e.clientY - r.top, view.z * Math.exp(-e.deltaY * 0.01));
	} else {
		view.x -= e.shiftKey ? e.deltaY : e.deltaX;
		view.y -= e.shiftKey ? 0 : e.deltaY;
		applyView();
	}
	saveSoon();
}, { passive: false });
// pan: empty surface with button 0, middle button anywhere, or Space pan mode
let panDrag = null;
canvas.addEventListener("pointerdown", (e) => {
	const empty = e.target === canvas || e.target === world;
	if (!(e.button === 1 || (e.button === 0 && (empty || document.body.classList.contains("panmode"))))) return;
	e.preventDefault();
	canvas.setPointerCapture(e.pointerId);
	panDrag = { px: e.clientX, py: e.clientY };
	document.body.classList.add("dragging");
});
canvas.addEventListener("pointermove", (e) => {
	if (!panDrag) return;
	view.x += e.clientX - panDrag.px;
	view.y += e.clientY - panDrag.py;
	panDrag.px = e.clientX;
	panDrag.py = e.clientY;
	applyView();
});
const endPan = () => {
	if (!panDrag) return;
	panDrag = null;
	document.body.classList.remove("dragging");
	saveSoon();
};
canvas.addEventListener("pointerup", endPan);
canvas.addEventListener("pointercancel", endPan);
// cards: drag by title bar, ignore presses on the embedded controls
document.querySelectorAll(".screen figcaption").forEach((cap) => {
	const fig = cap.closest(".screen");
	let drag = null;
	cap.addEventListener("pointerdown", (e) => {
		if (e.button !== 0 || e.target.closest("button, a, input")) return;
		e.preventDefault();
		cap.setPointerCapture(e.pointerId);
		drag = { px: e.clientX, py: e.clientY, moved: false };
	});
	cap.addEventListener("pointermove", (e) => {
		if (!drag) return;
		const dx = e.clientX - drag.px;
		const dy = e.clientY - drag.py;
		if (!drag.moved) {
			if (Math.hypot(dx, dy) < 3) return;
			drag.moved = true;
			document.body.classList.add("dragging");
			fig.style.zIndex = ++topZ;
		}
		fig.style.left = fig.offsetLeft + dx / view.z + "px";
		fig.style.top = fig.offsetTop + dy / view.z + "px";
		drag.px = e.clientX;
		drag.py = e.clientY;
	});
	const endDrag = () => {
		if (!drag) return;
		const moved = drag.moved;
		drag = null;
		document.body.classList.remove("dragging");
		if (moved) {
			layout.pos[fig.dataset.screen] = {
				x: parseFloat(fig.style.left) || 0,
				y: parseFloat(fig.style.top) || 0,
			};
			saveSoon();
		}
	};
	cap.addEventListener("pointerup", endDrag);
	cap.addEventListener("pointercancel", endDrag);
});
document.querySelectorAll("button.tool[data-shot]").forEach((b) => b.addEventListener("click", () => {
	const fig = b.closest(".screen");
	const frame = fig.querySelector(".frame");
	if (b.classList.toggle("on")) {
		const iframe = frame.querySelector("iframe");
		if (iframe) { frame.dataset.src = iframe.getAttribute("src"); iframe.remove(); }
		const img = document.createElement("img");
		img.className = "shot";
		img.src = "static/" + b.dataset.shot;
		frame.appendChild(img);
	} else {
		frame.querySelector("img")?.remove();
		const iframe = document.createElement("iframe");
		iframe.src = frame.dataset.src || "about:blank";
		frame.appendChild(iframe);
	}
}));
// ---- motion playback: postMessage to each screen's ../motion.js runtime ----
// Screens carrying the runtime ACK (plus a "ready" ping on load) and get
// smooth in-place control; screens without it fall back to an iframe reload
// for replay (which also restarts animations) and are flagged for pause/slow-mo.
const frameEls = () => [...document.querySelectorAll(".frame iframe")];
function postMotion(iframe, action, extra) {
	try {
		iframe.contentWindow.postMessage({ type: "pi-design:motion", action, ...extra }, "*");
	} catch {
		/* frame not ready */
	}
}
window.addEventListener("message", (e) => {
	if (e.data?.type === "pi-design:motion-ack") {
		for (const f of frameEls()) {
			if (f.contentWindow === e.source) {
				f.dataset.motion = "1";
				if (e.data.action === "ready") sendMarks(f); // restore badges after reload
				break;
			}
		}
		return;
	}
	if (e.data?.type !== "pi-design:annotate-pick" && e.data?.type !== "pi-design:annotate-cancel") return;
	let fig;
	for (const f of frameEls()) {
		if (f.contentWindow === e.source) {
			fig = f.closest(".screen");
			break;
		}
	}
	if (!fig) return;
	const btn = fig.querySelector(".tool.ann");
	if (btn) btn.classList.remove("on");
	if (e.data.type === "pi-design:annotate-pick") {
		notes.push({
			screen: fig.dataset.screen,
			selector: e.data.selector,
			text: e.data.text || "",
			tag: e.data.tag || "",
			note: "",
		});
		renderNotes();
		const inputs = document.querySelectorAll(".nnote");
		if (inputs.length > 0) inputs[inputs.length - 1].focus();
	}
});
function replayFrame(f) {
	if (f.dataset.motion === "1") postMotion(f, "replay");
	else f.setAttribute("src", f.getAttribute("src")); // no runtime → reload restarts animations
}
function noteMissingRuntime() {
	const missing = frameEls().filter((f) => f.dataset.motion !== "1").length;
	const el = document.getElementById("mnote");
	if (!el) return;
	if (missing > 0) {
		el.textContent = missing + " 屏未接入 ../motion.js（重播可用，暂停/慢放不可用）";
		el.style.display = "inline";
	} else {
		el.style.display = "none";
	}
}
let paused = false;
document.getElementById("mreplay").addEventListener("click", () => frameEls().forEach(replayFrame));
document.getElementById("mpause").addEventListener("click", function () {
	paused = !paused;
	this.textContent = paused ? "▶ 继续" : "⏸ 暂停";
	for (const f of frameEls()) {
		if (f.dataset.motion === "1") postMotion(f, paused ? "pause" : "play");
	}
	noteMissingRuntime();
});
document.querySelectorAll(".mbtn.mspd").forEach((b) =>
	b.addEventListener("click", () => {
		const rate = +b.dataset.r;
		document.querySelectorAll(".mbtn.mspd").forEach((x) => x.classList.toggle("active", +x.dataset.r === rate));
		for (const f of frameEls()) {
			if (f.dataset.motion === "1") postMotion(f, "rate", { rate });
		}
		noteMissingRuntime();
	}),
);
document.querySelectorAll("button.rpl").forEach((b) =>
	b.addEventListener("click", () => {
		const f = b.closest(".screen")?.querySelector(".frame iframe");
		if (f) replayFrame(f);
	}),
);
// ---- element annotations: pin numbered notes to concrete elements ----
const notes = []; // { screen, selector, text, tag, note }
function frameOf(fig) {
	return fig.querySelector(".frame iframe"); // null while the shot compare shows
}
function postAnnotate(iframe, action, extra) {
	try {
		iframe.contentWindow.postMessage({ type: "pi-design:annotate", action, ...extra }, "*");
	} catch {
		/* frame not ready */
	}
}
function sendMarks(iframe) {
	const fig = iframe.closest(".screen");
	if (!fig) return;
	const marks = [];
	for (let i = 0; i < notes.length; i++) {
		if (notes[i].screen === fig.dataset.screen) marks.push({ n: i + 1, selector: notes[i].selector });
	}
	postAnnotate(iframe, "marks", { marks });
}
function renderNotes() {
	const list = document.getElementById("notes");
	list.textContent = "";
	list.hidden = notes.length === 0;
	for (let i = 0; i < notes.length; i++) {
		const note = notes[i];
		const li = document.createElement("li");
		const idx = document.createElement("span");
		idx.className = "nidx";
		idx.textContent = String(i + 1);
		const label = note.screen.split("/").pop().replace(/\\.html$/, "");
		const meta = document.createElement("span");
		meta.className = "nmeta";
		meta.textContent = note.text ? label + ' · "' + note.text + '"' : label + " · " + note.tag;
		const input = document.createElement("input");
		input.className = "nnote";
		input.placeholder = "这里有什么问题？";
		input.value = note.note;
		input.addEventListener("input", () => {
			note.note = input.value;
		});
		const del = document.createElement("button");
		del.className = "tool ndel";
		del.type = "button";
		del.title = "删除";
		del.textContent = "×";
		del.addEventListener("click", () => {
			notes.splice(notes.indexOf(note), 1);
			renderNotes();
		});
		li.append(idx, meta, input, del);
		list.appendChild(li);
	}
	for (const f of frameEls()) sendMarks(f);
	layoutBounds();
}
function stopPicking() {
	for (const b of document.querySelectorAll(".tool.ann.on")) {
		b.classList.remove("on");
		const iframe = frameOf(b.closest(".screen"));
		if (iframe) postAnnotate(iframe, "cancel");
	}
}
document.querySelectorAll("button.tool.ann").forEach((b) =>
	b.addEventListener("click", () => {
		if (b.classList.contains("on")) {
			stopPicking();
			return;
		}
		stopPicking(); // one screen picks at a time
		const iframe = frameOf(b.closest(".screen"));
		if (!iframe) return;
		if (iframe.dataset.motion !== "1") {
			const el = document.getElementById("mnote");
			el.textContent = "该屏未接入 ../motion.js，无法点选元素";
			el.style.display = "inline";
			setTimeout(noteMissingRuntime, 3000);
			return;
		}
		b.classList.add("on");
		postAnnotate(iframe, "pick");
	}),
);
function composeFeedback() {
	const general = document.getElementById("comment").value.trim();
	if (notes.length === 0) return general;
	const lines = [];
	if (general) lines.push(general, "");
	lines.push("Element annotations (screen · selector · text):");
	for (let i = 0; i < notes.length; i++) {
		const note = notes[i];
		lines.push(i + 1 + ". " + note.screen + " · " + note.selector + " · " + (note.text ? '"' + note.text + '"' : "(no text)"));
		lines.push("   → " + (note.note.trim() || "(no note)"));
	}
	return lines.join("\\n");
}
function decide(action) {
	const comment = composeFeedback();
	if (action === "reject" && !comment && !confirm("未填写驳回意见，确定直接驳回？")) return;
	for (const b of document.querySelectorAll("footer button")) b.disabled = true;
	fetch("/${token}/decision", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action, comment: comment || null }),
	}).then(async (r) => {
		const body = await r.json().catch(() => ({}));
		if (r.ok) {
			bar.outerHTML = '<footer class="result ok">已' + (action === "approve" ? "通过" : "驳回") + "，结果已回传会话，可关闭本页。</footer>";
		} else if (r.status === 410) {
			bar.outerHTML = '<footer class="result no">本轮已有审核结果（410），可关闭本页。</footer>';
		} else {
			alert("提交失败（HTTP " + r.status + " " + (body.error || "") + "），请重试或回到会话用文字回复。");
			for (const b of document.querySelectorAll("footer button")) b.disabled = false;
		}
	}).catch(() => {
		alert("网络错误，请重试或回到会话用文字回复。");
		for (const b of document.querySelectorAll("footer button")) b.disabled = false;
	});
}
document.getElementById("approve").addEventListener("click", () => decide("approve"));
document.getElementById("reject").addEventListener("click", () => decide("reject"));
document.addEventListener("keydown", (e) => {
	if (e.metaKey || e.ctrlKey || e.altKey) return;
	if (e.key === "Escape" && document.querySelector(".tool.ann.on")) {
		e.preventDefault();
		stopPicking();
		return;
	}
	const tag = document.activeElement ? document.activeElement.tagName : "";
	if (tag === "TEXTAREA" || tag === "INPUT") return;
	if (e.key === "a" || e.key === "A") decide("approve");
	else if (e.key === "r" || e.key === "R") decide("reject");
	else if (e.key === "/") { e.preventDefault(); document.getElementById("comment").focus(); }
	else if (e.key >= "1" && e.key <= "4") {
		const b = document.querySelectorAll(".preset:not(.cbtn)")[+e.key - 1];
		if (b) b.click();
	} else if (e.key === " ") {
		e.preventDefault(); // Space pans: hold and drag the canvas
		document.body.classList.add("panmode");
	}
});
document.addEventListener("keyup", (e) => {
	if (e.key === " ") document.body.classList.remove("panmode");
});
const viewRestored = loadLayout();
apply();
layoutBounds();
if (viewRestored) applyView();
else fit();
window.addEventListener("resize", layoutBounds);
</script>
</body>
</html>`;
}

export async function startReviewServer(opts: ReviewServerOptions): Promise<ReviewServerHandle> {
	const token = opts.token ?? randomBytes(24).toString("hex");
	let decided = false;
	let idleTimer: NodeJS.Timeout | undefined;

	const server = http.createServer((req, res) => {
		resetIdle();
		try {
			handle(req, res).catch((error: unknown) => {
				res.writeHead(500, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: String(error) }));
			});
		} catch (error) {
			res.writeHead(500, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
	});

	function resetIdle(): void {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => void close(), IDLE_TIMEOUT_MS);
		idleTimer.unref?.();
	}

	async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const port = (server.address() as { port: number }).port;
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const segments = url.pathname.split("/").filter(Boolean); // [token, ...rest]
		const reqToken = segments[0] ?? "";
		if (!tokenEquals(reqToken, token)) {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("not found");
			return;
		}
		const rest = `/${segments.slice(1).join("/")}`;

		// Review page
		if (req.method === "GET" && (rest === "/" || rest === "")) {
			res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
			res.end(reviewPageHtml(opts, token));
			return;
		}

		// Static files confined to .design/
		if (req.method === "GET" && rest.startsWith("/static/")) {
			const rel = decodeURIComponent(rest.slice("/static/".length));
			const resolved = path.resolve(opts.designDir, rel);
			if (
				resolved !== opts.designDir &&
				!resolved.startsWith(`${opts.designDir}${path.sep}`)
			) {
				res.writeHead(404, { "content-type": "text/plain" });
				res.end("not found");
				return;
			}
			if (!existsSync(resolved) || !statSync(resolved).isFile()) {
				res.writeHead(404, { "content-type": "text/plain" });
				res.end("not found");
				return;
			}
			const mime = MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream";
			res.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
			res.end(readFileSync(resolved));
			return;
		}

		// Decision endpoint — single-use, origin-checked
		if (req.method === "POST" && rest === "/decision") {
			if (!requestAuthorized(req, port)) {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "forbidden" }));
				return;
			}
			if (decided) {
				res.writeHead(410, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "already decided" }));
				return;
			}
			const body = await readBody(req, 64 * 1024);
			let parsed: unknown;
			try {
				parsed = JSON.parse(body);
			} catch {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "invalid json" }));
				return;
			}
			const action =
				parsed && typeof parsed === "object" && (parsed as { action?: unknown }).action;
			const rawComment =
				parsed && typeof parsed === "object" ? (parsed as { comment?: unknown }).comment : undefined;
			if (action !== "approve" && action !== "reject") {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "action must be approve|reject" }));
				return;
			}
			const comment = typeof rawComment === "string" && rawComment.trim() ? rawComment.trim() : undefined;
			decided = true;
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: true }));
			opts.onDecision(action, comment);
			setTimeout(() => void close(), 100).unref?.();
			return;
		}

		res.writeHead(404, { "content-type": "text/plain" });
		res.end("not found");
	}

	let closing: Promise<void> | undefined;
	const close = (): Promise<void> => {
		if (closing) return closing;
		closing = new Promise<void>((resolve) => {
			if (idleTimer) clearTimeout(idleTimer);
			server.closeAllConnections?.();
			server.close(() => resolve());
		});
		return closing;
	};

	const port = await bindReviewPort(server, opts.port);
	resetIdle();
	return {
		url: `http://127.0.0.1:${port}/${token}/`,
		token,
		port,
		close,
	};
}

// ---------------------------------------------------------------------------
// Port policy: a fixed default so the review URL stays stable across rounds;
// walk +1 while occupied, fall back to a random port only when the whole
// neighborhood is taken.
// ---------------------------------------------------------------------------

/** "DESI" on a phone keypad. Override with PI_DESIGN_PORT or opts.port. */
export const DEFAULT_REVIEW_PORT = 3374;

function desiredPort(explicit: number | undefined): number {
	if (typeof explicit === "number" && Number.isInteger(explicit) && explicit > 0 && explicit < 65536) {
		return explicit;
	}
	const env = process.env.PI_DESIGN_PORT;
	if (env && /^\d+$/.test(env)) {
		const p = Number.parseInt(env, 10);
		if (p > 0 && p < 65536) return p;
	}
	return DEFAULT_REVIEW_PORT;
}

/** Resolves to the bound port, or undefined when this candidate is occupied. */
function tryListen(server: http.Server, port: number): Promise<number | undefined> {
	return new Promise((resolve, reject) => {
		const onListen = () => {
			cleanup();
			resolve((server.address() as { port: number }).port);
		};
		const onError = (err: NodeJS.ErrnoException) => {
			cleanup();
			if (err.code === "EADDRINUSE") resolve(undefined);
			else reject(err);
		};
		const cleanup = () => {
			server.off("listening", onListen);
			server.off("error", onError);
		};
		server.once("listening", onListen);
		server.once("error", onError);
		server.listen(port, "127.0.0.1");
	});
}

async function bindReviewPort(server: http.Server, explicit: number | undefined): Promise<number> {
	const base = desiredPort(explicit);
	const candidates: number[] = [base];
	for (let p = base + 1; p < Math.min(base + 25, 65536); p += 1) candidates.push(p);
	candidates.push(0); // last resort: any free port
	for (const candidate of candidates) {
		const bound = await tryListen(server, candidate);
		if (bound !== undefined) return bound;
	}
	throw new Error(`unable to bind a review port (tried ${base}..${base + 24} and random)`);
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > limit) {
				reject(new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
