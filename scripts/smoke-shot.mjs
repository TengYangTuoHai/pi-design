/**
 * Screenshot engine smoke test for extensions/shot.ts.
 * Exercises playwright-core (channel chrome) and the raw chrome fallback.
 * Run: node scripts/smoke-shot.mjs
 */
import { mkdtempSync, statSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createJiti } from "jiti";
import assert from "node:assert/strict";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { captureScreenshot } = await jiti.import(path.resolve("extensions/shot.ts"));

const dir = mkdtempSync(path.join(tmpdir(), "pi-design-shot-"));
const html = path.join(dir, "page.html");
const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>
	body { margin:0; font-family: -apple-system, sans-serif; display:grid; place-items:center; height:100vh; background:linear-gradient(160deg,#0f172a,#334155); color:#f8fafc; }
	h1 { font-size:44px; letter-spacing:-0.02em; }
</style></head>
<body><h1>pi-design shot ✓</h1></body></html>`;
writeFileSync(html, fixture);

// Stand-in for pi.exec that satisfies the ExecFn structural type.
const exec = (command, args, options) => {
	const stdout = execFileSync(command, args, {
		timeout: options?.timeout ?? 30_000,
		cwd: options?.cwd,
		signal: options?.signal,
		encoding: "utf8",
	});
	return Promise.resolve({ stdout: String(stdout), stderr: "", code: 0, killed: false });
};

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

await check("playwright chrome engine", async () => {
	const out = path.join(dir, "pw.jpg");
	const shot = await captureScreenshot({
		htmlFile: html,
		outFile: out,
		viewport: { width: 390, height: 844 },
		exec,
		engines: ["playwright"],
	});
	assert.equal(shot.engine, "playwright-chrome");
	assert.equal(shot.mimeType, "image/jpeg");
	assert.ok(statSync(out).size > 5_000, `suspiciously small: ${statSync(out).size}`);
});

await check("raw chrome fallback engine", async () => {
	const out = path.join(dir, "raw.png");
	const shot = await captureScreenshot({
		htmlFile: html,
		outFile: out,
		viewport: { width: 390, height: 844 },
		exec,
		engines: ["chrome"],
	});
	assert.equal(shot.engine, "chrome-headless");
	assert.equal(shot.mimeType, "image/png");
	assert.ok(statSync(out).size > 5_000, `suspiciously small: ${statSync(out).size}`);
});

rmSync(dir, { recursive: true, force: true });
console.log(results.join("\n"));
console.log(failed ? "SMOKE-SHOT: FAILED" : "SMOKE-SHOT: ALL PASS");
if (failed) process.exit(1);
