/**
 * Detached review-server child process.
 *
 * Spawned by design_review so the human gate survives the pi process exiting
 * (print/text one-shot modes, RPC hosts, or the user simply quitting). Node's
 * native type stripping (>= 23) runs this .ts directly — no build step.
 *
 *   node review-server-main.ts '<json args>'
 *
 * Writes <readyFile> once listening and <decisionFile> when the human decides;
 * the running session polls the decision file, and the next session picks up
 * anything that arrived in between.
 */
import { writeFileSync } from "node:fs";
import { startReviewServer } from "./server.ts";

interface ChildArgs {
	designDir: string;
	screens: string[];
	viewport: { width: number; height: number };
	round: number;
	target: string;
	latestShots?: Record<string, string> | undefined;
	/** Workflow-stable token (stable review URL across rounds). */
	token?: string | undefined;
	/** Preferred port (fixed by default; the binder walks when occupied). */
	port?: number | undefined;
	decisionFile: string;
	readyFile: string;
}

const raw = process.argv[2];
if (!raw) {
	console.error("usage: node review-server-main.ts <json-args>");
	process.exit(2);
}
const args = JSON.parse(raw) as ChildArgs;

const handle = await startReviewServer({
	designDir: args.designDir,
	screens: args.screens,
	viewport: args.viewport,
	round: args.round,
	target: args.target,
	latestShots: args.latestShots,
	token: args.token,
	port: args.port,
	onDecision: (decision, comment) => {
		try {
			writeFileSync(
				args.decisionFile,
				`${JSON.stringify(
					{ decision, comment, round: args.round, at: new Date().toISOString() },
					null,
					"\t",
				)}\n`,
				"utf8",
			);
		} catch {
			/* best effort */
		}
	},
});

writeFileSync(
	args.readyFile,
	`${JSON.stringify(
		{ url: handle.url, token: handle.token, port: handle.port, pid: process.pid },
		null,
		"\t",
	)}\n`,
	"utf8",
);
