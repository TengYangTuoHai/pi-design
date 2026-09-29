/**
 * Motion playback runtime for prototype screens.
 *
 * Designing motion is part of the workflow, so the prototype screens need a
 * way to be PLAYED in review: replay an entrance, pause mid-flight, slow a
 * transition down. Each screen therefore includes one auto-generated script:
 *
 *   .design/prototype/motion.js      <- written by this module (never hand-edited)
 *   screens/*.html                    <- <script src="../motion.js"></script> before </body>
 *
 * The runtime is deliberately tiny and dependency-free: it listens for
 * postMessage commands from a host page (playground.html, the Pi review
 * server) and controls every declarative animation on the page via the Web
 * Animations API (CSS animations, CSS transitions, WAAPI). JS/rAF tick loops
 * are intentionally out of scope — the workflow prompt tells the model to
 * build prototype motion declaratively so it stays controllable.
 *
 * Protocol (host -> iframe):   { type: "pi-design:motion", action, rate? }
 *   action: "replay" | "pause" | "play" | "rate"    rate: number > 0 (0.25 = ¼×)
 * Ack (iframe -> host):        { type: "pi-design:motion-ack", action, animations }
 *   Sent for every handled action, plus once with action:"ready" on load —
 *   hosts use it to detect the runtime and fall back to an iframe reload
 *   (which restarts animations too) when it is absent.
 *
 * Element annotation (review hosts pin comments to concrete elements). The
 * picker lives in the screen because file:// hosts (playground.html) are
 * cross-origin to their iframes and can only talk via postMessage.
 *   host -> iframe:  { type: "pi-design:annotate", action: "pick" }     enter pick mode (one pick)
 *                    { type: "pi-design:annotate", action: "cancel" }   leave pick mode
 *                    { type: "pi-design:annotate", action: "marks", marks: [{ n, selector }] }
 *                                                                        replace the numbered badges
 *   iframe -> host:  { type: "pi-design:annotate-pick", selector, tag, text, rect: { x, y, width, height } }
 *                    { type: "pi-design:annotate-cancel" }              Escape / cancel while picking
 *   `selector` is a CSS selector unique within the screen; `rect` is in
 *   document CSS px (scroll-independent). Badges are review-only overlays and
 *   are cleared on reload, so hosts re-send "marks" after each "ready" ping.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export const MOTION_RUNTIME_FILENAME = "motion.js";

export const MOTION_RUNTIME_VERSION = 2;

export const MOTION_RUNTIME_JS = `/* pi-design motion runtime v${MOTION_RUNTIME_VERSION} — auto-generated (pi-design), do not edit.
   Review hosts talk to it via postMessage: motion playback (replay / pause / play / rate)
   and element annotation (pick an element, show numbered badges). */
(function () {
	"use strict";
	if (window.__piDesignMotion) return;
	var state = { paused: false, rate: 1 };
	function anims() {
		return typeof document.getAnimations === "function" ? document.getAnimations() : [];
	}
	function each(fn) {
		anims().forEach(function (a) {
			try {
				fn(a);
			} catch (e) {
				/* finished/removed animations are skipped, never fatal */
			}
		});
	}
	function sync() {
		each(function (a) {
			if (state.paused) a.pause();
			else if (a.playState === "paused") a.play();
			a.playbackRate = state.rate;
		});
	}
	/* Hover/class flips create NEW transitions after a pause/slow-mo command;
	   re-apply the current state periodically so the review mode keeps holding. */
	var timer = null;
	function keepAlive() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		if (state.paused || state.rate !== 1) timer = setInterval(sync, 200);
	}
	function replay() {
		each(function (a) {
			a.currentTime = 0;
			if (!state.paused) a.play();
			a.playbackRate = state.rate;
		});
	}
	function handle(msg) {
		if (!msg || msg.type !== "pi-design:motion") return false;
		if (msg.action === "replay") replay();
		else if (msg.action === "pause") state.paused = true;
		else if (msg.action === "play") state.paused = false;
		else if (msg.action === "rate") {
			if (typeof msg.rate === "number" && msg.rate > 0) state.rate = msg.rate;
		}
		sync();
		keepAlive();
		return true;
	}
	window.addEventListener("message", function (event) {
		var handled = false;
		try {
			handled = handle(event.data);
		} catch (e) {
			/* never fatal */
		}
		if (handled && event.source) {
			try {
				event.source.postMessage(
					{ type: "pi-design:motion-ack", action: event.data.action, animations: anims().length },
					"*",
				);
			} catch (e) {
				/* host went away */
			}
		}
	});
	function announce(action) {
		try {
			parent.postMessage({ type: "pi-design:motion-ack", action: action, animations: anims().length }, "*");
		} catch (e) {
			/* not embedded */
		}
	}
	window.__piDesignMotion = { handle: handle, state: state };

	/* ---- element annotation: picker + numbered badges (review-only overlays) ---- */
	var OWN = "data-pi-design-overlay";
	var host = null;
	var picking = false;
	var hover = null;
	var marks = [];
	var layer = null;
	function toHost(msg) {
		try {
			(host || parent).postMessage(msg, "*");
		} catch (e) {
			/* host went away */
		}
	}
	function own(el) {
		return !!(el && el.closest && el.closest("[" + OWN + "]"));
	}
	function esc(s) {
		return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
	}
	function uniqueId(el) {
		return el.id && document.querySelectorAll("#" + esc(el.id)).length === 1;
	}
	function cssPath(el, withClass) {
		var parts = [];
		var cur = el;
		while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement) {
			if (uniqueId(cur)) {
				parts.unshift("#" + esc(cur.id));
				return parts.join(" > ");
			}
			var tag = cur.tagName.toLowerCase();
			var seg = tag;
			var cls = withClass && cur.classList.length ? cur.classList[0] : "";
			if (cls) seg += "." + esc(cls);
			var parent_ = cur.parentElement;
			if (parent_) {
				var same = Array.prototype.filter.call(parent_.children, function (c) {
					return c.tagName === cur.tagName;
				});
				if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
			}
			parts.unshift(seg);
			cur = parent_;
		}
		parts.unshift("body");
		return parts.join(" > ");
	}
	function selectorFor(el) {
		if (el === document.body) return "body";
		if (uniqueId(el)) return "#" + esc(el.id);
		var s = cssPath(el, true);
		try {
			if (document.querySelector(s) === el) return s;
		} catch (e) {
			/* invalid selector: fall back */
		}
		return cssPath(el, false);
	}
	function docRect(el) {
		var r = el.getBoundingClientRect();
		return {
			x: Math.round(r.left + window.scrollX),
			y: Math.round(r.top + window.scrollY),
			width: Math.round(r.width),
			height: Math.round(r.height),
		};
	}
	function overlay() {
		if (!layer || !layer.isConnected) {
			layer = document.createElement("div");
			layer.setAttribute(OWN, "");
			layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
			document.body.appendChild(layer);
		}
		return layer;
	}
	function box(r, dashed) {
		var b = document.createElement("div");
		b.style.cssText =
			"position:absolute;box-sizing:border-box;pointer-events:none;border-radius:3px;" +
			"left:" + r.x + "px;top:" + r.y + "px;width:" + r.width + "px;height:" + r.height + "px;" +
			(dashed ? "border:1.5px dashed #6ea8fe;" : "border:2px solid #6ea8fe;background:rgba(110,168,254,.14);");
		return b;
	}
	function drawHover(el) {
		if (hover) hover.remove();
		hover = null;
		if (!el || own(el)) return;
		hover = box(docRect(el), false);
		overlay().appendChild(hover);
	}
	function drawMarks() {
		var root = overlay();
		Array.prototype.slice.call(root.querySelectorAll("[data-mark]")).forEach(function (n) {
			n.remove();
		});
		marks.forEach(function (m) {
			var el = null;
			try {
				el = document.querySelector(m.selector);
			} catch (e) {
				/* stale selector */
			}
			if (!el) return;
			var r = docRect(el);
			var outline = box(r, true);
			outline.setAttribute("data-mark", "");
			var badge = document.createElement("div");
			badge.setAttribute("data-mark", "");
			badge.textContent = String(m.n);
			badge.style.cssText =
				"position:absolute;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;" +
				"background:#6ea8fe;color:#0b0c0f;font:700 11px/18px -apple-system,sans-serif;text-align:center;" +
				"box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;" +
				"left:" + Math.max(0, r.x - 9) + "px;top:" + Math.max(0, r.y - 9) + "px;";
			root.appendChild(outline);
			root.appendChild(badge);
		});
	}
	var cursorStyle = null;
	function setPicking(on) {
		picking = on;
		if (on && !cursorStyle) {
			cursorStyle = document.createElement("style");
			cursorStyle.setAttribute(OWN, "");
			cursorStyle.textContent = "html, html * { cursor: crosshair !important; }";
			document.head.appendChild(cursorStyle);
		} else if (!on && cursorStyle) {
			cursorStyle.remove();
			cursorStyle = null;
		}
		if (!on) drawHover(null);
	}
	function block(e) {
		if (!picking) return;
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
	}
	document.addEventListener(
		"mousemove",
		function (e) {
			if (picking) drawHover(e.target);
		},
		true,
	);
	["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "submit"].forEach(function (t) {
		document.addEventListener(t, block, true);
	});
	document.addEventListener(
		"click",
		function (e) {
			if (!picking) return;
			block(e);
			var el = e.target;
			if (!el || own(el) || el.nodeType !== 1) return;
			setPicking(false);
			var text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("alt") || "")
				.replace(/\\s+/g, " ")
				.trim();
			if (text.length > 60) text = text.slice(0, 59) + "…";
			toHost({
				type: "pi-design:annotate-pick",
				selector: selectorFor(el),
				tag: el.tagName.toLowerCase(),
				text: text,
				rect: docRect(el),
			});
		},
		true,
	);
	document.addEventListener(
		"keydown",
		function (e) {
			if (picking && e.key === "Escape") {
				block(e);
				setPicking(false);
				toHost({ type: "pi-design:annotate-cancel" });
			}
		},
		true,
	);
	window.addEventListener("resize", function () {
		if (marks.length) drawMarks();
	});
	window.addEventListener("message", function (event) {
		var msg = event.data;
		if (!msg || msg.type !== "pi-design:annotate") return;
		try {
			if (event.source) host = event.source;
			if (msg.action === "pick") setPicking(true);
			else if (msg.action === "cancel") setPicking(false);
			else if (msg.action === "marks") {
				marks = Array.isArray(msg.marks) ? msg.marks.filter(function (m) {
					return m && typeof m.selector === "string";
				}) : [];
				drawMarks();
			}
		} catch (e) {
			/* never fatal */
		}
	});
	window.__piDesignAnnotate = { selectorFor: selectorFor };

	announce("ready");
})();
`;

/**
 * (Re)writes <prototypeDir>/motion.js. Content-addressed: an identical
 * existing file is left untouched so regenerating a playground never churns
 * mtimes. Returns the file path.
 */
export function writeMotionRuntime(prototypeDir: string): string {
	const file = path.join(prototypeDir, MOTION_RUNTIME_FILENAME);
	mkdirSync(path.dirname(file), { recursive: true });
	try {
		if (existsSync(file) && readFileSync(file, "utf8") === MOTION_RUNTIME_JS) return file;
	} catch {
		/* fall through to rewrite */
	}
	writeFileSync(file, MOTION_RUNTIME_JS, "utf8");
	return file;
}
