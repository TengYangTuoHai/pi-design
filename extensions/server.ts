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
					<span class="tools">${replayBtn}${shotBtn}<a class="tool" href="${src}" target="_blank" rel="noopener">↗ 新标签</a></span>
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
	header { position:sticky; top:0; z-index:2; display:flex; gap:14px; align-items:center; padding:10px 20px; background:#1d2026; border-bottom:1px solid #2b2f37; flex-wrap:wrap; }
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
	main { display:flex; gap:28px; padding:24px 20px 140px; overflow-x:auto; align-items:flex-start; flex-wrap:wrap; }
	.screen figcaption { margin:0 0 8px 2px; font-size:13px; font-weight:600; display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
	.tools { display:flex; gap:6px; font-weight:400; }
	.tool { background:none; border:1px solid #343946; color:#9aa0a6; border-radius:6px; padding:2px 8px; font:11px inherit; cursor:pointer; text-decoration:none; white-space:nowrap; }
	.tool:hover, .tool.on { color:#e8eaed; border-color:#6ea8fe; }
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
	<label class="zoom">缩放 <input id="zoom" type="range" min="25" max="100" step="5" value="100"> <span id="zoomv">100%</span></label>
	<span class="mbar">
		<button class="mbtn" id="mreplay" type="button" title="重播所有屏的动效">▶ 重播</button>
		<button class="mbtn" id="mpause" type="button" title="暂停 / 继续所有动画">⏸ 暂停</button>
		<button class="mbtn mspd active" data-r="1" type="button">1×</button>
		<button class="mbtn mspd" data-r="0.5" type="button">½×</button>
		<button class="mbtn mspd" data-r="0.25" type="button">¼×</button>
		<span class="mnote" id="mnote" style="display:none"></span>
	</span>
</header>
<main>
${frames}
</main>
<footer id="bar" style="flex-wrap:wrap">
	<span class="hint">快捷键：A 通过 · R 驳回 · / 填意见 · 1-4 切换视口预设</span>
	<textarea id="comment" placeholder="意见（驳回时建议必填；通过时可留空）"></textarea>
	<button class="reject" id="reject">驳回 (R)</button>
	<button class="approve" id="approve">通过 (A)</button>
</footer>
<script>
const bar = document.getElementById("bar");
let scale = 1, width = ${opts.viewport.width}, height = ${opts.viewport.height};
function apply() {
	document.getElementById("zoomv").textContent = Math.round(scale * 100) + "%";
	for (const fig of document.querySelectorAll(".screen")) {
		const frame = fig.querySelector(".frame");
		frame.style.width = width + "px";
		frame.style.height = height + "px";
		frame.style.transform = scale === 1 ? "none" : "scale(" + scale + ")";
		const sizer = fig.querySelector(".sizer");
		sizer.style.width = (width * scale + 16) + "px";
		sizer.style.height = (height * scale + 16) + "px";
	}
}
document.querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => {
	width = +b.dataset.w; height = +b.dataset.h; apply();
}));
document.getElementById("zoom").addEventListener("input", (e) => { scale = +e.target.value / 100; apply(); });
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
	if (e.data?.type !== "pi-design:motion-ack") return;
	for (const f of frameEls()) {
		if (f.contentWindow === e.source) {
			f.dataset.motion = "1";
			break;
		}
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
function decide(action) {
	const comment = document.getElementById("comment").value.trim();
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
	const tag = document.activeElement ? document.activeElement.tagName : "";
	if (tag === "TEXTAREA" || tag === "INPUT") return;
	if (e.key === "a" || e.key === "A") decide("approve");
	else if (e.key === "r" || e.key === "R") decide("reject");
	else if (e.key === "/") { e.preventDefault(); document.getElementById("comment").focus(); }
	else if (e.key >= "1" && e.key <= "4") {
		const b = document.querySelectorAll(".preset")[+e.key - 1];
		if (b) b.click();
	}
});
apply();
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
