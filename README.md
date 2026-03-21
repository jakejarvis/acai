# acai

AI-generated commit messages that match your repo's existing style. Powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex](https://github.com/openai/codex), with real-time streaming as the message is generated.

`acai` reads your repo's recent commit history and adapts to whatever conventions your team already uses — conventional commits, gitmoji, ticket prefixes, pig latin, etc.

> [!NOTE]
> I vibed this up in a day based on my own needs and desires, but am more than willing to accept feedback and PRs!

## How it works

1. Reads the last ~10 commits from your repo's git log
2. Reads your staged diff
3. Sends both to your chosen AI provider, asking it to analyze the repo's commit style and generate a message that matches
4. Presents the message for your approval — you can accept, edit, revise with feedback, regenerate, or copy to clipboard

## Prerequisites

- [Node.js](https://nodejs.org) runtime
- At least one of the following CLIs installed and signed in:

| Provider | Install |
|----------|---------|
| [Claude Code](https://code.claude.com/docs/en/overview) (default) | `curl -fsSL https://claude.ai/install.sh \| bash` |
| [Codex](https://github.com/openai/codex) | `npm i -g @openai/codex` |

## Options

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `-p, --provider` | `ACAI_PROVIDER` | `claude` | AI provider (`claude`, `codex`) |
| `--claude, --codex` | `ACAI_PROVIDER` | `claude` | Shorthand for `--provider <name>` |
| `-m, --model` | `ACAI_MODEL` | `sonnet` or `gpt-5.4-mini` | Model override |
| `-y, --yolo` | — | `false` | Stage all changes and commit without confirmation |
| `-V, --verbose` | — | `false` | Print prompts sent to the provider and raw responses |
| `-v, --version` | — | — | Show version number |

## Usage

From any git repo with staged (or unstaged) changes:

```bash
# Run directly with npx (no install needed)
npx @jakejarvis/acai@latest

# Or install globally
npm install -g @jakejarvis/acai
acai

# Use a different provider
acai --codex
acai -p codex

# Override the model
acai -m haiku
acai --codex -m gpt-5.4-mini

# Stage everything, generate, and commit — no prompts
acai --yolo
```

### The flow

```
┌  acai
│
◇  3 files staged
│
◇  Here's what Claude (sonnet) came up with:
│
│  feat(auth): add session expiry validation
│
◆  What's next?
│  ✓ Commit          — accept and commit
│  ✎ Edit            — open in $EDITOR before committing
│  ↻ Revise          — give feedback and regenerate
│  ⎘ Copy            — copy to clipboard, don't commit
│  ✕ Cancel
│
└  Done.
```

### Revision loop

Choose **Revise** and tell the provider what to change:

```
◆  What should Claude change?
│  make it shorter, drop the scope
│
◇  Here's what Claude (sonnet) came up with:
│
│  feat: add session expiry validation
```

You can revise as many times as you like before committing.

### YOLO mode

Just want to commit and move on? `acai --yolo` stages all changes, generates a message, and commits — zero interaction required.

### No staged changes?

If nothing is staged, the tool will offer to `git add -A` for you.

### How style detection works

There's no manual configuration or pattern matching. The tool passes your recent commit log directly to the AI and asks it to infer the conventions. It picks up on:

- **Format** — conventional commits, gitmoji, `[tag]` prefixes, ticket IDs, freeform
- **Tone** — imperative mood vs past tense, formal vs casual
- **Capitalization** — uppercase vs lowercase subjects
- **Scope** — whether `(scope)` is used in conventional commits
- **Body** — whether commits typically include a body or are subject-only
- **Detail level** — terse one-liners vs detailed descriptions

New repo with no history? It defaults to clean, concise conventional commits.

## License

MIT
