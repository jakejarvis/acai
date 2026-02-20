# git-commit-ai

AI-generated commit messages that **match your repo's existing style** — powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Unlike other AI commit tools that impose a fixed format, `git-commit-ai` reads your repo's recent commit history and tells Claude to match whatever conventions your team already uses — conventional commits, gitmoji, ticket prefixes, freeform, whatever.

## How it works

1. Reads the last ~30 commits from your repo's git log
2. Reads your staged diff
3. Sends both to Claude Code (`claude -p`), asking it to analyze the repo's commit style and generate a message that matches
4. Presents the message for your approval — you can accept, edit, revise with feedback, regenerate, or copy to clipboard

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) installed and authenticated

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code
claude login
```

## Usage

From any git repo with staged (or unstaged) changes:

```bash
# Run directly with bunx (no install needed)
bunx git-commit-ai

# Or install globally
bun install -g git-commit-ai
git-commit-ai
```

### The flow

```
┌  git-commit-ai
│
◇  3 files staged
│
◆  Generating commit message…
│
│  feat(auth): add session expiry validation
│
◆  What do you want to do?
│  ✓ Commit          — accept and commit
│  ✎ Edit            — open in $EDITOR before committing
│  ↻ Revise          — give Claude feedback and regenerate
│  ⟳ Regenerate      — try again from scratch
│  ⎘ Copy            — copy to clipboard, don't commit
│  ✕ Cancel
│
└  Done.
```

### Revision loop

Choose **Revise** and tell Claude what to change:

```
◆  What should Claude change?
│  make it shorter, drop the scope
│
◆  Generating commit message…
│
│  feat: add session expiry validation
```

You can revise as many times as you like before committing.

### No staged changes?

If nothing is staged, the tool will offer to `git add -A` for you.

## How style detection works

There's no manual configuration or pattern matching. The tool passes your recent commit log directly to Claude and asks it to infer the conventions. Claude picks up on:

- **Format** — conventional commits, gitmoji, `[tag]` prefixes, ticket IDs, freeform
- **Tone** — imperative mood vs past tense, formal vs casual
- **Capitalization** — uppercase vs lowercase subjects
- **Scope** — whether `(scope)` is used in conventional commits
- **Body** — whether commits typically include a body or are subject-only
- **Detail level** — terse one-liners vs detailed descriptions

New repo with no history? Claude defaults to clean, concise conventional commits.

## Options

The tool is intentionally zero-config. The only "configuration" is your repo's existing commit history.

If you want to influence the output without changing your repo's style, use the **Revise** option interactively.

## License

MIT
