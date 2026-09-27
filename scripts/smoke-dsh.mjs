/**
 * End-to-end smoke test for the DSH adapter (dsh/cli.mjs).
 * Exercises: start → render (real screenshot) → lint → review (detached gate
 * server up + reachable) → simulated browser verdict → verdict applies →
 * status/stop teardown. Run: node scripts/smoke-dsh.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import assert from "node:assert/strict";

const REPO = path.resolve(".");
const CLI = path.join(REPO, "dsh", "cli.mjs");
const proj = mkdtempSync(path.join(tmpdir(), "pi-design-dsh-"));

const results = [];
let failed = false;
const check = (name, fn) => {
	try {
		fn();
		results.push(`PASS ${name}`);
	} catch (error) {
		failed = true;
		results.push(`FAIL ${name}: ${error.message}`);
	}
};

/** Runs the CLI in the fake project; resolves {code, out}. */
function run(args) {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			[CLI, ...args],
			{ cwd: proj, timeout: 60_000, encoding: "utf8", env: { ...process.env, PI_DESIGN_NO_BROWSER: "1" } },
			(error, stdout, stderr) => {
				const out = `${stdout ?? ""}${stderr ? `\n[stderr] ${stderr}` : ""}`;
				resolve({ code: error ? (error.code ?? 1) : 0, out });
			},
		);
	});
}

const j = (file) => JSON.parse(readFileSync(path.join(proj, ".design", file), "utf8"));

// Compliant DESIGN.md + tokens.css (same fixture family as smoke-designmd.mjs).
const DESIGN_MD = `---
name: Heritage
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
  on-tertiary: "#FFFFFF"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview
Smoke fixture.

## Colors
Single accent driver.

## Typography
Public Sans everywhere.

## Layout
Generous margins.
`;
const TOKENS_CSS = `:root {
	--color-primary: #1A1C1E;
	--color-secondary: #6C7278;
	--color-tertiary: #B8422E;
	--color-neutral: #F7F5F2;
	--color-on-tertiary: #FFFFFF;
	--type-h1-family: "Public Sans";
	--type-h1-size: 3rem;
	--type-body-md-family: "Public Sans";
	--type-body-md-size: 1rem;
	--rounded-sm: 4px;
	--rounded-md: 8px;
	--spacing-sm: 8px;
	--spacing-md: 16px;
	--component-button-primary-background: var(--color-tertiary);
	--component-button-primary-text: var(--color-on-tertiary);
	--component-button-primary-rounded: var(--rounded-sm);
	--component-button-primary-padding: 12px;
}
`;
const SCREEN_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
	body { margin:0; font-family:-apple-system,sans-serif; display:grid; place-items:center; height:100vh;
		background:linear-gradient(160deg,#F7F5F2,#fff); color:#1A1C1E; }
	.card { border:1px solid #ddd; border-radius:8px; padding:16px; text-align:center; }
	button { background:#B8422E; color:#fff; border:0; border-radius:4px; padding:12px 24px; margin-top:8px; }
</style></head>
<body><div class="card"><h1>Sign in</h1><button>Continue</button></div></body></html>`;

const killGate = () => {
	const info = path.join(proj, ".design", "review-server.json");
	try {
		const { pid } = JSON.parse(readFileSync(info, "utf8"));
		if (typeof pid === "number") process.kill(pid, "SIGKILL");
	} catch {
		/* already gone */
	}
};

try {
	// ---- start ----
	let r = await run(["start", "minimal login page: email + password + sign-in button"]);
	check("start: prints DSH adapter header", () => assert.ok(r.out.includes("pi-design workflow (DSH CLI mode)")));
	check("start: prints workflow state machine", () => assert.ok(r.out.includes("/design workflow started") && r.out.includes("State machine")));
	check("start: maps tools to CLI commands", () => assert.ok(r.out.includes('render <page>') && r.out.includes("read_image")));
	check("start: state.json initialized", () => {
		const s = j("state.json");
		assert.equal(s.active, true);
		assert.equal(s.stage, "brief");
		assert.ok(s.brief.includes("login page"));
	});
	check("start: exit 0", () => assert.equal(r.code, 0));

	// ---- component scope ----
	r = await run(["start", "a primary button with variants", "--scope", "component"]);
	check("start --scope component: prompt carries component rules", () => {
		assert.ok(r.out.includes("COMPONENT scope"), "no COMPONENT scope section");
		assert.ok(r.out.includes("do NOT plan app screens"));
		assert.ok(r.out.includes("do not create pages, routes, layouts, or app scaffolding"));
	});
	check("start --scope component: state persists scope", () => assert.equal(j("state.json").scope, "component"));
	r = await run(["start", "minimal login page", "--scope", "bogus"]);
	check("start --scope bogus: rejected exit 2", () => assert.equal(r.code, 2));
	r = await run(["start", "minimal login page: email + password + sign-in button"]);
	check("start default scope: app + scope guard present", () => {
		assert.equal(j("state.json").scope, "app");
		assert.ok(r.out.includes("APP/PAGE scope"));
		assert.ok(r.out.includes("Scope guard"));
	});
	r = await run(["status", "--scope", "component"]);
	check("status --scope: persists + guideline mentions component", () => {
		assert.equal(j("state.json").scope, "component");
		assert.ok(r.out.includes("COMPONENT SCOPE"));
	});
	r = await run(["status", "--scope", "app"]);
	check("status --scope app: restores app scope", () => assert.equal(j("state.json").scope, "app"));

	// ---- render (real headless screenshot) ----
	mkdirSync(path.join(proj, ".design", "prototype", "screens"), { recursive: true });
	writeFileSync(path.join(proj, ".design", "prototype", "screens", "login.html"), SCREEN_HTML);
	r = await run(["render", "screens/login.html"]);
	check("render: prints screenshot path", () => assert.ok(/Screenshot: .+\.jpe?g/.test(r.out) || /Screenshot: .+\.png/.test(r.out)));
	check("render: shot file exists on disk", () => {
		const m = /Screenshot: (.+)$/.exec(r.out.trim().split("\n").find((l) => l.startsWith("Screenshot:")));
		assert.ok(m, "no Screenshot line");
		assert.ok(existsSync(m[1].trim()), `missing ${m[1]}`);
	});
	check("render: instructs read_image + critique", () => assert.ok(r.out.includes("read_image") && r.out.includes("critique")));
	check("render: state tracks screen + stage", () => {
		const s = j("state.json");
		assert.deepEqual(s.screens, ["screens/login.html"]);
		assert.equal(s.stage, "self-review");
	});
	check("render: exit 0", () => assert.equal(r.code, 0));

	// ---- render with explicit viewport ----
	r = await run(["render", "screens/login.html", "--viewport", "768x1024"]);
	check("render --viewport: accepted", () => assert.equal(r.code, 0) && r.out.includes("768x1024"));
	r = await run(["render", "screens/login.html", "--viewport", "bogus"]);
	check("render --viewport: rejects malformed", () => assert.equal(r.code, 2));
	r = await run(["render", "screens/missing.html"]);
	check("render: missing page → error 1", () => {
		assert.equal(r.code, 1);
		assert.ok(r.out.includes("Cannot find"));
	});

	// ---- lint ----
	writeFileSync(path.join(proj, ".design", "DESIGN.md"), DESIGN_MD);
	writeFileSync(path.join(proj, ".design", "tokens.css"), TOKENS_CSS);
	r = await run(["lint"]);
	check("lint: clean report exit 0", () => assert.equal(r.code, 0) && r.out.includes("0 error"));

	// ---- review: playground in the browser; the verdict happens in chat ----
	r = await run(["review"]);
	check("review: prints playground + hard-stop instruction", () => {
		assert.ok(r.out.includes("Human review round 1"), r.out);
		assert.ok(r.out.includes(path.join(proj, ".design", "playground.html")), "no playground path in output");
		assert.ok(r.out.includes("END YOUR TURN"));
	});
	check("review: verdict-in-chat instruction", () =>
		assert.ok(r.out.includes("verdict is given in this chat") && r.out.includes("status --stage implement")));
	check("review: lint summary included", () => assert.ok(r.out.includes("DESIGN.md lint")));
	check("review: playground.html generated with all screens", () => {
		const pg = readFileSync(path.join(proj, ".design", "playground.html"), "utf8");
		assert.ok(pg.includes('iframe src="prototype/screens/login.html"'), "screen iframe missing");
		assert.ok(pg.includes('data-w="1280"') && pg.includes('data-w="375"'), "viewport presets missing");
		assert.ok(pg.includes("自查截图") || pg.includes("cmp"), "shot-compare affordance missing");
	});
	check("review: state → review/round 1/no token", () => {
		const s = j("state.json");
		assert.equal(s.stage, "review");
		assert.equal(s.reviewRound, 1);
		assert.equal(s.reviewToken, undefined);
	});
	check("review: no server/decision files created", () => {
		assert.ok(!existsSync(path.join(proj, ".design", "review-server.json")));
		assert.ok(!existsSync(path.join(proj, ".design", "review-round-1.json")));
	});

	// ---- playground: standalone reopen, read-only ----
	r = await run(["playground"]);
	check("playground: regenerates + prints path", () => {
		assert.equal(r.code, 0);
		assert.ok(r.out.includes(path.join(proj, ".design", "playground.html")));
		assert.ok(r.out.includes("Read-only view"));
		assert.equal(j("state.json").stage, "review", "playground must not touch state");
	});

	// ---- chat verdict: approval message maps to stage transition ----
	r = await run(["status", "--stage", "implement"]);
	check("chat approval → status --stage implement", () => assert.equal(j("state.json").stage, "implement"));

	// ---- status persistence + stage guideline re-injection ----
	r = await run(["status", "--stage", "build"]);
	check("status: persists stage", () => assert.equal(j("state.json").stage, "build"));
	check("status: prints stage guideline", () => assert.ok(r.out.includes("[/design workflow active]")));

	// ---- stop ----
	r = await run(["stop"]);
	check("stop: workflow closed", () => {
		const s = j("state.json");
		assert.equal(s.active, false);
		assert.equal(s.stage, "done");
		assert.equal(s.reviewToken, undefined);
		assert.ok(r.out.includes("workflow ended"));
	});

	// ---- removed command + usage ----
	r = await run(["verdict"]);
	check("verdict command removed: exit 1 + usage", () => {
		assert.equal(r.code, 1);
		assert.ok(r.out.includes("usage:"));
	});
	r = await run([]);
	check("no command: usage exit 2", () => assert.equal(r.code, 2) && r.out.includes("usage:"));
} finally {
	killGate();
	try {
		rmSync(proj, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
}

console.log(results.join("\n"));
console.log(failed ? "SMOKE-DSH: FAILED" : "SMOKE-DSH: ALL PASS");
if (failed) process.exit(1);
