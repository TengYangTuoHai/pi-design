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
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export const MOTION_RUNTIME_FILENAME = "motion.js";

export const MOTION_RUNTIME_VERSION = 1;

export const MOTION_RUNTIME_JS = `/* pi-design motion runtime v${MOTION_RUNTIME_VERSION} — auto-generated (pi-design), do not edit.
   Playback control for review hosts: replay / pause / play / rate via postMessage. */
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
