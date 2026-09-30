# pi-model-prompt-append

Append custom system-prompt guidelines for specific models in
[Pi](https://pi.dev). Advisory instructions, not tool enforcement. Inert
without settings.

## Install

Requires **Pi 0.87.1+** and **Node.js 24+**. Development dependencies pin 0.87.1;
newer Pi versions are intended targets, not a guarantee against upstream API changes.

Install from GitHub; Pi clones it and `pi update --extensions` keeps it current:

```sh
pi install git:github.com/shardrunner/pi-model-prompt-append
```

For development, register a local checkout instead:

```sh
pi install /absolute/path/to/pi-model-prompt-append
```

Pi loads a local package in place (no copy) and this package has no runtime
dependencies, so no `npm install` is needed to use it. Run `/reload` in existing
Pi instances.

## Configure

Global `~/.pi/agent/settings.json`, optional trusted-project `.pi/settings.json`
override (same pattern as privacy-guard: an explicit project rules array
replaces global rules; `[]` disables them).

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

- `models`: model matchers. Each entry matches case-insensitively against the
  bare model id (`gpt-6-astra`) and the qualified `provider/id`
  (`openai/gpt-6-astra`). `*` works as a wildcard. A plain entry without
  `*` also matches as a suffix (`.../gpt-6-astra`). Qualified patterns distinguish
  `openai` from the legacy `openai-codex` provider; bare IDs match either.
- `append`: a single guideline string or an array of them. Each line is pushed
  onto `systemPromptOptions.promptGuidelines`, so it composes with other
  extensions (e.g. privacy-guard) that push their own guidelines.

Rules match the selected `ctx.model` at `before_agent_start`, before physical
routing. With Pi 0.99.0 virtual models, a `jev/auto` rule applies across its
routes; `openai/gpt-6-astra` does not match just because it is a route target.
Rules are not reevaluated for each routed request.

No settings -> no rules -> extension is inert (defaults empty). Invalid
settings report an extension error; no guidelines are applied. The handler is
push-only: it never replaces `promptGuidelines`, so concurrent appenders keep
working regardless of handler order.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

The small offline suite exercises the extension handler with mocked
Pi/configuration APIs, without invoking a provider. Only the entry point,
README, and license ship. No build step is needed; Pi supplies its SDK at
runtime.

[MIT](LICENSE) © 2026 Michael Brunner.
