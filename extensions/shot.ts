/**
 * Headless screenshot engine.
 *
 * Path 1 (preferred): playwright-core driving the user's installed Chrome via
 *   channel:"chrome" — no browser download required, precise viewport/font waits.
 * Path 2 (fallback): raw `chrome --headless --screenshot` through the host's
 *   exec — zero npm runtime deps.
 *
 * Both paths only ever need a system Chrome/Edge/Chromium binary.
 */
import { existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/** Minimal structural type satisfied by pi.exec(). */
export type ExecFn = (
	command: string,
	args: string[],
	options?: { timeout?: number; cwd?: string; signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;

export interface ShotOptions {
	/** Absolute path of the HTML file to render. */
	htmlFile: string;
	/** Absolute output file. Use .jpg for playwright (smaller); raw chrome always writes PNG. */
	outFile: string;
	viewport: { width: number; height: number };
	exec: ExecFn;
	/**
	 * Capture the page at this time offset after load (ms) — the tool for
	 * self-reviewing an animation MID-FLIGHT (e.g. 150). Default: wait for
	 * entrance animations to settle before shooting (deterministic end state).
	 */
	atMs?: number;
	/** Settle wait when atMs is not given. Default 1200ms; 0 disables. */
	settleMs?: number;
	signal?: AbortSignal | undefined;
	/** Overall timeout per engine attempt. Default 30s. */
	timeoutMs?: number;
	/** Engine order for tests. Default: playwright first, then raw chrome. */
	engines?: Array<"playwright" | "chrome">;
}

export interface ShotResult {
	file: string;
	width: number;
	height: number;
	engine: "playwright-chrome" | "chrome-headless";
	mimeType: string;
}

const CHROME_CANDIDATES: Record<string, string[]> = {
	darwin: [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	],
	linux: [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/microsoft-edge",
	],
	win32: [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	],
};

export function findChromeBinary(): string | undefined {
	const custom = process.env.PI_DESIGN_CHROME;
	if (custom && existsSync(custom)) return custom;
	const candidates = CHROME_CANDIDATES[process.platform] ?? [];
	return candidates.find((c) => existsSync(c));
}

async function shootWithPlaywright(opts: ShotOptions): Promise<ShotResult> {
	const { chromium } = await import("playwright-core");
	const channels = ["chrome", "msedge"] as const;
	let lastError: unknown;
	for (const channel of channels) {
		let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
		try {
			browser = await chromium.launch({ channel, headless: true });
			const context = await browser.newContext({
				viewport: opts.viewport,
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			const url = pathToFileURL(opts.htmlFile).href;
			await page.goto(url, { waitUntil: "networkidle", timeout: opts.timeoutMs ?? 30_000 });
			// String expression: waits for document.fonts.ready without pulling DOM types in.
			await page.evaluate("document.fonts.ready");
			// Deterministic timing: either an explicit mid-animation offset or a
			// settle wait so entrance animations land in their end state.
			const waitMs = opts.atMs ?? opts.settleMs ?? 1200;
			if (waitMs > 0) await page.waitForTimeout(waitMs);
			const type = opts.outFile.endsWith(".png") ? "png" : "jpeg";
			await page.screenshot({
				path: opts.outFile,
				type,
				...(type === "jpeg" ? { quality: 80 } : {}),
			});
			await context.close();
			return {
				file: opts.outFile,
				width: opts.viewport.width,
				height: opts.viewport.height,
				engine: "playwright-chrome",
				mimeType: type === "png" ? "image/png" : "image/jpeg",
			};
		} catch (error) {
			lastError = error;
		} finally {
			await browser?.close().catch(() => {});
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runChromeOnce(
	binary: string,
	opts: ShotOptions,
	headlessArgs: string[],
): Promise<void> {
	const url = pathToFileURL(opts.htmlFile).href;
	const execOptions: { timeout: number; signal?: AbortSignal } = { timeout: opts.timeoutMs ?? 30_000 };
	if (opts.signal) execOptions.signal = opts.signal;
	await opts.exec(
		binary,
		[
			...headlessArgs,
			"--disable-gpu",
			"--hide-scrollbars",
			"--force-device-scale-factor=1",
			`--window-size=${opts.viewport.width},${opts.viewport.height}`,
			`--screenshot=${opts.outFile}`,
			// Virtual time fast-forwards to the requested offset (or a settle
			// budget): atMs captures an animation frame at ~t=atMs.
			`--virtual-time-budget=${opts.atMs ?? 4000}`,
			url,
		],
		execOptions,
	);
}

async function shootWithChrome(opts: ShotOptions): Promise<ShotResult> {
	const binary = findChromeBinary();
	if (!binary) {
		throw new Error(
			"No Chrome/Edge/Chromium binary found. Install Google Chrome, or set PI_DESIGN_CHROME to point at an executable.",
		);
	}
	mkdirSync(path.dirname(opts.outFile), { recursive: true });
	// Newer Chrome uses --headless=new; older ones only accept --headless.
	for (const headlessArgs of [["--headless=new"], ["--headless"]]) {
		await runChromeOnce(binary, opts, headlessArgs);
		if (existsSync(opts.outFile)) {
			return {
				file: opts.outFile,
				width: opts.viewport.width,
				height: opts.viewport.height,
				engine: "chrome-headless",
				mimeType: "image/png",
			};
		}
	}
	throw new Error(
		`chrome screenshot failed (${binary}). Its stderr may appear above; make sure this browser can run headless.`,
	);
}

export async function captureScreenshot(opts: ShotOptions): Promise<ShotResult> {
	const engines = opts.engines ?? ["playwright", "chrome"];
	const errors: string[] = [];
	for (const engine of engines) {
		if (opts.signal?.aborted) throw new Error("cancelled");
		try {
			const result =
				engine === "playwright" ? await shootWithPlaywright(opts) : await shootWithChrome(opts);
			if (existsSync(result.file)) return result;
			errors.push(`${engine}: output file was not produced`);
		} catch (error) {
			errors.push(`${engine}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	throw new Error(`All screenshot engines failed.\n${errors.join("\n")}`);
}
