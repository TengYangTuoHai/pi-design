/* pi-design motion runtime v1 — auto-generated (pi-design), do not edit.
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
