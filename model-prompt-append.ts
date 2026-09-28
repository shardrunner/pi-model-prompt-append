/**
 * model-prompt-append.ts
 *
 * Append custom system-prompt guidelines for specific models.
 *
 * Settings (global `~/.pi/agent/settings.json`, optional project `.pi/settings.json`
 * override when the project is trusted — same pattern as privacy-guard.ts):
 *
 * ```json
 * {
 *   "modelPromptAppend": {
 *     "rules": [
 *       {
 *         "models": ["*gpt-6*"],
 *         "append": "Do not use subagents unless instructed."
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * - `models`: model matchers. Each entry matches case-insensitively against the
 *   bare model id (`gpt-6-astra`) and the qualified `provider/id`
 *   (`openai-codex/gpt-6-astra`). `*` works as a wildcard. A plain entry without
 *   `*` also matches as a suffix (`.../gpt-6-astra`), mirroring privacy-guard.ts.
 * - `append`: a single guideline string or an array of them. Each line is pushed
 *   onto `systemPromptOptions.promptGuidelines`, so it composes with other
 *   extensions (e.g. privacy-guard.ts) that push their own guidelines.
 *
 * No settings -> no rules -> extension is inert (defaults empty).
 * Invalid settings report an extension error; no guidelines are applied.
 * These are advisory instructions, not tool enforcement.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface AppendRule {
	models: string[];
	append: string | string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readRules(path: string): AppendRule[] | undefined {
	try {
		const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isObject(settings)) throw new Error("settings must be an object");
		const config = settings.modelPromptAppend;
		if (config === undefined) return undefined;
		if (!isObject(config)) throw new Error("modelPromptAppend must be an object");
		if (config.rules === undefined) return undefined;
		if (!Array.isArray(config.rules)) throw new Error("modelPromptAppend.rules must be an array");
		return config.rules.map((rule: unknown, index) => {
			if (
				!isObject(rule) ||
				!isStringArray(rule.models) ||
				!(typeof rule.append === "string" || isStringArray(rule.append))
			) {
				throw new Error(
					`modelPromptAppend.rules[${index}] requires models: string[] and append: string | string[]`,
				);
			}
			return { models: rule.models, append: rule.append };
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw new Error(`${path}: ${(error as Error).message}`, { cause: error });
	}
}

function loadRules(cwd: string, trusted: boolean): AppendRule[] {
	const dir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const global = readRules(join(dir, "settings.json"));
	const project = trusted ? readRules(join(cwd, CONFIG_DIR_NAME, "settings.json")) : undefined;
	// An explicit project rules array replaces global rules; [] disables them.
	return project ?? global ?? [];
}

function globToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`, "i");
}

function matchesModel(
	ctx: { model?: { provider: string; id: string } },
	pattern: string,
): boolean {
	if (!ctx.model) return false;
	const full = `${ctx.model.provider}/${ctx.model.id}`;
	const id = ctx.model.id;
	if (pattern.includes("*")) {
		const re = globToRegExp(pattern);
		return re.test(full) || re.test(id);
	}
	const lowerPattern = pattern.toLowerCase();
	return (
		lowerPattern === full.toLowerCase() ||
		lowerPattern === id.toLowerCase() ||
		full.toLowerCase().endsWith(`/${lowerPattern}`)
	);
}

function appendsOf(rule: AppendRule): string[] {
	if (typeof rule.append === "string") return rule.append.trim() ? [rule.append] : [];
	return rule.append.filter((s) => s.trim() !== "");
}

export default function (pi: ExtensionAPI) {
	// Push-only: never replaces promptGuidelines, so concurrent appenders
	// (e.g. privacy-guard.ts advisory) keep working regardless of handler order.
	pi.on("before_agent_start", async (event, ctx) => {
		const rules = loadRules(ctx.cwd, ctx.isProjectTrusted());
		if (rules.length === 0 || !ctx.model) return;
		for (const rule of rules) {
			if (!rule.models.some((m) => matchesModel(ctx, m))) continue;
			for (const line of appendsOf(rule)) {
				if (!event.systemPromptOptions.promptGuidelines.includes(line)) {
					event.systemPromptOptions.promptGuidelines.push(line);
				}
			}
		}
	});
}
