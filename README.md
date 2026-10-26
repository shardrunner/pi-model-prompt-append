# pi-model-prompt-append

> **Disclaimer:** This extension is vibe coded for personal use. Use at your own risk.

Keep model-specific preferences out of your prompts. This [Pi](https://pi.dev)
extension adds configured system-prompt guidelines whenever the selected model
matches a rule.

## Why

- Some models need standing instructions that others don't (for example "don't use subagents"). Repeating them in every prompt is tedious and easy to forget.

## Features

- Model rules with wildcards. A rule can match the bare model ID or `provider/id`.
- Global settings, with an optional override for trusted projects.
- Only adds guidelines and never replaces existing ones, so it works alongside other
  extensions that add their own.
- Does nothing until configured. Invalid settings are reported, not silently ignored.

## Installation

Requires **Pi 0.87.1+** and **Node.js 24+**.

```sh
pi install git:github.com/shardrunner/pi-model-prompt-append
```

Run `/reload` in open Pi sessions. Update with `pi update --extensions`.
For local development, install a checkout instead
(`pi install /absolute/path/to/pi-model-prompt-append`). No runtime dependencies,
no build step.

## Usage

Add rules to your settings (see below). From the next agent run onward, every matching
model gets the configured guidelines in its system prompt.

## Configuration

Add rules to the global `~/.pi/agent/settings.json`. A trusted project's
`.pi/settings.json` can override them: a project `rules` array replaces the global one,
and `[]` turns them off.

```json
{
  "modelPromptAppend": {
    "rules": [
      {
        "models": ["*gpt-6*"],
        "append": "Do not use subagents unless instructed."
      }
    ]
  }
}
```

- `models`: matched case-insensitively against the bare model ID (`gpt-6-astra`) and
  `provider/id` (`openai/gpt-6-astra`). `*` is a wildcard. An entry without `*` also
  matches as a suffix. `provider/id` patterns tell `openai` apart from `openai-codex`;
  bare IDs match both.
- `append`: one guideline string, or an array of them. Each line is added to
  `systemPromptOptions.promptGuidelines`.

## Behavior and limitations

- Guidelines are instructions to the model, not enforced rules.
- Rules are checked against the selected model when the agent starts, before routing.
  With Pi 0.99.0 virtual models, a rule for `jev/auto` applies to every model it routes
  to, but a rule for `openai/gpt-6-astra` does not match just because that model is one
  of the routes. Rules are not rechecked for each routed request.
- Without settings, the extension does nothing. With invalid settings, it reports an
  extension error and adds no guidelines.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

Requires Node.js 24+. The offline test suite runs the extension with mocked Pi and
settings APIs and makes no provider calls. Only the entry point, README and license are
published.

## License

[MIT](LICENSE) © 2026 Michael Brunner
