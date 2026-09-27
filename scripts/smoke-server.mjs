/**
 * Security-matrix smoke test for extensions/server.ts (no pi runtime needed).
 * Run: node scripts/smoke-server.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { createJiti } from "jiti";
import assert from "node:assert/strict";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { startReviewServer } = await jiti.import(path.resolve("extensions/server.ts"));

const designDir = mkdtempSync(path.join(tmpdir(), "pi-design-server-"));
mkdirSync(path.join(designDir, "prototype", "screens"), { recursive: true });
writeFileSync(path.join(designDir, "prototype", "screens", "login.html"), "<h1>login</h1>");
writeFileSync(path.join(designDir, "secret.txt"), "TOPSECRET");

const decisions = [];
const handle = await startReviewServer({
	designDir,
	screens: ["screens/login.html"],
	viewport: { width: 390, height: 844 },
	round: 1,
	target: "web",
	onDecision: (decision, comment) => decisions.push({ decision, comment }),
});

const base = `http://127.0.0.1:${handle.port}`;
const results = [];
let failed = false;
const req = (pathname, init) =>
	fetch(`${base}${pathname}`, init).then(async (r) => ({ status: r.status, body: await r.text() }));
/** Raw HTTP request with full header control (fetch/undici won't forge Host). */
const rawReq = (pathname, { method = "GET", headers = {}, body } = {}) =>
	new Promise((resolve, reject) => {
		const r = http.request(
			{ host: "127.0.0.1", port: handle.port, path: pathname, method, headers },
			(res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
			},
		);
		r.on("error", reject);
		if (body) r.write(body);
		r.end();
	});
const check = async (name, fn) => {
	try {
		await fn();
		results.push(`PASS ${name}`);
	} catch (error) {
		failed = true;
		results.push(`FAIL ${name}: ${error.message}`);
	}
};

await check("unknown token 404", async () => {
	const r = await req("/deadbeef/");
	assert.equal(r.status, 404);
});

await check("review page 200", async () => {
	const r = await req(`/${handle.token}/`);
	assert.equal(r.status, 200);
	assert.match(r.body, /screens\/login\.html/);
	assert.match(r.body, /第 1 轮/);
});

await check("static file 200", async () => {
	const r = await req(`/${handle.token}/static/prototype/screens/login.html`);
	assert.equal(r.status, 200);
	assert.match(r.body, /login/);
});

await check("traversal blocked", async () => {
	const r = await req(`/${handle.token}/static/..%2Fsecret.txt`);
	assert.ok(r.status === 403 || r.status === 404, `unexpected ${r.status}`);
	assert.ok(!r.body.includes("TOPSECRET"));
});

await check("evil host 403 (DNS-rebinding guard)", async () => {
	const r = await rawReq(`/${handle.token}/decision`, {
		method: "POST",
		headers: { host: "evil.example", "content-type": "application/json" },
		body: JSON.stringify({ action: "approve" }),
	});
	assert.equal(r.status, 403);
});

await check("cross-origin Origin 403", async () => {
	const r = await rawReq(`/${handle.token}/decision`, {
		method: "POST",
		headers: { origin: "https://attacker.example", "content-type": "application/json" },
		body: JSON.stringify({ action: "approve" }),
	});
	assert.equal(r.status, 403);
});

await check("cross-site 403", async () => {
	const r = await req(`/${handle.token}/decision`, {
		method: "POST",
		headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
		body: JSON.stringify({ action: "approve" }),
	});
	assert.equal(r.status, 403);
});

await check("valid decision 200", async () => {
	const r = await req(`/${handle.token}/decision`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action: "approve", comment: "看起来不错" }),
	});
	assert.equal(r.status, 200);
});

await check("second decision 410 (single-use)", async () => {
	const r = await req(`/${handle.token}/decision`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action: "reject" }),
	});
	assert.equal(r.status, 410);
});

await new Promise((r) => setTimeout(r, 300));
await check("onDecision fired once with comment", async () => {
	assert.equal(decisions.length, 1);
	assert.equal(decisions[0].decision, "approve");
	assert.equal(decisions[0].comment, "看起来不错");
});

await handle.close();

// Second round with latestShots: compare button rendered + shot served via static.
const shotName = "screens-login@390x844-123.jpg";
mkdirSync(path.join(designDir, "shots"), { recursive: true });
writeFileSync(path.join(designDir, "shots", shotName), "fake-jpeg-bytes");
const handle2 = await startReviewServer({
	designDir,
	screens: ["screens/login.html"],
	viewport: { width: 390, height: 844 },
	round: 2,
	target: "swiftui",
	latestShots: { "screens/login.html": `shots/${shotName}` },
	onDecision: () => {},
});
await check("round-2 page has shot compare + presets", async () => {
	const r = await fetch(`http://127.0.0.1:${handle2.port}/${handle2.token}/`).then(async (r2) => ({
		status: r2.status,
		body: await r2.text(),
	}));
	assert.equal(r.status, 200);
	assert.match(r.body, new RegExp(`data-shot="shots/${shotName}"`));
	assert.match(r.body, /class="preset"/);
	assert.match(r.body, /target: swiftui/);
});
await check("shot image served via static", async () => {
	const r = await fetch(
		`http://127.0.0.1:${handle2.port}/${handle2.token}/static/shots/${shotName}`,
	);
	assert.equal(r.status, 200);
});
await handle2.close();

// Port policy: fixed default, walk when occupied, reuse when released, env override.
delete process.env.PI_DESIGN_PORT;
let hA;
let hB;
let hC;
const minimal = () => ({
	designDir,
	screens: ["screens/login.html"],
	viewport: { width: 390, height: 844 },
	round: 9,
	target: "web",
	onDecision: () => {},
});
await check("fixed default port (3374)", async () => {
	hA = await startReviewServer(minimal());
	assert.ok(hA.port >= 3374 && hA.port <= 3399, `expected the 3374 neighborhood, got ${hA.port}`);
});
await check("occupied port walks to the next one", async () => {
	hB = await startReviewServer(minimal());
	assert.ok(hB.port > hA.port && hB.port <= hA.port + 25, `walked from ${hA.port} to ${hB.port}`);
});
await check("released default port is reused", async () => {
	const portA = hA.port;
	await hA.close();
	await hB.close();
	hA = undefined;
	hB = undefined;
	hC = await startReviewServer(minimal());
	assert.equal(hC.port, portA, "default port reclaimed after release");
});
await check("PI_DESIGN_PORT overrides the default", async () => {
	await hC.close();
	hC = undefined;
	process.env.PI_DESIGN_PORT = "3990";
	const hD = await startReviewServer(minimal());
	assert.equal(hD.port, 3990);
	await hD.close();
	delete process.env.PI_DESIGN_PORT;
});
rmSync(designDir, { recursive: true, force: true });
console.log(results.join("\n"));
console.log(failed ? "SMOKE-SERVER: FAILED" : "SMOKE-SERVER: ALL PASS");
if (failed) process.exit(1);
