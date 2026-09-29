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
	const world = page.locator("#world");

	await check("default frame is primary viewport", async () => {
		assert.equal(await page.locator(".preset:not(.cbtn)").count(), 4, "4 viewport presets");
		assert.equal(await frame.evaluate((el) => el.style.width), "390px");
	});

	await check("preset click resizes frames", async () => {
		await page.click('.preset[data-w="1280"]');
		assert.equal(await frame.evaluate((el) => el.style.width), "1280px");
	});

	await check("zoom slider scales the world", async () => {
		await page.locator("#zoom").fill("50");
		assert.match(await world.evaluate((el) => el.style.transform), /scale\(0\.5\)/);
		const t = await frame.evaluate((el) => el.style.transform);
		assert.ok(t === "" || t === "none", `frame must stay unscaled, got "${t}"`);
	});

	await check("title-bar drag moves the screen in world px", async () => {
		const fig = page.locator("figure.screen").first();
		const before = await fig.evaluate((el) => parseFloat(el.style.left));
		const label = fig.locator("figcaption > span").first();
		const box = await label.boundingBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 5 });
		await page.mouse.up();
		const after = await fig.evaluate((el) => parseFloat(el.style.left));
		assert.ok(Math.abs(after - before - 200) <= 2, `left should move +200 world px, moved ${after - before}`);
	});

	await check("background drag pans the view", async () => {
		const tx = () =>
			world.evaluate((el) => parseFloat(el.style.transform.match(/translate\(([-\d.]+)px/)[1]));
		const before = await tx();
		const barBox = await page.locator("#bar").boundingBox();
		await page.mouse.move(1440 - 20, barBox.y - 20);
		await page.mouse.down();
		await page.mouse.move(1440 - 20 - 120, barBox.y - 20, { steps: 5 });
		await page.mouse.up();
		const after = await tx();
		assert.ok(Math.abs(after - before + 120) <= 2, `translateX should move -120, moved ${after - before}`);
	});

	await check("fit shows every screen", async () => {
		await page.click("#cfit");
		const cb = await page.locator("#canvas").boundingBox();
		for (const fig of await page.locator("figure.screen").all()) {
			const fb = await fig.boundingBox();
			assert.ok(fb.x >= cb.x - 1 && fb.y >= cb.y - 1, `card top/left inside canvas (${fb.x},${fb.y})`);
			assert.ok(
				fb.x + fb.width <= cb.x + cb.width + 1 && fb.y + fb.height <= cb.y + cb.height + 1,
				`card bottom/right inside canvas (${fb.x + fb.width},${fb.y + fb.height})`,
			);
		}
	});

	await check("layout persists across reload", async () => {
		const fig = page.locator("figure.screen").first();
		const label = fig.locator("figcaption > span").first();
		const box = await label.boundingBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
		await page.mouse.up();
		await page.waitForTimeout(400); // debounce save (300ms)
		const before = await page.locator("figure.screen").first().evaluate((el) => parseFloat(el.style.left));
		await page.reload({ waitUntil: "networkidle" });
		const after = await page.locator("figure.screen").first().evaluate((el) => parseFloat(el.style.left));
		assert.equal(after, before, "style.left survives reload");
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

	// ---- element annotations: pick, badge, note, carry into the verdict ----
	await check("✎ picks an element and lists a numbered note", async () => {
		await page.click("button.tool.ann");
		const ann = page.locator("button.tool.ann").first();
		assert.ok(await ann.evaluate((el) => el.classList.contains("on")), "ann button enters picking state");
		await page.frameLocator(".frame iframe").first().locator("h1").click();
		await page.waitForFunction(() => document.querySelectorAll("#notes li").length === 1, undefined, {
			timeout: 5000,
		});
		assert.equal(await page.locator("button.tool.ann.on").count(), 0, "ann button leaves picking state");
		assert.match(await page.locator(".nmeta").first().textContent(), /login/);
		const marked = await screenFrame().evaluate(
			() => document.querySelectorAll("[data-pi-design-overlay] [data-mark]").length,
		);
		assert.ok(marked >= 2, `outline + badge drawn in screen (${marked})`);
	});

	await check("Esc cancels picking", async () => {
		await page.click("button.tool.ann");
		await screenFrame().waitForFunction(
			() => !!document.querySelector("style[data-pi-design-overlay]"),
			undefined,
			{ timeout: 3000 },
		);
		await page.keyboard.press("Escape");
		await screenFrame().waitForFunction(
			() => !document.querySelector("style[data-pi-design-overlay]"),
			undefined,
			{ timeout: 1000 },
		);
		assert.equal(await page.locator("button.tool.ann.on").count(), 0, "ann button off after Esc");
	});

	await check("marks survive shot toggle", async () => {
		await page.click("button.tool[data-shot]");
		await page.click("button.tool[data-shot]");
		// the iframe is re-created by the toggle; poll its document from the host
		// (same-origin) until the restored runtime re-draws the marks
		await page.waitForFunction(
			() => {
				const f = document.querySelector(".frame iframe");
				return (
					!!f &&
					!!f.contentDocument &&
					f.contentDocument.querySelectorAll("[data-pi-design-overlay] [data-mark]").length > 0
				);
			},
			undefined,
			{ timeout: 3000 },
		);
	});

	// Seed the note text so the approve check below carries it into the verdict.
	await page.locator(".nnote").first().fill("标题太淡");
	await page.locator(".nnote").blur();

	await check("keyboard / focuses comment, 1 switches preset", async () => {
		await page.keyboard.press("/");
		assert.equal(await page.evaluate(() => document.activeElement?.id), "comment");
		await page.locator("#comment").blur();
		await page.keyboard.press("1");
		assert.equal(await frame.evaluate((el) => el.style.width), "375px");
	});

	await check("keyboard A approves via page fetch (regression: double-token 404)", async () => {
		await page.locator(".nnote").blur();
		await page.keyboard.press("a");
		await page.waitForTimeout(600);
		assert.equal(await page.locator(".result.ok").count(), 1, "success footer shown");
		assert.equal(decisions.length, 1, "decision reached server");
		assert.equal(decisions[0].decision, "approve");
		const comment = String(decisions[0].comment ?? "");
		assert.ok(comment.includes("Element annotations (screen · selector · text):"), "annotation header in comment");
		assert.ok(comment.includes("1. screens/login.html · "), "numbered annotation line in comment");
		assert.ok(comment.includes("→ 标题太淡"), "note text in comment");
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
