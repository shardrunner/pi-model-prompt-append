import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Exercise the single-file extension without loading Pi or calling a provider.
const source = stripTypeScriptTypes(
	readFileSync(new URL("./model-prompt-append.ts", import.meta.url), "utf8"),
)
	.replace(/^import .*;$/gm, "")
	.replace(/export default function\s*\(pi\s*\)/, "function register(pi)");

const rule = (models: unknown = ["*"], append: unknown = "Guideline") => ({ models, append });
const config = (rules: unknown) => JSON.stringify({ modelPromptAppend: { rules } });

function harness(global: unknown, project?: unknown) {
	let handler: (event: unknown, ctx: unknown) => Promise<void>;
	const files = new Map<string, string | Error>([
		["/agent/settings.json", global as string],
		["/project/.pi/settings.json", project as string],
	]);
	if (global === undefined) files.delete("/agent/settings.json");
	if (project === undefined) files.delete("/project/.pi/settings.json");
	const sandbox: Record<string, any> = {
		process: { env: { PI_CODING_AGENT_DIR: "/agent" } },
		homedir: () => "/home/test",
		join,
		CONFIG_DIR_NAME: ".pi",
		readFileSync(path: string) {
			const value = files.get(path);
			if (value instanceof Error) throw value;
			if (value === undefined) throw Object.assign(new Error("Missing"), { code: "ENOENT" });
			return value;
		},
	};
	vm.createContext(sandbox);
	vm.runInContext(source, sandbox);
	(sandbox.register as (pi: unknown) => void)({ on: (_: string, fn: typeof handler) => { handler = fn; } });
	return async ({ trusted = false, provider = "openai-codex", id = "gpt-6-astra", guidelines = [] }: { trusted?: boolean; provider?: string; id?: string; guidelines?: string[] } = {}) => {
		await handler!(
			{ systemPromptOptions: { promptGuidelines: guidelines } },
			{ cwd: "/project", isProjectTrusted: () => trusted, model: { provider, id } },
		);
		return guidelines;
	};
}

test("literal and wildcard matching are case insensitive", async () => {
	for (const pattern of ["GPT-6-ASTRA", "OPENAI-CODEX/GPT-6-ASTRA", "*GPT-6*"]) {
		assert.deepEqual(await harness(config([rule([pattern])]))(), ["Guideline"]);
	}
});

test("virtual selection matches its ID, provider and wildcard rules, not physical targets", async () => {
	const run = harness(config([
		rule(["auto"], "Virtual ID"),
		rule(["jev/auto"], "Virtual selection"),
		rule(["*"], "Any selection"),
		rule(["*gpt-6*", "openai/gpt-6-astra"], "Physical target"),
	]));
	assert.deepEqual(await run({ provider: "jev", id: "auto" }), [
		"Virtual ID", "Virtual selection", "Any selection",
	]);
});

test("missing settings are inert; project rules require trust and replace global rules", async () => {
	assert.deepEqual(await harness(undefined)(), []);
	const run = harness(config([rule()]), config([]));
	assert.deepEqual(await run(), ["Guideline"]);
	assert.deepEqual(await run({ trusted: true }), []);
	assert.deepEqual(await harness(config([rule()]), "{broken")(), ["Guideline"]);
});

test("preserves other guidelines, deduplicates, and reevaluates the model", async () => {
	const run = harness(config([rule(["gpt-6-astra"], ["Existing", "New", " "]), rule(["*gpt*"], "New")]));
	assert.deepEqual(await run({ guidelines: ["Existing"] }), ["Existing", "New"]);
	assert.deepEqual(await run({ id: "other" }), []);
});

test("malformed rules report their location before any prompt mutation", async () => {
	for (const invalid of [rule("*"), rule([42]), null, rule(["*"], [42])]) {
		const guidelines = ["Existing"];
		await assert.rejects(harness(config([rule(), invalid]))({ guidelines }), /\/agent\/settings.json.*rules\[1\]/);
		assert.deepEqual(guidelines, ["Existing"]);
	}
});

test("invalid configuration is not treated as missing", async () => {
	for (const invalid of ["{broken", config("typo"), '{"modelPromptAppend":42}']) {
		await assert.rejects(harness(invalid)(), /\/agent\/settings.json/);
	}
	await assert.rejects(harness(Object.assign(new Error("Denied"), { code: "EACCES" }))(), /\/agent\/settings.json.*Denied/);
	await assert.rejects(harness(config([rule()]), config("typo"))({ trusted: true }), /\/project\/\.pi\/settings.json/);
});
