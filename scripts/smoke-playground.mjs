/**
 * Browser-level interaction test for the DSH playground (dsh/cli.mjs +
 * extensions/motion.ts runtime) over the real file:// surface.
 *
 * The review-page smoke covers the Pi server page; this one executes the
 * playground's own hand-rolled JS: motion runtime discovery (ready ping ACK),
 * global pause/slow-mo/replay via postMessage, per-screen replay, and the
 * graceful fallback for screens that never included ../motion.js.
 *
 * Cross-origin note: file:// iframes are opaque origins, so assertions are
 * parent-side only (dataset flags + ACK messages) — animation-state truth is
 * verified in smoke-review-page.mjs over http.
 *
 * Run: node scripts/smoke-playground.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const REPO = path.resolve(".");
const CLI = path.join(REPO, "dsh", "cli.mjs");
const proj = mkdtempSync(path.join(tmpdir(), "pi-design-pg-"));
const env = { ...process.env, PI_DESIGN_NO_BROWSER: "1" };

/** Runs the CLI in the fake project; resolves {code, out}. */
const run = (args) =>
	new Promise((resolve) => {
		execFile(
			process.execPath,
			[CLI, ...args],
			{ cwd: proj, timeout: 60_000, encoding: "utf8", env },
			(error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, out: `${stdout ?? ""}${stderr ?? ""}` }),
		);
	});

const ANIMATED = (id) => `<!doctype html><meta charset=utf-8><style>
	h1 { animation: pulse 2s ease-in-out infinite alternate; }
	@keyframes pulse { from { opacity: .35; } to { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { h1 { animation: none; } }
</style><h1>${id}</h1><script src="../motion.js"></script>`;
const STATIC = (id) => `<!doctype html><meta charset=utf-8><h1>${id}</h1>`;

mkdirSync(path.join(proj, ".design", "prototype", "screens"), { recursive: true });
writeFileSync(path.join(proj, ".design", "prototype", "screens", "home.html"), ANIMATED("home"));
writeFileSync(path.join(proj, ".design", "prototype", "screens", "plain.html"), STATIC("plain")); // no runtime

await run(["start", "playground motion check"]);
const r = await run(["review"]);
assert.equal(r.code, 0, `review failed:\n${r.out}`);
const playground = path.join(proj, ".design", "playground.html");

const results = [];
let failed = false;
const check = async (name, fn) => {
	try {
		await fn();
		results.push(`PASS ${name}`);
	} catch (error) {
		failed = true;
		results.push(`FAIL ${name}: ${error.message}`);
	}
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const page = await browser.newContext({ viewport: { width: 1600, height: 1000 } }).then((c) => c.newPage());
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(String(e)));
	// Record every runtime ACK parent-side (cross-origin-safe observation).
	await page.addInitScript(() => {
		window.__acks = [];
		window.addEventListener("message", (e) => {
			if (e.data?.type === "pi-design:motion-ack") window.__acks.push(e.data);
		});
	});
	await page.goto(`file://${playground}`, { waitUntil: "load" });
	await page.waitForTimeout(600); // let iframes + runtimes come up

	const frameByCard = (name) =>
		page.locator(`.card:has(.name:text-is("${name}")) .frame iframe`, { hasText: "" });

	await check("runtime screens ACK readiness (dataset flag set)", async () => {
		await page.waitForFunction(
			(name) => {
				const card = [...document.querySelectorAll(".card")].find((c) => c.querySelector(".name")?.textContent === name);
				return card?.querySelector("iframe")?.dataset.motion === "1";
			},
			"home",
			{ timeout: 5000 },
		);
	});

	await check("screen without runtime is not flagged", async () => {
		const flagged = await page.evaluate(() =>
			[...document.querySelectorAll(".card")].map((c) => ({
				name: c.querySelector(".name")?.textContent,
				on: c.querySelector("iframe")?.dataset.motion === "1",
			})),
		);
		assert.equal(flagged.find((f) => f.name === "home")?.on, true);
		assert.notEqual(flagged.find((f) => f.name === "plain")?.on, true, "plain must not be flagged as runtime-ready");
	});

	await check("global pause: runtime ACK + missing-runtime note", async () => {
		await page.click("#mpause");
		await page.waitForFunction(() => window.__acks.some((a) => a.action === "pause"), undefined, { timeout: 3000 });
		assert.match(await page.locator("#mpause").innerText(), /继续/);
		const note = await page.locator("#mnote").innerText();
		assert.match(note, /1 屏未接入/, `expected exactly the runtime-less screen flagged, got "${note}"`);
	});

	await check("slow-mo: rate ACK", async () => {
		await page.click('.mspd[data-r="0.25"]');
		await page.waitForFunction(
			() => window.__acks.some((a) => a.action === "rate" && a.animations >= 1),
			undefined,
			{ timeout: 3000 },
		);
	});

	await check("global replay: replay ACK with animations", async () => {
		await page.click("#mreplay");
		await page.waitForFunction(() => window.__acks.some((a) => a.action === "replay" && a.animations >= 1), undefined, {
			timeout: 3000,
		});
	});

	await check("per-screen ↺ replays via runtime (no reload flicker path taken)", async () => {
		const before = await frameByCard("home").evaluate((f) => performance.now() && f.dataset.motion);
		await page.locator('.card:has(.name:text-is("home")) .rpl').click();
		await page.waitForTimeout(200);
		const acks = await page.evaluate(() => window.__acks.filter((a) => a.action === "replay").length);
		assert.ok(acks >= 2, "second replay ACK expected");
		assert.equal(before, "1");
	});

	await check("runtime-less screen replay falls back to reload (no page errors)", async () => {
		await page.locator('.card:has(.name:text-is("plain")) .rpl').click();
		await page.waitForTimeout(300);
	});

	await check("no page errors", () => assert.deepEqual(pageErrors, []));
} finally {
	await browser.close();
	rmSync(proj, { recursive: true, force: true });
}

console.log(results.join("\n"));
console.log(failed ? "SMOKE-PLAYGROUND: FAILED" : "SMOKE-PLAYGROUND: ALL PASS");
if (failed) process.exit(1);
