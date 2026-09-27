/**
 * End-to-end wiring test for extensions/index.ts against a fake ExtensionAPI.
 * Exercises: /design command → state + tool activation + workflow prompt,
 * before_agent_start stage injection, design_render image feedback,
 * design_review terminate + human gate round-trip, design_status teardown.
 * Run: node scripts/smoke-extension.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createJiti } from "jiti";
import assert from "node:assert/strict";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const mod = await jiti.import(path.resolve("extensions/index.ts"));
assert.equal(typeof mod.default, "function", "default export factory");

// ---- fake ExtensionAPI ----
const sent = [];
const execCalls = [];
const events = new Map();
const tools = new Map();
const commands = new Map();
let activeTools = ["read", "edit", "bash"];
const pi = {
	registerCommand: (name, opts) => commands.set(name, opts),
	registerTool: (tool) => tools.set(tool.name, tool),
	on: (event, handler) => events.set(event, handler),
	getActiveTools: () => [...activeTools],
	setActiveTools: (names) => {
		activeTools = [...names];
	},
	sendUserMessage: (content) => sent.push(content),
	exec: async (command, args, options) => {
		execCalls.push([command, ...args]);
		return { stdout: "", stderr: "", code: 0, killed: false };
	},
};

mod.default(pi);
for (const name of ["design_render", "design_review", "design_status"]) {
	assert.ok(tools.has(name), `tool ${name} registered`);
}
assert.ok(commands.has("design"), "command /design registered");
assert.ok(events.has("session_start"), "session_start handler");
assert.ok(events.has("before_agent_start"), "before_agent_start handler");
assert.ok(events.has("session_shutdown"), "session_shutdown handler");

// ---- fixture project ----
const cwd = mkdtempSync(path.join(tmpdir(), "pi-design-ext-"));
mkdirSync(path.join(cwd, ".design", "prototype", "screens"), { recursive: true });
writeFileSync(
	path.join(cwd, ".design", "prototype", "screens", "login.html"),
	`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#0f172a;color:#fff;font:-apple-system 20px sans-serif}</style></head><body><button>登录</button></body></html>`,
);
const ctx = { cwd, mode: "json", hasUI: false, ui: {}, waitForIdle: async () => {}, isIdle: () => true, hasPendingMessages: () => false };

const results = [];
let failed = false;
let firstGateUrl = "";
const check = async (name, fn) => {
	try {
		await fn();
		results.push(`PASS ${name}`);
	} catch (error) {
		failed = true;
		results.push(`FAIL ${name}: ${error.message}`);
	}
};

await check("/design activates tools & sends workflow prompt", async () => {
	await commands.get("design").handler("一个极简登录页：邮箱+密码+登录按钮", ctx);
	const state = JSON.parse(readFileSync(path.join(cwd, ".design", "state.json"), "utf8"));
	assert.equal(state.active, true);
	assert.equal(state.stage, "brief");
	for (const t of ["design_render", "design_review", "design_status"]) {
		assert.ok(activeTools.includes(t), `${t} active`);
	}
	assert.ok(activeTools.includes("read"), "original tools preserved");
	assert.equal(sent.length, 1);
	assert.match(sent[0], /State machine/);
	assert.match(sent[0], /极简登录页/);
});

await check("before_agent_start injects stage guideline", async () => {
	const event = { systemPromptOptions: { promptGuidelines: [] } };
	events.get("before_agent_start")(event, ctx);
	assert.equal(event.systemPromptOptions.promptGuidelines.length, 1);
	assert.match(event.systemPromptOptions.promptGuidelines[0], /stage=brief/);
});

await check("design_render returns image content + updates state", async () => {
	const result = await tools.get("design_render").execute("t1", { page: "screens/login.html" }, undefined, undefined, ctx);
	assert.equal(result.content[0].type, "text");
	assert.equal(result.content[1].type, "image");
	assert.ok(result.content[1].data.length > 1000, "base64 payload present");
	assert.ok(result.details.file.endsWith(".jpg"));
	assert.match(result.details.file, /screens-login@390x844-\d+\.jpg$/, "viewport-tagged shot filename");
	assert.ok(existsSync(result.details.file));
	const state = JSON.parse(readFileSync(path.join(cwd, ".design", "state.json"), "utf8"));
	assert.equal(state.stage, "self-review");
	assert.deepEqual(state.screens, ["screens/login.html"]);
	// custom viewport gets its own prune set, not mixed with the primary one
	const alt = await tools.get("design_render").execute("t1b", { page: "screens/login.html", viewport: { width: 768, height: 1024 } }, undefined, undefined, ctx);
	assert.match(alt.details.file, /screens-login@768x1024-\d+\.jpg$/, "custom viewport tagged");
});

await check("design_review opens detached gate + serves review page", async () => {
	const result = await tools.get("design_review").execute("t2", {}, undefined, undefined, ctx);
	assert.equal(result.terminate, true, "hard stop at human gate");
	assert.match(result.content[0].text, /Human review gate is open/);
	assert.equal(result.details.external, true, "detached child spawned");
	firstGateUrl = result.details.url;
	assert.ok(existsSync(path.join(cwd, ".design", "review-server.json")), "ready file written");
	const page = await fetch(result.details.url);
	assert.equal(page.status, 200);
	const html = await page.text();
	assert.match(html, /login/);
	assert.match(html, /data-shot="shots\/screens-login@\d+x\d+-\d+\.jpg"/, "latest shot compare button");
	assert.match(html, /class="preset"/, "viewport presets present");
	const state = JSON.parse(readFileSync(path.join(cwd, ".design", "state.json"), "utf8"));
	assert.equal(state.stage, "review");
	assert.equal(state.reviewRound, 1);
	// human clicks approve with a comment → child writes decision file → poll injects
	const decision = await fetch(`${result.details.url.replace(/\/$/, "")}/decision`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action: "approve", comment: "可以，开始实现" }),
	});
	assert.equal(decision.status, 200);
	await new Promise((r) => setTimeout(r, 4000));
	assert.equal(sent.length, 2, "gate message sent back into session via poll");
	assert.match(sent[1], /approved round 1/);
	assert.match(sent[1], /可以，开始实现/);
	assert.match(sent[1], /IMPLEMENT translation rules \(web\)/, "approve message carries target rules");
	const after = JSON.parse(readFileSync(path.join(cwd, ".design", "state.json"), "utf8"));
	assert.equal(after.stage, "implement");
	// implement-stage re-injection carries the translation rules (compaction safety)
	const event2 = { systemPromptOptions: { promptGuidelines: [] } };
	events.get("before_agent_start")(event2, ctx);
	assert.match(event2.systemPromptOptions.promptGuidelines[0], /stage=implement/);
	assert.match(event2.systemPromptOptions.promptGuidelines[0], /W\d/);
});

await check("design_status done tears down tools + kills detached gate", async () => {
	const result = await tools.get("design_status").execute("t3", { stage: "done" }, undefined, undefined, ctx);
	assert.match(result.content[0].text, /stage: done/);
	assert.deepEqual(activeTools, ["read", "edit", "bash"], "design tools deactivated");
	assert.ok(!existsSync(path.join(cwd, ".design", "review-server.json")), "ready file removed");
	await new Promise((r) => setTimeout(r, 200));
});

await check("session_start resyncs tools + picks up pending verdict", async () => {
	// simulate: workflow active at review gate, verdict arrived while offline
	const stateFile = path.join(cwd, ".design", "state.json");
	const state = JSON.parse(readFileSync(stateFile, "utf8"));
	state.active = true;
	state.stage = "review";
	state.reviewRound = 1;
	state.reviewToken = firstGateUrl.split("/")[3]; // workflow still active → token intact
	writeFileSync(stateFile, JSON.stringify(state));
	const sentBefore = sent.length;
	writeFileSync(
		path.join(cwd, ".design", "review-round-1.json"),
		JSON.stringify({ decision: "reject", comment: "太素了", round: 1, at: new Date().toISOString() }),
	);
	events.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
	assert.ok(activeTools.includes("design_render"), "re-activated after restart");
	await new Promise((r) => setTimeout(r, 1800)); // pickup runs at +800ms
	assert.equal(sent.length, sentBefore + 1, "pending verdict injected as user message");
	assert.match(sent[sent.length - 1], /rejected round 1/);
	assert.match(sent[sent.length - 1], /太素了/);
	const after = JSON.parse(readFileSync(stateFile, "utf8"));
	assert.equal(after.stage, "build", "reject returns workflow to build");
	assert.ok(!existsSync(path.join(cwd, ".design", "review-round-1.json")), "decision file consumed");
});

await check("round 2 reuses the same gate URL (fixed port + stable token)", async () => {
	const result = await tools.get("design_review").execute("t4", {}, undefined, undefined, ctx);
	assert.equal(result.details.external, true, "detached child spawned again");
	assert.equal(result.details.url, firstGateUrl, "URL identical across rounds");
	const state = JSON.parse(readFileSync(path.join(cwd, ".design", "state.json"), "utf8"));
	assert.equal(state.reviewRound, 2);
	assert.ok(state.reviewToken && state.reviewToken.length >= 32, "token persisted in state");
	// teardown: done rotates the token and kills the detached gate
	const done = await tools.get("design_status").execute("t5", { stage: "done" }, undefined, undefined, ctx);
	assert.match(done.content[0].text, /stage: done/);
	const finalState = JSON.parse(readFileSync(path.join(cwd, ".design", "state.json"), "utf8"));
	assert.equal(finalState.reviewToken, undefined, "token rotated on workflow end");
	assert.ok(!existsSync(path.join(cwd, ".design", "review-server.json")), "ready file removed");
	await new Promise((r) => setTimeout(r, 200));
});

events.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, ctx);
await new Promise((r) => setTimeout(r, 200));
rmSync(cwd, { recursive: true, force: true });
console.log(results.join("\n"));
console.log(failed ? "SMOKE-EXTENSION: FAILED" : "SMOKE-EXTENSION: ALL PASS");
if (failed) process.exit(1);
