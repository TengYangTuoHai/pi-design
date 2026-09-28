/**
 * Browser-level interaction test for the review page (server.ts + real Chrome).
 * The endpoint-level smokes can't catch page-JS bugs — this one caught a real
 * double-token 404 in the page's own decision fetch. Run: node scripts/smoke-review-page.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createJiti } from "jiti";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { startReviewServer } = await jiti.import(path.resolve("extensions/server.ts"));
const { writeMotionRuntime } = await jiti.import(path.resolve("extensions/motion.ts"));

const designDir = mkdtempSync(path.join(tmpdir(), "pi-design-rvpage-"));
mkdirSync(path.join(designDir, "prototype", "screens"), { recursive: true });
mkdirSync(path.join(designDir, "shots"), { recursive: true });
// Screen carries an infinite CSS animation + the motion runtime, exactly as
// the workflow prompt instructs — the motion-control checks below rely on it.
writeMotionRuntime(path.join(designDir, "prototype"));
writeFileSync(
	path.join(designDir, "prototype", "screens", "login.html"),
	`<!doctype html><meta charset=utf-8><style>
	h1 { animation: pulse 2s ease-in-out infinite alternate; }
	@keyframes pulse { from { opacity: .35; } to { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { h1 { animation: none; } }
</style><h1>login</h1><script src="../motion.js"></script>`,
);
writeFileSync(path.join(designDir, "shots", "screens-login@390x844-1.jpg"), "fake-jpeg");

const decisions = [];
const handle = await startReviewServer({
	designDir,
	screens: ["screens/login.html"],
	viewport: { width: 390, height: 844 },
	round: 1,
	target: "swiftui",
	latestShots: { "screens/login.html": "shots/screens-login@390x844-1.jpg" },
	onDecision: (decision, comment) => decisions.push({ decision, comment }),
});

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
	const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(String(e)));
	page.on("dialog", async (d) => {
		await d.dismiss();
	});
	await page.goto(handle.url, { waitUntil: "networkidle" });
	const frame = page.locator(".frame").first();

	await check("default frame is primary viewport", async () => {
		assert.equal(await page.locator(".preset").count(), 4, "4 viewport presets");
		assert.equal(await frame.evaluate((el) => el.style.width), "390px");
	});

	await check("preset click resizes frames", async () => {
		await page.click('.preset[data-w="1280"]');
		assert.equal(await frame.evaluate((el) => el.style.width), "1280px");
	});

	await check("zoom slider scales frame + sizer", async () => {
		await page.locator("#zoom").fill("50");
		assert.match(await frame.evaluate((el) => el.style.transform), /scale\(0\.5\)/);
		const w = await page.locator(".sizer").first().evaluate((el) => el.getBoundingClientRect().width);
		assert.ok(w < 700, `sizer shrunk (${w}px)`);
	});

	await check("shot compare toggles iframe <-> img", async () => {
		await page.click("button.tool[data-shot]");
		assert.equal(await frame.locator("img.shot").count(), 1, "shot img swapped in");
		await page.click("button.tool[data-shot]");
		assert.equal(await frame.locator("img.shot").count(), 0, "img removed");
		assert.equal(await frame.locator("iframe").count(), 1, "iframe restored");
	});

	// ---- motion playback: the page must control the screen's animations ----
	const screenFrame = () => page.frames().find((f) => f.url().includes("login.html"));
	const animState = (prop) =>
		screenFrame().evaluate((p) => document.getAnimations().map((a) => a[p]), prop);

	await check("motion runtime ack marks the frame (ready ping)", async () => {
		await page.waitForFunction(
			() => !!document.querySelector(".frame iframe")?.dataset.motion,
			undefined,
			{ timeout: 5000 },
		);
	});

	await check("pause holds every animation", async () => {
		await page.click("#mpause");
		await page.waitForTimeout(150);
		assert.ok((await animState("playState")).every((s) => s === "paused"), "all animations paused");
	});

	await check("play resumes", async () => {
		await page.click("#mpause");
		await page.waitForTimeout(150);
		assert.ok((await animState("playState")).every((s) => s === "running"), "animations running again");
	});

	await check("slow-mo sets playbackRate", async () => {
		await page.click('.mbtn.mspd[data-r="0.25"]');
		await page.waitForTimeout(150);
		assert.ok((await animState("playbackRate")).every((r) => r === 0.25), "rate applied");
		await page.click('.mbtn.mspd[data-r="1"]');
	});

	await check("replay resets animation time", async () => {
		await screenFrame().waitForFunction(
			() => {
				const a = document.getAnimations()[0];
				return !!a && a.currentTime > 1500;
			},
			undefined,
			{ timeout: 8000 },
		);
		await page.click("#mreplay");
		await page.waitForTimeout(120);
		const after = (await animState("currentTime"))[0];
		assert.ok(after < 1200, `replay should rewind near t=0, got ${after}ms`);
	});

	await check("per-screen ↺ replays that screen", async () => {
		await screenFrame().waitForFunction(
			() => {
				const a = document.getAnimations()[0];
				return !!a && a.currentTime > 1500;
			},
			undefined,
			{ timeout: 8000 },
		);
		await page.click("button.rpl");
		await page.waitForTimeout(120);
		const after = (await animState("currentTime"))[0];
		assert.ok(after < 1200, `per-screen replay should rewind, got ${after}ms`);
	});

	await check("keyboard / focuses comment, 1 switches preset", async () => {
		await page.keyboard.press("/");
		assert.equal(await page.evaluate(() => document.activeElement?.id), "comment");
		await page.locator("#comment").blur();
		await page.keyboard.press("1");
		assert.equal(await frame.evaluate((el) => el.style.width), "375px");
	});

	await check("keyboard A approves via page fetch (regression: double-token 404)", async () => {
		await page.keyboard.press("a");
		await page.waitForTimeout(600);
		assert.equal(await page.locator(".result.ok").count(), 1, "success footer shown");
		assert.equal(decisions.length, 1, "decision reached server");
		assert.equal(decisions[0].decision, "approve");
	});

	await check("no page errors", async () => {
		assert.deepEqual(pageErrors, []);
	});
} finally {
	await browser.close();
	await handle.close();
	rmSync(designDir, { recursive: true, force: true });
}

console.log(results.join("\n"));
console.log(failed ? "SMOKE-REVIEW-PAGE: FAILED" : "SMOKE-REVIEW-PAGE: ALL PASS");
if (failed) process.exit(1);
